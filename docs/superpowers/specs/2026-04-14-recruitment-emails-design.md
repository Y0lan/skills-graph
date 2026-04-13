# Recruitment Email Notifications — Design Spec

## Context

Candidates who apply through sinapse.nc (Drupal webhook) and those who get declined receive no email communication. This creates a black hole experience. We add two email notifications to close the loop.

## Emails

### 1. Application Received

**Trigger**: End of `processIntake()` in `server/lib/intake-service.ts`, after candidate + candidature created. Drupal webhook path only — manual creation does NOT trigger this.

**Condition**: Candidate has an email address.

**Recipients**:
- Candidate: confirmation that their application was received
- Lead (derived from `created_by` slug → `{slug}.@sinapse.nc`): notification of new application

**Subject (candidate)**: `Candidature reçue — {role} chez SINAPSE`
**Subject (lead)**: `Nouvelle candidature : {name} — {role}`

### 2. Candidate Declined

**Trigger**: Status transition to `refuse` in `server/routes/recruitment.ts`, after the transition is committed.

**Condition**: Candidate has an email address.

**Recipients**:
- Candidate: notification that their application is no longer being considered
- Lead: confirmation that the decline was processed

**Subject (candidate)**: `Votre candidature — {role} chez SINAPSE`
**Subject (lead)**: `Candidature refusée : {name} — {role}`

**Configurable reason**: New optional field `includeReasonInEmail: boolean` on the PATCH status endpoint. When true, the recruiter's `notes` are included in the candidate email. Default: false.

## Implementation

### Backend — `server/lib/email.ts`

Add two new functions following the existing `sendCandidateInvite` / `sendCandidateSubmitted` pattern:

```typescript
sendApplicationReceived({ to, candidateName, role, leadEmail })
sendCandidateDeclined({ to, candidateName, role, leadEmail, reason?, includeReason? })
```

Both send two emails (candidate + lead). Non-blocking — errors logged, don't interrupt workflow. Use existing Resend client and `escapeHtml()`.

### Backend — `server/lib/intake-service.ts`

At the end of `processIntake()`, after candidate creation succeeds and if `candidate.email` exists, call `sendApplicationReceived()`.

### Backend — `server/routes/recruitment.ts`

In the PATCH status handler, when `newStatut === 'refuse'` and candidate has email, call `sendCandidateDeclined()`. Pass `includeReasonInEmail` from request body.

### Frontend — Status transition dialog

In the decline flow UI (where the recruiter enters notes for refuse), add a checkbox: "Inclure le motif dans l'email au candidat". Maps to `includeReasonInEmail` in the PATCH payload. Default: unchecked.

### Email template style

Match existing templates: inline CSS, SINAPSE branding, approachable French tone. User will review and tweak copy before shipping.

## Files to modify

- `server/lib/email.ts` — add 2 new email functions (4 templates total: 2 candidate, 2 lead)
- `server/lib/intake-service.ts` — call `sendApplicationReceived` after intake
- `server/routes/recruitment.ts` — call `sendCandidateDeclined` on refuse transition, accept `includeReasonInEmail`
- Frontend status transition component — add checkbox for include reason

## Verification

1. Test Drupal webhook intake with email → candidate + lead both receive application email
2. Test decline transition with `includeReasonInEmail: false` → candidate gets generic decline
3. Test decline transition with `includeReasonInEmail: true` → candidate gets decline with reason
4. Test without email → no crash, no email sent
5. Test with missing `RESEND_API_KEY` → graceful fallback to console log

# ADR — Authorization & audit semantics for the recruitment module

**Date:** 2026-04-20
**Status:** Accepted
**Supersedes:** none

## Context

The recruitment module has grown a stack of write paths (status transitions,
document upload/rename/delete/restore, scan overrides, status revert, candidate
delete). Most of them are gated behind a single `requireLead` middleware which
checks whether the caller's `user.slug` is in a hardcoded list of three:

```ts
// server/middleware/require-lead.ts
const RECRUITMENT_LEADS = ['yolan-maldonado', 'olivier-faivre', 'guillaume-benoit']
```

That worked for the current prod deployment (one cluster, three trusted leads,
no external recruiters) but it doesn't scale to:

- **SSE per-candidature streams (Item 8)** — anyone in `RECRUITMENT_LEADS` can
  subscribe to any candidature today; that's fine, but the codepath should use
  a named helper so we can tighten later.
- **Future external recruiters (cabinets SEYOS / Altaïde)** — design doc §13
  reserves a `external_recruiter` role with read-only access to recruitment +
  no team-data access.
- **Read-only Franck SAVALLE** — design doc §13 lists him as co-décideur with
  read-only consultation rights. Today he'd need full lead access to read.

## Decision

**Today (this campaign):** keep the three-name hardcoded list. Don't introduce
roles we don't need yet — premature flexibility. Codex correctly noted (review
of `87a22fc`) that "no admin model exists" and many subtasks said "admin"
without a role to back it; that wording is wrong, not the design. **All actions
described as "admin only" in TODOs are in fact "lead only" today.**

**Tomorrow (when the cohort grows):** roles in DB.

```sql
-- Schema additions (NOT shipped today, design only)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'lead'
  CHECK(role IN ('lead', 'lead_readonly', 'external_recruiter', 'admin'));
```

## Permission helper contract

To prevent the "every endpoint reimplements the access rule" trap, ship one
helper now, even though it's a no-op wrapper around `requireLead`:

```ts
// server/middleware/can-access-candidature.ts
export function canAccessCandidature(req: Request, candidatureId: string): boolean {
  const user = (req as Request & { user: AuthUser }).user
  if (!isRecruitmentLead(user?.slug)) return false
  // TODO: in the future, restrict by pôle / by external recruiter contract.
  return true
}
```

Items 8 (SSE stream), 15 (revert), 16 (preview), 9 (scan override) MUST use
this helper instead of direct `requireLead` so the future restriction lands in
one place.

## Audit trail standard

Every state-changing action writes a `candidature_events` row with:

- `type` — one of the existing enum values
- `created_by` — the user slug taking the action (NEVER 'system' for human-
  initiated actions)
- `notes` — French human-readable, includes the WHY when an action is
  destructive (skip-email reason, scan override reason, revert reason)

Already enforced in shipped code; this ADR ratifies the pattern.

## Skip-email reason rule (Item 16)

When a recruiter advances a status WITHOUT sending the candidate email
(via the Item 16 "Avancer sans e-mail" button), the skip MUST include a
mandatory reason ≥ 10 chars logged to `candidature_events.notes` as
`Email non envoyé — raison: <reason>`. Backend rejects empty reasons with
HTTP 400.

## Compensation email pattern (Item 15)

When reverting a status whose forward step already sent a candidate email,
the recruiter MUST be presented with three options:

1. Send a correction email immediately (template: "Correction — votre
   candidature reste à l'étape X")
2. Don't send (recruiter will follow up manually)
3. Cancel the revert

The choice is logged: `candidature_events.notes = 'Annulation + email
correction envoyé' | 'Annulation sans email correction (suivi manuel)'`.

## Out of scope

- OAuth-style scopes per candidature
- Attribute-based access control
- Pôle-specific lead restrictions (deferred until 4+ leads exist)

## References

- `87a22fc` — multi-poste candidate dedup that surfaced these gaps via codex review
- `e48b526` — self-eval form union (uses `getCategoriesForCandidate` not direct role check)
- `ea1ad32` — initial codex fixes (where the term "admin" was clarified as "lead")

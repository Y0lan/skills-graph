# ADR — Data retention, export, and erasure for recruitment-sensitive stores

**Date:** 2026-04-20
**Status:** Accepted
**References:** Design doc §16 (RGPD / IA Act compliance)

## Context

Design §16 sets retention to **"durée de la campagne + 2 ans"** for candidate
PII, AI output, and notes. As the recruitment module grows, several new stores
need explicit retention windows:

| Store | Current retention | Sensitivity |
|---|---|---|
| `candidates` (PII, CV text) | Campaign + 2y (§16) | High |
| `candidatures` + `candidature_events` | Campaign + 2y (§16) | Medium |
| `candidature_documents` (CV/lettre/ABORO PDFs) | Campaign + 2y (§16) | High |
| `aboro_profiles` (extracted SWIPE) | Campaign + 2y (§16) | High |
| `evaluations` (team self-eval) | Campaign + 2y (§16) | Medium |
| **NEW: `candidate_extractions`** (Item 2/12 — raw + parsed JSON, source spans) | TBD by this ADR | High |
| **NEW: `candidate_field_overrides`** (Item 2 — per-field locks) | TBD by this ADR | Low |
| **NEW: `scan_overrides`** (Item 9 — already shipped) | 30d expiry on each row | Low |
| **NEW: VirusTotal raw scan payloads** in `candidature_documents.scan_result` | TBD by this ADR | **Third-party DPA risk** |
| **NEW: `queued_emails`** (Item 16 — if persisted) | TBD by this ADR | Medium (contains PII in body) |
| **NEW: AI email drafts** (Item 18 — recruiter-edited bodies in `candidature_events`) | TBD by this ADR | Medium |

## Decision

### Retention windows

| Store | Retention | Trigger |
|---|---|---|
| `candidate_extractions` | Same as parent candidate | Cascade delete on candidate delete |
| `candidate_field_overrides` | Same as parent candidate | Cascade delete on candidate delete |
| `scan_overrides` | 365d max (per-row `expires_at`) | TTL job nightly |
| VirusTotal raw payloads (`scan_result.vt_engines`) | 90d | TTL job: clear VT-specific JSON keys, keep summary |
| `queued_emails` | Auto-delete on send + 30d for failed | TTL job daily |
| AI email drafts (in events.notes) | Same as candidate | Cascade |

### VirusTotal third-party concern

**Codex flagged**: VT scanning sends candidate document content to a third
party. Today this is unconditional in `server/lib/document-scanner.ts`. Per
RGPD principle of data minimisation:

**Decision:** keep VT scanning as-is for now (already in production, scan
findings are valuable, no incident reported). When a DPA review formalises
the third-party processor list, document VT and add a per-document opt-out
flag (`scan_with_vt: boolean`, default true). **No code change today.**

The full VT payload IS persisted (Item 9 enrichment will land it). 90-day
TTL keeps the storage cost low and limits the GDPR-blast-radius window.

### Export format (right of access)

Per §16, candidate has the right to export everything we hold on them. Today
this is manual via `contact@sinapse.nc`. Define the JSON shape now so it's
ready when the request comes:

```ts
// scripts/export-candidate.mjs <candidateId>
{
  candidate: { id, name, email, ... },
  candidatures: [{ id, statut, ... }],
  documents: [{ id, type, filename, scan_status, ... }],  // metadata, not blobs
  events: [{ id, type, statut_to, notes, ... }],
  aboro_profiles: [{ profile_json, ... }],
  extractions: [{ run_id, parsed_output, ... }],
  exported_at, export_version: 1
}
```

Document blobs are exported separately as a ZIP via the existing
`/api/recruitment/candidatures/:id/documents/zip` endpoint. (We have a
candidate-level dump for `_resume.txt` already.)

### Hard-delete trigger (right of erasure)

Today: `DELETE /api/candidates/:id` cascade-deletes everything via FK.
After this ADR: same behavior, but additionally:

- The `aboro_profiles` rows are FK-cascade-deleted (verify migration).
- The `candidate_extractions` and `candidate_field_overrides` (when shipped)
  cascade.
- GCS document blobs are best-effort unlinked (already done).
- VT cached results in `scan_result` JSON are removed via the cascade.

A new `scripts/hard-delete-candidate.mjs <candidateId> --confirm` wraps this
with audit logging to a dedicated `gdpr_actions` JSONL file (NOT in the DB,
since the DB row is what we're erasing). Stub created, not implemented today.

### Soft-delete vs hard-delete

- Document soft-delete (Item 3, shipped) keeps the row tombstoned for 30d
  with audit trail. After 30d the GC purges (script committed, cron not yet
  scheduled — separate work).
- Candidate-level GDPR erasure is HARD delete via the cascade above. Soft-
  delete on candidates would defeat the right of erasure.

## Out of scope

- Automated retention enforcement (nightly TTL job) — designed here, scheduled
  in a follow-up infrastructure PR.
- Pseudonymisation for analytics retention beyond 2y — defer until
  analytics needs justify it.
- Cross-border data transfer review (Anthropic API + VT) — design doc §16
  already declares Anthropic as a sub-processor with no data retention; VT
  needs the same statement.

## What this ADR locks in for new code

Item 2 / 12 implementations MUST:

- Cascade-delete `candidate_extractions` on candidate delete.
- NOT store full CV text in `parsed_output` (already in `candidates.cv_text`).
- NOT log raw extraction JSON outside the `candidate_extractions` table.

Item 16 implementation MUST:

- Use Resend's `scheduled_at` (no in-process queue) so we never persist
  email body PII outside `candidature_events.email_snapshot`.

Item 18 implementation MUST:

- NOT train any model on recruiter edits.
- Log only the AI-generated body shape, not the recruiter's edited body
  diff (the final body lands in `candidature_events.email_snapshot` already).

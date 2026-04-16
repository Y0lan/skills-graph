# TODOs

## Visualization
- [ ] **Role-type filtering on radar comparison** — Separate Business Analyst profiles from Technical profiles on the radar graph. Comparing a BA's soft skills with a dev's technical skills on the same axes makes neither profile look good. The role_categories mapping already exists in db.ts. The radar chart could filter by role type or show role-relevant categories only. Independent of extraction changes.

## Security & Reliability (from Codex adversarial review, 2026-04-16)

- [x] **Resend webhook unreachable (403)** — Fixed: moved webhook route before `protectedRouter.use()` mount in `server/routes/recruitment.ts`.

- [x] **Reopen endpoint auth gap** — Fixed: replaced broad `startsWith('/evaluate/')` exclusion with precise regex matching only `/form`, `/ratings`, `/submit` paths in `server/index.ts`.

- [x] **Evaluation autosave race condition** — Fixed: atomic CAS with `WHERE version = ? AND submitted_at IS NULL` in `server/routes/evaluate.ts`. Also hardened submit path and auto-advance with CAS.

- [x] **Status change not compare-and-swap** — Fixed: added `AND statut = ?` to UPDATE with conflict detection (409) in `server/routes/recruitment.ts`. Side effects gated on successful CAS.

- [x] **Refuse sends double email** — Fixed: added `skipCandidateEmail` option to `sendCandidateDeclined` in `server/lib/email.ts`. Lead notification decoupled from candidate email existence.

- [x] **Document filename collision** — Fixed: prepend 8-char UUID to stored filename in `server/lib/document-service.ts`.

- [x] **Content-Disposition header injection** — Fixed: RFC 5987 encoding + ASCII fallback in `server/routes/recruitment.ts`.

- [ ] **Dev/prod share GKE namespace + GCP identity** — Manifests ready but reverted (deploy failed without GCP prerequisites). Before re-applying: 1) create namespace `public-webapp-dev`, 2) create GCP SA `skill-radar-dev@premier-socle-sinapse.iam.gserviceaccount.com`, 3) bind workload identity, 4) copy secrets to new namespace, 5) separate Litestream bucket prefix.

- [x] **Intake retries abandon failed side effects** — Fixed: redelivered webhooks now check and retry missing document uploads, CV extraction, and candidate notes in `server/lib/intake-service.ts`. Email intentionally not retried.

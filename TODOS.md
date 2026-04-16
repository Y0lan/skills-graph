# TODOs

## Visualization
- [ ] **Role-type filtering on radar comparison** — Separate Business Analyst profiles from Technical profiles on the radar graph. Comparing a BA's soft skills with a dev's technical skills on the same axes makes neither profile look good. The role_categories mapping already exists in db.ts. The radar chart could filter by role type or show role-relevant categories only. Independent of extraction changes.

## Security & Reliability (from Codex adversarial review, 2026-04-16)

- [ ] **Resend webhook unreachable (403)** — Router middleware ordering: `protectedRouter` mounts on `/` before the public webhook route, so unauthenticated Resend calls hit `requireLead` first. The auth bypass in `server/index.ts:123` never helps because the router-level middleware runs first. Fix: move webhook route before `protectedRouter.use(requireLead)` in `server/routes/recruitment.ts`.

- [ ] **Reopen endpoint auth gap** — `POST /api/evaluate/:id/reopen` uses `requireLead` but the global auth gate skips all `/evaluate/*` paths, so `req.user` is never populated. Fix: either move reopen to the recruitment router, or add explicit auth for this route.

- [ ] **Evaluation autosave race condition** — `PUT /:id/ratings` does read-before-write without `WHERE version = ?` on the UPDATE. Two concurrent autosaves both succeed. A slow autosave can overwrite a just-submitted evaluation. Fix: add `WHERE version = ? AND submitted_at IS NULL` to the UPDATE.

- [ ] **Status change not compare-and-swap** — Two recruiters can move the same candidature to incompatible states simultaneously. Fix: add `WHERE statut = ?` (expected current status) to the UPDATE.

- [ ] **Refuse sends double email** — `PATCH /status` sends a transition email via `sendTransitionEmail()`, then immediately calls `sendCandidateDeclined()` which sends another refusal email. Candidate receives two rejection emails. Fix: remove one of the two sends.

- [ ] **Document filename collision** — Uploading `cv.pdf` twice overwrites the first file on disk while both DB rows remain. Old downloads serve new bytes. Fix: append timestamp or UUID to stored filename.

- [ ] **Content-Disposition header injection** — `server/routes/recruitment.ts:756` interpolates candidate-controlled filename directly into header. Fix: use RFC 5987 encoding.

- [ ] **Dev/prod share GKE namespace + GCP identity** — Both deployments use `public-webapp` namespace and same workload identity. A dev compromise can reach prod backup objects via Litestream bucket. Fix: separate namespaces and service accounts.

- [ ] **Intake retries abandon failed side effects** — Redelivered webhooks return `updated: true` without retrying failed document saves, CV extraction, or receipt emails. Fix: track completion state per side effect.

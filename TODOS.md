# TODOs

## Visualization
- [x] **Role-type filtering on radar comparison** — Shipped via ranked-list redesign (docs/superpowers/plans/2026-04-17-role-type-filtering-radar.md). New endpoint `GET /api/recruitment/postes/:id/comparison`, role-aware radar axes, gap chips, row actions (Préselectionner / Refuser).

### Follow-ups from role filtering plan
- [ ] **Role categories editor UI** — Admin-only screen to manage `role_categories` mapping. Needed before many new roles get added; currently seed-only.
- [ ] **Weighted category importance** — must-have vs nice-to-have per role. Currently all role categories are weighted equally for the gap threshold.
- [ ] **Toggle to full-profile radar** — Let recruiter optionally show all 18 axes for a candidate (edge case: cross-role evaluation).
- [ ] **Shortlist feature** — Cross-poste "shortlisted candidates" view, separate from statut.
- [ ] **Schedule interview integration** — Calendar / invite generation from compare page.

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

## Infrastructure Stability

- [ ] **Switch dev deployment strategy to RollingUpdate** — Current `Recreate` strategy kills the old pod before starting the new one, causing downtime on every deploy. Switch to `RollingUpdate` with `maxUnavailable: 0, maxSurge: 1` so the old pod serves traffic until the new one passes health checks. Requires solving SQLite single-writer conflict (only one pod can write at a time).

- [x] **Crash-proofing** — Fixed (37344d2, e94962e): Express error middleware catches route errors, uncaughtException triggers graceful shutdown, unhandledRejection logged without crash, candidates DELETE wrapped in try/catch with file cleanup, 120s server timeout, 1MB payload limit.

- [x] **CI smoke test was too aggressive** — Fixed (8d56590): increased from 2s single-shot to 12-attempt retry loop with 5s intervals.

- [x] **K8s readinessProbe + preStop hook** — Fixed (b1b69ba): readinessProbe stops traffic routing on failure, preStop drains 5s before SIGTERM, memory increased to 512Mi.

## Recruitment Analytics

- [x] **Recruitment funnel Sankey diagram** — Shipped at `/recruit/funnel` (docs/superpowers/plans/2026-04-17-recruitment-funnel-sankey.md). Backend `GET /api/recruitment/funnel?days=&pole=` aggregates candidature_events into nodes + links. Frontend uses d3-sankey. Filters: time range (30d/90d/1y/all), pole. Empty/loading/error states wired.

### Follow-ups from funnel plan
- [ ] **Per-candidature drill-down** — Click a Sankey link to see the list of candidates in that specific flow.
- [ ] **Time animation** — Show how the funnel evolves month-over-month.
- [ ] **Drop-off rate annotations** — Numerical drop-off % overlaid on each link.

## Observability (dev + prod)

Three pillars + Sentry, all wired together via OpenTelemetry:

- [ ] **Metrics** (is something wrong?) — RED per endpoint: Rate, Errors, Duration → Managed Prometheus
- [ ] **Traces** (why?) — distributed request flow → Cloud Trace
- [ ] **Logs** (what exactly?) — structured JSON with `trace_id` → Cloud Logging
- [ ] **Sentry** — application exceptions with great DX

The magic is correlation: propagate `trace_id` everywhere so you can jump Sentry error → trace → logs → metrics for any incident.

- [ ] **Add SLOs** once basics are in place — defines "healthy" and stops alert fatigue.

Stack: OpenTelemetry SDK → OTel Collector (DaemonSet) → GCP backends. Instrument once, stay portable.

# TODOs

> Open items only. Done items removed (verified 2026-04-17 via grep evidence; file:line confirmed for each).
> Subtasks below are decomposed atomically: each fits one short editor session (15–60 min) and ships behind a single commit.
> Acceptance criteria + file paths provided where known. "verify:" markers flag assumptions to sanity-check first.

---

## Visualization — follow-ups from role filtering plan

#### [ ] Role categories editor UI
**Why now:** the next recruitment wave will introduce roles not yet seeded. Without an editor we'll be patching `seed.ts` for every new role.
**Acceptance:** an admin can `Create / Rename / Delete` a role and add/remove the categories (radar axes) attached to it, from `/admin/role-categories`, and a fresh comparison page reflects the change immediately.
**Touches:** `server/lib/db.ts`, new `server/routes/admin/role-categories.ts`, new `src/pages/admin/RoleCategories.tsx`, `src/App.tsx` (route), `src/components/layout/*` (nav).

- [ ] **Inspect current schema and seed** — read `server/lib/db.ts:154-158` and `server/lib/seed.ts` (verify path), document existing `role_categories` rows in a brief comment block at top of new admin file.
- [ ] **Add admin role check helper** — confirm `users.role` column exists and `requireAdmin` middleware is available; if not, add `server/middleware/requireAdmin.ts` returning 403 when `req.user?.role !== 'admin'`.
- [ ] **Backend: GET `/api/admin/role-categories`** — returns `[{role: {id,label}, categories: [{id,label,order}]}]` joining `roles` + `role_categories` + `categories`. Sort categories by `order` (or insertion order).
- [ ] **Backend: POST `/api/admin/role-categories`** — body `{label}`. Creates a `roles` row (id = slugify(label)), returns 201 with new role. 409 on duplicate slug.
- [ ] **Backend: PUT `/api/admin/role-categories/:roleId`** — body `{label?, categoryIds: string[]}`. Replaces all `role_categories` rows for that role in a single transaction. 404 if role missing.
- [ ] **Backend: DELETE `/api/admin/role-categories/:roleId`** — cascades via FK. 409 if any `postes` row still references the role (verify: check FK from `postes.role_id`).
- [ ] **Backend: GET `/api/admin/categories`** — list of all `categories` rows for the multi-select picker.
- [ ] **Frontend: page scaffold** — new file `src/pages/admin/RoleCategories.tsx`, server-fetched table of roles, each row expandable to show category chips.
- [ ] **Frontend: "Nouveau rôle" dialog** — shadcn `Dialog` + form (label only). Optimistic insert, rollback on 409.
- [ ] **Frontend: category multi-select** — shadcn `Command` palette popover, search categories, click to add/remove. Save on blur (debounced PUT).
- [ ] **Frontend: rename role** — inline editable label, blur saves via PUT.
- [ ] **Frontend: delete role** — `AlertDialog` with explicit "Tapez le nom pour confirmer" guard.
- [ ] **Frontend: empty state** — when no roles exist, show a callout linking to seed instructions.
- [ ] **Routing + nav** — add `/admin/role-categories` to `src/App.tsx`; conditional nav item visible only to admin role.
- [ ] **Cache invalidation** — bust the SWR/React Query keys for `comparison` and `postes` after any mutation, so open compare pages refetch role axes.
- [ ] **Playwright e2e** — create role → add 3 categories → reload → assert persisted; delete role → assert gone.
- [ ] **Document side effect** — README/admin docs note: changing a role's categories invalidates cached compare pages but does **not** retroactively re-score past evaluations.

#### [ ] Weighted category importance (must-have vs nice-to-have)
**Why now:** today the gap chip threshold treats all axes equally; recruiters say "soft skills shouldn't outweigh JBoss for a JBoss dev role".
**Acceptance:** each `(role, category)` pair has a `weight` in `{0.5, 1, 1.5, 2}`; weighted gap drives the chip ordering and the "good fit" badge on the compare page.
**Touches:** `server/lib/db.ts` (migration), `server/routes/recruitment.ts` (comparison endpoint at line 227), compare page, admin UI from item above.

- [ ] **Migration script** — `ALTER TABLE role_categories ADD COLUMN weight REAL NOT NULL DEFAULT 1.0 CHECK(weight BETWEEN 0.5 AND 2.0);` in db.ts migration block (use `if column not exists` pragma check pattern).
- [ ] **Backend response shape** — comparison endpoint at `recruitment.ts:227` includes `weight` per axis in the returned JSON.
- [ ] **Gap formula** — replace mean shortfall with weighted shortfall: `Σ(max(0, expected_i - actual_i) * weight_i) / Σ(weight_i)`. Place pure function in `server/lib/scoring.ts` with unit tests.
- [ ] **Unit tests** — `tests/scoring.spec.ts`: (a) all weights=1 reproduces old behavior, (b) doubling weight on a fully-met axis lowers gap, (c) doubling weight on a missed axis raises gap above the threshold.
- [ ] **Frontend: visual encoding** — must-have axes (weight≥1.5) render the axis label with an asterisk and bold; nice-to-have (weight≤0.75) render dimmed.
- [ ] **Frontend: chip order** — gap chips on compare page sort by weighted shortfall descending.
- [ ] **Admin UI: weight slider** — in role categories editor, segmented control (0.5x / 1x / 1.5x / 2x) per category. Saves via the same PUT endpoint.
- [ ] **Migration safety** — verify SQLite `ALTER … ADD COLUMN` allows `CHECK` (it does); fall back to "create new table + copy" pattern only if needed.
- [ ] **Backfill validation** — run `SELECT COUNT(*) FROM role_categories WHERE weight IS NULL` post-migration → must be 0.
- [ ] **Snapshot existing comparison pages** — before merging, screenshot 2-3 compare pages in dev, then verify post-deploy that gap order only shifts where weights differ from 1.

#### [ ] Toggle to full-profile (18-axis) radar
**Why now:** for cross-role evaluation (e.g., Java dev being considered for tech-lead pivot), seeing only role axes hides relevant signal.
**Acceptance:** a switch above the radar toggles between *role axes* (default) and *all axes* (18); choice is reflected in the URL so links share the same view.

- [ ] **Find compare page file** — `grep -rn "comparison" src/pages` to confirm path.
- [ ] **Add shadcn `Switch`** — labelled "Afficher tous les axes" above the radar.
- [ ] **Local state + URL sync** — `?full=1` toggles state via `useSearchParams`; default off.
- [ ] **Pass full vs filtered axis list** — already has the role axes; thread the full axis set down as a prop, choose at render time.
- [ ] **Empty-axis safety** — if a candidate has no rating for an axis, plot 0 and dim the polygon segment.
- [ ] **Legend update** — when full mode is on, the role-axis-only polygon is shown muted underneath for context.
- [ ] **Test** — Playwright: open compare → toggle on → assert 18 axis labels rendered.

#### [ ] Shortlist feature
**Why now:** recruiters want a "watchlist" decoupled from `statut` so a candidate can be flagged without changing their workflow stage.
**Acceptance:** any candidature can be `shortlist / unshortlist`-ed from compare or list views; `/recruit/shortlist` shows a cross-poste table; toggle emits a `candidature_shortlisted` event so it appears in the funnel.
**Touches:** `server/lib/db.ts` (migration + enum extension at line 231 / 302 / 331), `server/routes/recruitment.ts`, new page `src/pages/recruit-shortlist-page.tsx`, candidate row component, nav.

- [ ] **Schema: shortlist columns** — `ALTER TABLE candidatures ADD COLUMN shortlisted INTEGER NOT NULL DEFAULT 0;` plus `shortlisted_at TEXT` and `shortlisted_by TEXT`.
- [ ] **Index** — `CREATE INDEX IF NOT EXISTS idx_candidatures_shortlisted ON candidatures(shortlisted) WHERE shortlisted=1;` (partial index keeps it tiny).
- [ ] **Extend event type CHECK** — add `'candidature_shortlisted'` and `'candidature_unshortlisted'` to the `candidature_events.type` CHECK constraint (use the rename-and-copy migration pattern already at db.ts:298 and 327).
- [ ] **Backend: POST `/api/recruitment/candidatures/:id/shortlist`** — body `{shortlisted: boolean}`, atomic update with `WHERE shortlisted = ?` CAS guard; emits event; returns updated row.
- [ ] **Backend: GET `/api/recruitment/shortlist?pole=`** — joins candidatures + candidates + postes, filtered to `shortlisted=1`, ordered by `shortlisted_at DESC`.
- [ ] **Frontend: pin/star button** — on candidate row in compare page, in list page, and on candidate detail. Optimistic toggle.
- [ ] **Frontend: shortlist page** — table columns `Candidat | Poste | Pôle | Statut | Shortlisté le | Actions(unshortlist)`.
- [ ] **Frontend: nav badge** — `Shortlist (n)` count in sidebar, fetched alongside other counters.
- [ ] **Funnel integration** — verify the funnel aggregator either ignores shortlist events or buckets them as a side-channel (decision: keep them out of the main flow, expose as separate metric).
- [ ] **Audit/permissions** — only authenticated recruiters can shortlist; record `shortlisted_by` from `req.user.email`.
- [ ] **Test** — backend: shortlist twice in a row idempotent; e2e: shortlist from compare → appears on `/recruit/shortlist` → unshortlist removes it.

#### [ ] Schedule interview integration
**Why now:** today recruiters copy emails into Outlook/GCal manually; one of two main pain points reported by the recruitment team.
**Acceptance:** from compare or candidate detail, "Planifier un entretien" opens a dialog where recruiter proposes 2–3 slots; candidate gets an email with a public response link; on selection, an `.ics` is mailed to candidate + recruiter and an event lands in the candidature timeline.
**Touches:** new `server/routes/interviews.ts`, new tables `interview_invitations` + `interview_slots`, new email template, `server/lib/email.ts`, frontend dialog + public response page.

- [ ] **Decision spike (1h, output a markdown note)** — `.ics` attachment vs Google Calendar OAuth vs both. Capture in `docs/decisions/2026-XX-interview-channel.md`. Default lean: `.ics` first (no OAuth scope).
- [ ] **Schema: `interview_invitations`** — `(id INTEGER PK, candidature_id TEXT FK, response_token TEXT UNIQUE, expires_at TEXT, status TEXT CHECK(status IN ('proposed','selected','expired','cancelled')) DEFAULT 'proposed', created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`.
- [ ] **Schema: `interview_slots`** — `(id INTEGER PK, invitation_id INTEGER FK, slot_iso TEXT NOT NULL, duration_min INTEGER DEFAULT 30, location TEXT, selected_at TEXT)`.
- [ ] **Extend event type CHECK** — add `'interview_proposed'`, `'interview_scheduled'`, `'interview_cancelled'`.
- [ ] **Backend: POST `/api/recruitment/candidatures/:id/interviews`** — body `{slots: [{iso, location?}]}`, creates invitation + slots, returns invitation token.
- [ ] **Backend: render `.ics`** — minimal RFC 5545 generator (no library if 30 LOC suffices), `BEGIN:VCALENDAR` … `BEGIN:VEVENT`. Attach to outgoing email.
- [ ] **Backend: GET `/api/recruitment/interviews/:token`** — public, returns invitation + slot list (no auth).
- [ ] **Backend: POST `/api/recruitment/interviews/:token/select`** — body `{slot_id}`. CAS: only succeeds if invitation status is still `proposed`. Marks selected, expires others, sends confirmation email + ics to candidate and creator.
- [ ] **Email template: proposal** — React Email component (matches existing pipeline); FR copy; lists slots with select-link per slot OR single "Choisir un créneau" link to public page.
- [ ] **Email template: confirmation** — sent to candidate AND `created_by`; `.ics` attached.
- [ ] **Frontend: "Planifier un entretien" dialog** — date+time pickers x3, optional location, "Envoyer". Validates: slots in future, ≥1h apart.
- [ ] **Frontend: public response page** — `/interview/respond/:token`, no nav, branded; expired/already-selected states handled.
- [ ] **Statut transition** — on select, optionally bump `statut` to `entretien_1` (with a confirmation toggle in the dialog: "Passer le statut à entretien_1 après confirmation").
- [ ] **Cron-style cleanup** — once-a-day job (in-process `setInterval` is fine for v1) marking past `proposed` slots as `expired`.
- [ ] **Prerequisites guard** — backend rejects with 422 if candidate has no email OR no recruiter on the candidature has email.
- [ ] **Test** — happy path e2e: propose 3 slots → respond → both emails sent (mock) → event in timeline → candidature status updated.

---

## Security & Reliability

#### [ ] Dev/prod share GKE namespace + GCP identity (manifest drift)
**Why now:** dev deploys currently land in the prod namespace; one bad rollout takes prod with it. Manifests for separation are written but reverted because GCP prerequisites were missing.
**Acceptance:** `dev` branch deploys to `public-webapp-dev` namespace using `skill-radar-dev@…iam.gserviceaccount.com`; `main` deploys unchanged to prod; both have isolated Litestream prefixes.
**Touches:** `cloud-sinapse-infra` repo (manifests), Terraform/console (GCP SA + WIF), GH Actions secrets.

- [ ] **Audit current state** — run `kubectl get all -n public-webapp` and `gcloud iam service-accounts list --project premier-socle-sinapse`; capture in a runbook section.
- [ ] **Create namespace** — `kubectl create namespace public-webapp-dev` (idempotent: `--dry-run=client -o yaml | kubectl apply -f -`).
- [ ] **Create GCP SA** — `gcloud iam service-accounts create skill-radar-dev --project=premier-socle-sinapse --display-name="skill-radar dev"`.
- [ ] **Grant SA roles** — `roles/storage.objectAdmin` scoped to dev Litestream bucket prefix; `roles/secretmanager.secretAccessor` on dev secrets only.
- [ ] **Workload Identity binding** — `gcloud iam service-accounts add-iam-policy-binding skill-radar-dev@… --role roles/iam.workloadIdentityUser --member "serviceAccount:premier-socle-sinapse.svc.id.goog[public-webapp-dev/skill-radar]"`.
- [ ] **K8s ServiceAccount** — apply SA in `public-webapp-dev` annotated with `iam.gke.io/gcp-service-account=skill-radar-dev@…`.
- [ ] **Copy secrets** — for each prod secret used by dev (Resend API, MS auth, GCS creds): `kubectl get secret <s> -n public-webapp -o yaml | sed 's/namespace: public-webapp/namespace: public-webapp-dev/' | kubectl apply -f -`. Sanity-check no prod-only values leak (DB URLs, prod webhook secrets).
- [ ] **Litestream bucket prefix** — set `LITESTREAM_REPLICA_PATH=gs://…/skill-radar-dev/` in dev deployment env. Verify: prod prefix unchanged.
- [ ] **Re-apply reverted manifests** — bring back the dev-namespace Kustomize overlay; smoke-test in a feature branch first.
- [ ] **CI: dev workflow targets dev namespace** — `.github/workflows/deploy-dev.yml`: change `--namespace public-webapp` → `--namespace public-webapp-dev`. Diff carefully against `deploy.yml`.
- [ ] **Verify isolation** — write a test row to dev DB; confirm prod DB count unchanged via `kubectl exec -n public-webapp …`.
- [ ] **Document** — `cloud-sinapse-infra/README.md` adds a "namespace map" table (dev/prod → namespace → SA → bucket prefix).

---

## Infrastructure Stability — follow-ups from deployment strategy fix

#### [ ] Postgres migration (long-term zero-downtime path)
**Why now:** not urgent — current 30–60s deploy gap is acceptable for current workload, but is the only path to true HA + RollingUpdate + multi-replica reads.
**Acceptance:** app runs on Cloud SQL Postgres with no SQLite/Litestream/PVC; deploys are RollingUpdate; read replicas optional; cutover happened during a planned window with rollback drill rehearsed.
**Touches:** `server/lib/db.ts` (data layer), `server/lib/*` (every query site), `Dockerfile`, deployment manifests, CI.

- [ ] **Feasibility spike** — list all SQLite-only features in use (`grep -rn 'pragma\|json_extract\|sqlite_master\|fts5'` in `server/`). Capture in `docs/decisions/2026-XX-postgres.md`. Especially flag `INSERT … ON CONFLICT … DO UPDATE` differences.
- [ ] **Workload baseline** — capture: writes/sec p95, read latency p95, total DB size, busiest table. Use Litestream metrics + `EXPLAIN QUERY PLAN`. Output a one-pager.
- [ ] **Provision Cloud SQL (dev)** — Postgres 16, smallest tier, private IP only. Capture instance name + connection name in secret.
- [ ] **VPC Serverless connector** — provision if not already; verify GKE pods can reach Cloud SQL via private IP using `pg_isready`.
- [ ] **Choose driver** — `postgres` (low-level, no ORM) vs `drizzle-orm` (typed, migrations). Recommend `postgres` for least disruption.
- [ ] **Schema port** — write `db/postgres/001_init.sql` mirroring all `CREATE TABLE` blocks from `server/lib/db.ts`. Map types: `INTEGER`→`integer`/`bigint`, `TEXT`→`text`, `REAL`→`double precision`. Replace `AUTOINCREMENT` with `GENERATED BY DEFAULT AS IDENTITY`.
- [ ] **Constraint port** — translate every `CHECK(... IN (...))` to a Postgres `CHECK` (same syntax) or a domain type if reused.
- [ ] **Index port** — recreate every `CREATE INDEX` and `CREATE UNIQUE INDEX`; add `CREATE INDEX CONCURRENTLY` only post-cutover for any non-critical hot indexes.
- [ ] **Data layer abstraction** — create `server/lib/db/index.ts` exporting an interface with `prepare/get/all/run/exec/transaction`; back it with the existing better-sqlite3 impl. Refactor call sites to use it.
- [ ] **Postgres impl behind same interface** — `server/lib/db/postgres.ts`. Choose backend by `process.env.DB_BACKEND`.
- [ ] **Query rewrites: parameter style** — better-sqlite3 uses `?`, postgres needs `$1, $2`. Either auto-translate in the wrapper or rewrite each call.
- [ ] **Query rewrites: returning** — wherever code uses `lastInsertRowid`, switch to `RETURNING id`.
- [ ] **Query rewrites: `INSERT … ON CONFLICT … DO UPDATE`** — re-test each one; PG syntax matches but column references differ (`EXCLUDED.col`).
- [ ] **Data copier script** — `scripts/sqlite-to-postgres.ts` reading every table and `INSERT … ON CONFLICT DO NOTHING` into PG, batched 1000 rows. Idempotent.
- [ ] **Dual-write shim (optional)** — wrap mutating routes to write both backends for N hours pre-cutover; alarm on divergence. Skip if planned downtime acceptable.
- [ ] **Backup strategy** — replace Litestream with Cloud SQL automated backups + point-in-time recovery; export weekly logical dump to GCS for offsite.
- [ ] **Manifest changes** — remove `Recreate` strategy → `RollingUpdate` (default), remove PVC + emptyDir, add `DATABASE_URL` from secret, drop Litestream sidecar.
- [ ] **Image trim** — remove `litestream` binary install from Dockerfile; remove SQLite-specific entrypoint logic.
- [ ] **Load test** — `k6` or `artillery` script replaying realistic traffic at 2x peak; assert p95 < pre-migration baseline.
- [ ] **Cutover runbook** — rehearsed in dev, documented step-by-step (freeze writes → final sqlite→pg sync → flip env var → verify counts → unfreeze).
- [ ] **Rollback drill** — practice: flip env back to sqlite, restore from last Litestream generation, app comes up clean. Document timing.
- [ ] **Decommission** — 30 days post-cutover: delete PVC, Litestream bucket, sqlite volume mounts, better-sqlite3 dep.

#### [ ] Garbage-collect old Litestream generations in GCS
**Why now:** ~15 stale generations from the broken setup clutter the bucket; harmless but confusing during incident triage.
**Acceptance:** bucket lists only the current generation + last 2 known-good; cleanup script committed for future reuse.

- [ ] **List generations** — `gcloud storage ls gs://<bucket>/<prefix>/generations/` → save output.
- [ ] **Identify active** — `kubectl exec -n public-webapp <pod> -- litestream generations /data/db.sqlite` → note current id.
- [ ] **Identify keep-list** — current + 2 most-recent successful generations (timestamp from `litestream generations`).
- [ ] **Write `scripts/gc-litestream-generations.sh`** — args: `--bucket --prefix --keep <gen_id> [--keep <gen_id>] [--dry-run]`. Default `--dry-run`.
- [ ] **Dry-run + review** — paste output into PR; user confirms before live run.
- [ ] **Run live** — `--no-dry-run`. Sleep 30s between deletes to avoid rate limits.
- [ ] **Verify replication still healthy** — `litestream snapshots /data/db.sqlite` shows fresh snapshot after GC.
- [ ] **Restore drill** — restore from current generation in a throwaway pod; assert row counts match prod.
- [ ] **Add to runbook** — `docs/runbooks/litestream-gc.md` with re-run instructions and "when to run" trigger ("> 5 generations or > 10 GB").

---

## Recruitment Analytics — follow-ups from funnel plan

#### [ ] Per-candidature drill-down on Sankey link
**Why now:** funnel is descriptive; recruiters want "who are the 7 candidates that dropped between `entretien_1` and `entretien_2`?".
**Acceptance:** clicking any Sankey link opens a side drawer with the candidate list for that exact (from_status, to_status) edge under current filters.
**Touches:** `server/routes/recruitment.ts` (funnel endpoint at line 217), `src/pages/recruit-funnel-page.tsx` + new drawer component.

- [ ] **Backend: GET `/api/recruitment/funnel/edge?from=&to=&days=&pole=`** — returns `[{candidature_id, candidate_name, poste_label, transitioned_at}]`, ordered by `transitioned_at DESC`, paginated (limit=50, cursor by event id).
- [ ] **Backend SQL** — derive from `candidature_events` where `(statut_from, statut_to)` matches AND created_at within window AND join to `candidatures.pole` for filter.
- [ ] **Frontend: link onClick** — d3-sankey link receives click, captures `(source, target)` ids → opens shadcn `Sheet` (right-side drawer).
- [ ] **Frontend: drawer content** — list rows with name + poste + date; clicking a row navigates to candidate detail in a new tab.
- [ ] **Empty state** — "Aucun candidat dans ce flux pour la période sélectionnée".
- [ ] **Loading skeleton + error toast** — match the rest of the recruit pages.
- [ ] **Pagination** — "Charger plus" button when cursor returned.
- [ ] **Test** — e2e: load funnel → click an edge with known data → drawer shows expected names.

#### [ ] Time animation (funnel evolution month-over-month)
**Why now:** static funnel hides whether things are getting better/worse.
**Acceptance:** below the Sankey, a slider with months; dragging or pressing Play animates the diagram across snapshots.

- [ ] **Backend: GET `/api/recruitment/funnel/timeseries?granularity=month&from=&to=&pole=`** — returns `[{period_start, nodes, links}]`. Cap output at 24 periods.
- [ ] **Backend perf** — single SQL with `strftime('%Y-%m', created_at)` group, in-memory rollup; verify on full event table runs <500 ms.
- [ ] **Frontend: timeline slider** — shadcn `Slider` showing month labels; current index is a controlled state.
- [ ] **Frontend: Play/Pause** — button steps `index++` on a 1 s `setInterval`.
- [ ] **Frontend: transitions** — d3 update pattern: same `node.id` keeps DOM, link path tweens between snapshots over 600 ms.
- [ ] **Empty period UX** — periods with zero events show "Pas d'activité" overlay (don't drop the period).
- [ ] **Reset on filter change** — pole/range filter change resets index to 0.
- [ ] **Test** — e2e: timeseries returns 6 months → slider has 6 stops → play cycles all 6 → finishes on last.

#### [ ] Drop-off rate annotations on Sankey
**Why now:** raw counts hide rate; "5/100 dropped" reads very differently from "5/6".
**Acceptance:** each link shows `n (xx%)` label, color-coded by severity; user can toggle labels off for dense diagrams.

- [ ] **Compute drop-off per link** — `1 - (link.value / source_node.total_outgoing)` (verify "outgoing" not "value": account for multiple downstream links).
- [ ] **Render link label** — text node above link midpoint with `n (xx%)`.
- [ ] **Color encoding** — `red >= 70%`, `amber 30–70%`, `green < 30%` drop-off (dropping is bad → red).
- [ ] **Toggle visibility** — shadcn `Switch` "Afficher les taux".
- [ ] **A11y** — labels also surfaced via `aria-label` on the link path; tooltip mirrors.
- [ ] **Sanity check** — for the visible "embauche" terminal, percentage should be 100% drop-off (everything that reaches it is the end of the path) — verify the math distinguishes terminal vs intermediate.

---

## Observability (dev + prod)

> Three pillars + Sentry, all wired together via OpenTelemetry. Magic = correlation: propagate `trace_id` everywhere → jump Sentry → trace → logs → metrics for any incident.
> Stack: OpenTelemetry SDK → OTel Collector (DaemonSet) → GCP backends (Managed Prometheus, Cloud Trace, Cloud Logging) + Sentry.

#### [ ] Metrics (RED per endpoint → Managed Prometheus)
- [ ] **Install `prom-client`** — add to `package.json`, basic `Registry`.
- [ ] **HTTP middleware** — Express middleware records `http_request_duration_seconds` (Histogram) and `http_requests_total` (Counter) labelled by `method, route, status_code`. Use `req.route?.path` not `req.path` to avoid cardinality explosion from path params.
- [ ] **Process metrics** — `prom-client.collectDefaultMetrics()` for event loop lag + heap + GC.
- [ ] **Custom counters** — `email_sent_total{outcome}`, `cv_extraction_total{outcome}`, `litestream_replication_lag_seconds` (gauge updated from `litestream snapshots`).
- [ ] **Endpoint** — `GET /metrics`, protected by `Authorization: Bearer ${METRICS_TOKEN}` env var.
- [ ] **PodMonitoring CR** — apply Managed Prometheus `PodMonitoring` selecting `app=skill-radar`, scraping `/metrics` every 30 s with the bearer token.
- [ ] **Verify in console** — Cloud Monitoring → Metrics Explorer → `prometheus.googleapis.com/http_requests_total/counter` returns data.
- [ ] **Default dashboard** — JSON committed at `infra/dashboards/skill-radar-red.json`: per-endpoint p50/p95/p99, error rate, RPS, top 5 slowest endpoints.
- [ ] **Alert: error budget burn** — Cloud Monitoring alert: error rate > 5 % for 5 min → email + (optional) PagerDuty.

#### [ ] Traces (distributed request flow → Cloud Trace)
- [ ] **Install OTel SDK** — `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-proto`.
- [ ] **Bootstrap** — `server/instrumentation.ts` initialised before any `import` of `express`/`better-sqlite3`. Uses `process.env.OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME=skill-radar`.
- [ ] **Auto-instrument** — Express, HTTP, fetch, fs, sqlite (verify availability for better-sqlite3; if missing, manual span around `prepare/run`).
- [ ] **Manual spans for hot paths** — `cv_extract`, `email.send`, `funnel.aggregate`. Tag candidate_id, poste_id where safe (no PII in attribute values).
- [ ] **OTel Collector DaemonSet** — apply manifest with `gcp` exporter for traces; receives OTLP/proto on `4318`.
- [ ] **W3C trace context propagation** — verify `traceparent` header sent on outbound `fetch` to Resend, GCS, MS Graph.
- [ ] **Verify** — open `/recruit/funnel`, find the request in Cloud Trace, assert it shows the SQL spans.

#### [ ] Logs (structured JSON with `trace_id` → Cloud Logging)
- [ ] **Replace `console.log`** — install `pino`. Wrap as `server/lib/logger.ts` with default fields `{service, env, version}`.
- [ ] **Inject trace_id** — pino mixin pulls active span's `traceId`/`spanId` from OTel context.
- [ ] **Migrate call sites** — `grep -rn 'console\.\(log\|warn\|error\)' server/` → swap progressively, batched by area (routes/, lib/, jobs/).
- [ ] **Format compatibility** — ensure pino output is single-line JSON; GKE Cloud Logging agent will pick it up automatically.
- [ ] **Severity mapping** — `pino.level` → `severity` so Cloud Logging colours errors red.
- [ ] **Log-based metric** — count `severity=ERROR` events, alert if rate doubles WoW.
- [ ] **Retention policy** — set bucket retention to 30 d (dev) / 90 d (prod).

#### [ ] Sentry (application exceptions with great DX)
- [ ] **Install `@sentry/node` + `@sentry/react`** — separate DSNs per env via secret.
- [ ] **Backend init** — `Sentry.init({dsn, tracesSampleRate: 0.1, environment: process.env.ENV})` in `server/instrumentation.ts` (paired with OTel).
- [ ] **Frontend init** — in `src/main.tsx`, `Sentry.init({dsn, integrations: [browserTracingIntegration()], tracesSampleRate: 0.1, replaysSessionSampleRate: 0})` — Replay disabled until privacy cleared.
- [ ] **Express handler** — wrap routes with `Sentry.Handlers.requestHandler` and `errorHandler`.
- [ ] **Source maps upload** — CI step using `@sentry/cli`, releases keyed to commit SHA.
- [ ] **Tag release + user + trace_id** — set `release`, `user.id` (recruiter email hashed), `trace_id` on every event.
- [ ] **Smoke test** — throw a deliberate `RangeError` in dev, confirm it appears in Sentry within 60 s with the trace link.

#### [ ] Correlation glue
- [ ] **Inject `X-Trace-Id`** — Express middleware reads active span's traceId, sets `res.setHeader('X-Trace-Id', …)`.
- [ ] **Frontend captures `X-Trace-Id`** — store on every fetch response; attach to subsequent Sentry events as a tag.
- [ ] **Documented runbook** — `docs/runbooks/incident-correlation.md`: "given a Sentry event, here's how to jump to trace, logs, metrics".

#### [ ] SLOs (define healthy, stop alert fatigue)
- [ ] **Define SLIs** — `availability = 1 - error_rate`, `latency = p95(http_request_duration)`.
- [ ] **Define SLOs** — 99.5 % availability over 30 d, 99 % of API requests < 500 ms over 30 d.
- [ ] **Cloud Monitoring SLO objects** — declared as YAML in `infra/slos/*.yaml`, applied via `gcloud monitoring slos create`.
- [ ] **Burn-rate alerts** — fast burn (1 h, 14.4× budget) and slow burn (6 h, 6× budget) per SLO.
- [ ] **Error budget doc** — `docs/error-budget.md` explains "freeze deploys when 50 % of monthly budget is burned in 7 d".
- [ ] **Re-tune existing alerts** — silence anything already covered by burn-rate alerts to avoid noise.

---

## CI / DX hygiene

#### [ ] GitHub Actions Node 20 deprecation (deadline: 2026-06-02)
**Why now:** Node 20 runtime warnings on every workflow run; will become hard failures after the deadline.
**Touches:** `.github/workflows/deploy-dev.yml`, `.github/workflows/deploy.yml`.

- [ ] **Audit workflows** — list all `uses:` references with versions in both files (just two files in this repo).
- [ ] **Bump `actions/checkout`** — `@v4` → latest stable (`@v5`+). Verify shallow-clone behavior unchanged.
- [ ] **Bump `google-github-actions/auth`** — `@v2` → `@v3`. Re-test WIF flow on a feature branch.
- [ ] **Bump `google-github-actions/setup-gcloud`** — `@v2` → `@v3`.
- [ ] **Bump `docker/build-push-action`** — pin to latest stable; re-test image tag/push.
- [ ] **Bump any `actions/cache`, `actions/upload-artifact`, `actions/setup-node`** to versions on Node 22+.
- [ ] **Run on a draft PR** — both workflows green end-to-end.
- [ ] **Audit `cloud-sinapse-infra` workflows** — same exercise in the infra repo (separate task, but track here so it isn't forgotten).

#### [ ] Automated data-persistence regression tests (deferred Codex 7 + 8)
**Why now:** today's data-loss bug would not have been caught by CI; we need an automated guard before the next deploy regression.
**Acceptance:** CI job runs end-to-end persistence scenarios in a real container against a real (ephemeral) SQLite + GCS-mock; fails the build on regression.

- [ ] **Test harness** — `tests/persistence/docker-compose.test.yml` with skill-radar image + fake-gcs-server; tests run via `docker compose run`.
- [ ] **Test 1: writes survive restart** — POST a candidature, `docker restart`, GET candidatures → row present.
- [ ] **Test 2: writes survive SIGTERM mid-write** — start a long write, `docker kill --signal=SIGTERM`, restart, verify either committed or absent (no torn write).
- [ ] **Test 3: corrupted DB triggers restore** — corrupt `/data/db.sqlite` with `dd`, set `LITESTREAM_FORCE_RESTORE=true`, restart, verify backup restored and row counts match pre-corruption.
- [ ] **Test 4: corrupted DB without backup fails clean** — same but no backup present, assert pod fails to start (no phantom empty DB).
- [ ] **Test 5: WAL checkpoint on shutdown** — write rows, send SIGTERM, before grace expires verify WAL is empty (`PRAGMA wal_checkpoint(TRUNCATE)` ran).
- [ ] **CI job** — new `.github/workflows/persistence-tests.yml`, triggered on PRs touching `server/lib/db*`, `entrypoint.sh`, `scripts/db-ops.mjs`, `Dockerfile`, deployment manifests.
- [ ] **Pinned base image** — tests run against the actual `Dockerfile`-built image, not host node, so entrypoint/litestream/timing all participate.
- [ ] **Documentation** — `tests/persistence/README.md` explains how to add a scenario.

---

## Open follow-ups not yet decomposed (parking lot)

> Promote to a section above when ready to plan.

- [ ] **Drupal homepage profile cards now dynamic** (lfk_bootstrap) — verify that the dynamic loop doesn't regress when a single emploi taxonomy term has zero open offers; add a fallback "Pas d'offre actuellement" card.
- [ ] **CV extraction variance** — majority-vote layer if per-category-split + temp:0 still shows variance in production samples.
- [ ] **Per-pôle deployment isolation** — every pôle eventually wants its own DB / namespace. Currently single-tenant; needs design doc before any work.

---

---

## UX / feature review batch (2026-04-17 walkthrough, codex-challenged)

> 21 items from walkthrough, then adversarially reviewed by codex (49 criticisms applied — summary at bottom of this section).
> **Cross-cutting discipline:**
> - Every item now references **real** files / tables / columns verified against the repo.
> - Phase gates added where scope threatened to spiral (items 1, 20, 21).
> - Privacy-risky / out-of-scope ideas dropped (face extraction, committed real CVs, hash-whitelist malware bypass, train-on-edits).
> - Two new cross-cutting ADRs added: authorization/audit model, data retention/export/erasure.

---

### [ ] 1. Candidate/candidature page UX + responsive overhaul (phased)
**Goal:** kill the overflow bug first, consider bigger UX gains only behind measured pain.
**Touches:** `src/components/recruit/candidate-dossier-card.tsx:114`, `src/pages/candidate-detail-page.tsx:208`.
**Note:** item 14 is now folded into this — same root cause.

Phase 1 — Acceptance: no horizontal scroll at 360/768/1280; consistent spacing; visible focus states; Playwright baseline screenshots committed.
- [ ] Repro the overflow: screenshots at 360/768/1280/1440 committed to `docs/audits/2026-04-17-candidate-page/`.
- [ ] Fix root cause in `candidate-dossier-card.tsx:114` and `candidate-detail-page.tsx:208` — replace offending widths with `min-w-0` + `flex-wrap` + grid collapse.
- [ ] Audit button padding/variants on the page; normalize to shadcn Button variants (no ad-hoc CSS).
- [ ] Fix the "préselectionné" alert layout that was item 14 — either wrap vertically <768px or replace with an inline banner in the status header.
- [ ] A11y: tab order, visible focus rings, AA contrast on every status chip.
- [ ] Playwright: at 360/768/1440, assert `scrollWidth === innerWidth` + screenshot baselines.

Phase 2 — only after Phase 1 ships AND measured pain justifies cost:
- [ ] Density toggle (compact / comfortable / detailed); per-user localStorage.
- [ ] `⌘K` command palette via shadcn `Command` — register candidate-page actions.
- [ ] Keyboard map: `E` edit status, `R` refuser, `P` préselectionner, `V` view CV, `S` shortlist, `/` search, `?` help overlay.
- [ ] Mobile sticky action bar.

### [ ] 2. CV extraction expansion — text-only, consent-friendly, lockable
**Goal:** auto-populate non-sensitive text fields a recruiter copy-pastes, with per-field confidence + manual lock.
**Dropped (codex):** profile photo / face extraction; gender/age as stored attributes; committed real-CV fixtures (PII leak); "train on recruiter edits" without opt-in.
**Touches:** real write path at `server/lib/cv-extraction.ts:231` + `server/routes/candidates.ts:156`; new `candidate_extractions` + `candidate_field_overrides` tables.
**Acceptance:** on 10 synthetic/redacted CVs, ≥80% of listed fields populate with ≥0.8 confidence; a locked field is never overwritten by a re-run.

Fields to extract (text-only):
- Identity: full name, date of birth (age computed in UI, never stored as an independent attribute).
- Contact: phone (E.164), email, city/country; LinkedIn / GitHub / portfolio URLs.
- Education: highest degree, school, field of study, graduation year, certifications (title/issuer/year/expiry).
- Experience: total years (computed from dates), current role/employer, previous roles (title/company/dates), industries, gaps ≥6 months (flag only).
- Skills / tools / frameworks / languages spoken (CEFR).
- Context: availability, notice period, stated salary expectation, work preference.
- Signals: inferred seniority, career pivots, international experience.

Innovation on approach:
- Span-grounded output: `{value, confidence, source_span}` per field for highlight-on-hover.
- Per-field re-ask (targeted prompt, cheaper).
- Structured output + JSON-schema reject on mismatch.
- Cost target ≤€0.01 per CV via gpt-4o-mini, gpt-4o only for skill taxonomy mapping.

Subtasks:
- [ ] Persistence contract first — migration adds `candidate_extractions (id, candidature_id, type, run_id, prompt_version, model_version, raw_output JSON, parsed_output JSON, merge_strategy, created_by, created_at)` in `server/lib/db.ts`.
- [ ] Per-field override/lock: `candidate_field_overrides (candidature_id, field_name, value, locked_by, locked_at)`; all merge paths respect locks.
- [ ] Refactor `cv-extraction.ts:231` into `extractCvFull(buffer, options)` returning typed struct with spans.
- [ ] Wire write path: `candidates.ts:156` persists extracted fields + extraction row.
- [ ] Backfill job: `scripts/backfill-cv-extractions.mjs` replays on existing candidates; skips locked fields.
- [ ] Synthetic fixtures: 10 fabricated/redacted CVs in `tests/fixtures/cvs/` + gold labels JSON. **No real candidate data in git.**
- [ ] UI: extracted-field panel on candidate detail; hover span highlights CV; per-field 🔒 lock toggle.
- [ ] Unit test: on fixture set, ≥80% fields ≥0.8 confidence; locked field unchanged after re-run.
- [ ] Cost observability: `cv_extraction_cost_eur` counter (ties to observability work).
- [ ] Scope ADR: `docs/decisions/2026-XX-cv-extraction-scope.md` — explicit list of what we do / don't extract; reasoning for dropping face detection and protected attributes.

### [ ] 3. Remove (soft-delete) uploaded documents
**Reality (codex):** table is `candidature_documents` (db.ts:242) with column `uploaded_by` (not `created_by`). Only role in the repo is `requireLead`; no admin role exists.
**Touches:** db.ts:242, `server/routes/recruitment.ts:822` (single dl), `server/lib/document-service.ts:137` (list), ZIP builders at document-service.ts:220 + recruitment.ts:1168.
**Acceptance:** `uploaded_by` OR any `requireLead` user can delete; soft-delete with 30d restore; every read path filters tombstoned rows.

Subtasks:
- [ ] Schema: `ALTER TABLE candidature_documents ADD COLUMN deleted_at TEXT`.
- [ ] Backend: `DELETE /api/recruitment/candidatures/:cid/documents/:id` — permission: `req.user.email === uploaded_by` OR `requireLead`.
- [ ] Filter EVERY read path: list query, single-download at recruitment.ts:831, single-candidate ZIP at document-service.ts:220, bulk ZIP at recruitment.ts:1168 — all add `AND deleted_at IS NULL`.
- [ ] GCS: keep blob; add `x-goog-meta-deleted-at` metadata; new `scripts/gc-deleted-documents.mjs` purges after 30d.
- [ ] Emit `candidature_events (type='document', notes='deleted: {filename}')`.
- [ ] Restore endpoint + admin-visible tab: `POST /api/recruitment/.../restore` gated on `requireLead` + within 30d.
- [ ] Test: delete → list excludes; single download returns 410; ZIP excludes; restore within 30d re-includes; after 30d the blob and row are purged.

### [ ] 4. Split "Ouvrir CV" into View + Download (real file refs)
**Reality (codex):** download handler at `server/routes/recruitment.ts:831` + `server/lib/document-service.ts:135` (not 840/884).
**Acceptance:** dedicated preview route streams PDFs inline after auth check; non-PDFs fall back to download with a notice.

Subtasks:
- [ ] Backend: new `GET /api/recruitment/.../documents/:id/preview` — same permission check as download; only streams `application/pdf` with `Content-Disposition: inline`; 406 for other MIME types.
- [ ] Frontend: two buttons per card — "👁 Voir" and "⬇ Télécharger".
- [ ] Voir: shadcn `Dialog` with `<iframe src="…/preview">` + sandbox attrs; Esc closes; focus restored; `aria-label="Prévisualisation du CV"`.
- [ ] Audit: log view to `candidature_events (type='document', notes='viewed')`.
- [ ] Test: PDF preview inline; DOCX shows download-only state; unauthorized → 403.

### [ ] 5. ZIP export keeps original filenames (use existing `archiver`)
**Reality (codex):** repo already streams with `archiver` at `server/lib/document-service.ts:220` + `server/routes/recruitment.ts:1168`. Do NOT introduce `jszip`.
**Acceptance:** zip entries have human-readable Unicode names; collisions handled; single-candidate and bulk ZIP share one naming helper.

Subtasks:
- [ ] Extract helper `buildZipEntryName({type, candidateName, filename, displayName?, index})` in `server/lib/document-service.ts`.
- [ ] Call from single ZIP (document-service.ts:220) and bulk ZIP (recruitment.ts:1168).
- [ ] Collision strategy: append `_1, _2, …` within same `(candidate, type)` bucket.
- [ ] UTF-8: archiver entry `{name}` with correct Unicode flag; assert no mojibake on Windows extractor.
- [ ] Respect soft-delete from item 3 and display-name from item 6 in the helper.
- [ ] Test: 2 CVs on same candidate → `CV_Jean_Dupont_1.pdf` + `_2.pdf`; deleted doc not present; renamed doc uses display name.

### [ ] 6. Rename documents — explicit action, update all read paths
**UX fix (codex):** dbl-click inline rename is hostile on mobile + invisible to keyboard. Use explicit Rename action w/ dialog.
**Read-path hazard:** ZIP entries and downloads read `filename` from DB directly; every read path must switch to `display_filename ?? filename`.

Subtasks:
- [ ] Schema: `ALTER TABLE candidature_documents ADD COLUMN display_filename TEXT` (nullable).
- [ ] Backend: `PATCH /api/recruitment/.../documents/:id` body `{display_filename}`; validates 1–200 chars, no path separators, no control chars; 409 on conflict within same `(candidature, type)`.
- [ ] GCS blob key unchanged (stays UUID-prefixed).
- [ ] Update EVERY read path to prefer `display_filename ?? filename`: single download `Content-Disposition` at recruitment.ts:840, ZIP entries (item 5 helper), candidate UI list, preview endpoint.
- [ ] UI: explicit "Renommer" button → shadcn `Dialog` with labelled input, Save/Cancel, server error surface.
- [ ] Emit `candidature_events (type='document', notes='renamed: {old} → {new}')`.
- [ ] Test: rename → single download uses new name; ZIP uses new name; list uses new name; conflict → 409; save with control char → 400.

### [ ] 7. Document slots aligned to existing `type` enum + state-machine gates
**Reality (codex):** `candidature_documents.type` enum is already `('aboro', 'cv', 'lettre', 'other')` at db.ts:246. The "3 required slots" model maps 1:1 to `cv / lettre / aboro`; `other` = admin pool. No enum change.
**State machine coupling:** must plug into `server/lib/state-machine.ts:7` and transition endpoint at `server/routes/recruitment.ts:516` BEFORE shipping gates.
**Acceptance:** candidate page shows 3 slot cards (CV, Lettre, ABORO) + `Autres` pool; replacing a slot preserves history via `replaces_document_id`; pipeline cards show `Dossier X/3` badge.

Subtasks:
- [ ] Schema: add `replaces_document_id TEXT REFERENCES candidature_documents(id)` and its mirror `replaced_by_document_id TEXT`. Combined with `deleted_at` from item 3.
- [ ] Backend: upload endpoint on the 3 required types — transactional: insert new row, link old→new + new→old, soft-delete old. `other` uploads unchanged (unlimited).
- [ ] Backend: `GET /api/recruitment/candidatures/:id/documents/slots` returns `{cv, lettre, aboro, other: [], history: {cv: [...], lettre: [...], aboro: [...]}}`.
- [ ] State machine integration: ADR `docs/decisions/2026-XX-document-slots-gates.md` lists which transitions require which slots + bypass UX ("Avancer sans les pièces requises — raison obligatoire").
- [ ] Transition endpoint gate: `recruitment.ts:516` checks required slots; returns 422 with the missing list; `?bypass=1` permitted with `requireLead` + required reason.
- [ ] UI: `SlotCard` component (empty dropzone / filled card with Voir / Télécharger / Renommer / Remplacer / Supprimer / Historique).
- [ ] UI: `AdminPool` for `other` type (unchanged UX).
- [ ] Pipeline card: `DocsBadge` showing `0/3` – `3/3` with color; hover shows the missing slot.
- [ ] Mobile: slots stack vertically; upload via explicit "Téléverser" button (drag-drop optional on desktop).
- [ ] Empty / loading / error states per slot.
- [ ] A11y: each slot has labelled drop target + keyboard-triggered file picker.
- [ ] Test: upload CV twice → old deleted + linked; history API returns both; bypass transition without reason → 400; with reason → logged event.

### [ ] 8. Live scan status via typed SSE event bus (single-replica scoped)
**Deployment reality (codex):** SSE on in-process event bus is OK **today** (app runs single-replica via `Recreate` strategy) but silently drops updates if we scale out. Document the constraint now.
**Auth reality:** `EventSource` cannot send custom headers. Must use cookie/session auth + per-candidature ownership check on the stream endpoint.
**Shared infra:** this builds the generic bus reused by items 12 and 19.

Subtasks:
- [ ] New `server/lib/event-bus.ts` — typed channels `document_scan_updated`, `extraction_run_completed`, `status_changed`. In-process EventEmitter wrapper with type safety.
- [ ] Endpoint `GET /api/recruitment/candidatures/:id/events/stream` — reads session cookie, runs `requireLead`, then checks the requester is permitted on that candidature; SSE emits typed events with `JSON.stringify` payload.
- [ ] Wire ClamAV + VirusTotal pipeline to publish `document_scan_updated` on state change.
- [ ] Frontend hook `useCandidatureEventStream(candidatureId)` with `EventSource`, auto-reconnect, 3 s polling fallback on disconnect > 3 s.
- [ ] React Query integration: merge stream events into cache via `setQueryData`.
- [ ] Heartbeat `: keep-alive` every 15 s; server closes idle connections > 5 min.
- [ ] ADR: `docs/decisions/2026-XX-event-bus.md` — "in-process only; replace with Cloud Pub/Sub or Redis stream before scaling beyond 1 replica".
- [ ] Test: upload doc → SSE `scan_status=scanning` → `clean` without reload; kill connection → polling fallback keeps UI fresh.

### [ ] 9. Scan detail panel — reuse existing `scan_result` column, scoped overrides
**Reality (codex):** scans already stored as JSON on `candidature_documents.scan_result` (db.ts:357, written at recruitment.ts:852). No `document_scans` table exists. **Don't invent one — extend the existing column.**
**Security (codex):** tenant-wide hash whitelist = permanent malware bypass. Overrides must be scoped to one document, have an expiry, require a reason, and be audit-logged.

Subtasks:
- [ ] Audit the current scan pipeline: confirm it persists the full VT JSON in `scan_result` (not just a summary); if summarized, migrate to persist full payload + back-compat read.
- [ ] Backend: `GET /api/recruitment/.../documents/:id/scan` returns the stored `scan_result` JSON + computed summary.
- [ ] Schema: new `scan_overrides (id, document_id, verdict, reason, expires_at, created_by, created_at)`; default `expires_at = created_at + 30d`.
- [ ] Backend: `POST /api/recruitment/.../documents/:id/scan/override` — `requireLead`-only, body `{verdict: 'safe'|'quarantine', reason (min 10 chars), expires_at? ISO}`.
- [ ] Frontend: `ScanDrawer` with tabs Summary / ClamAV / VirusTotal; engines grid with filter "only detections"; override form with mandatory reason.
- [ ] Audit: override logged to `candidature_events (type='document', notes='scan_override: {verdict} — {reason}')`.
- [ ] Re-scan path unchanged; expired overrides revert to raw scan result.
- [ ] Test: override with reason → badge reflects new state; expiry → original verdict displayed; override without reason → 400.

### [ ] 10. Transparency for CV extraction (depends on item 2)
**Sequencing:** do not start until item 2 persistence ships.
**Dropped (codex):** "Why not this skill?" exploration (scope creep).

Subtasks:
- [ ] `ExtractionDrawer` component (shared w/ item 11) showing fields with `{value, confidence, source_span}`.
- [ ] Confidence pill: green ≥0.9 / amber 0.7–0.9 / red <0.7.
- [ ] Hover-to-highlight: hovering a field highlights the span in the CV preview (iframe uses item 4's preview endpoint).
- [ ] Filter: all / ambiguous (<0.7) / high-confidence.
- [ ] Run selector: view a specific extraction run from history.
- [ ] Test: hover a field → correct CV line highlighted.

### [ ] 11. ABORO transparency — structured-answer model
**Reality (codex):** ABORO extraction outputs structured profile blobs at `server/lib/aboro-extraction.ts:37`, not field-with-span evidence. The "mirror of item 10" claim is wrong without adaptation.

Subtasks:
- [ ] Inspect `aboro-extraction.ts:37`: document the output shape (questions → dimensions → scores + open-text?).
- [ ] Adapt drawer: group by question/dimension; per-answer confidence; for open-text, link back to the ABORO PDF paragraph (no span highlighting — paragraph anchor).
- [ ] Reuse drawer shell from item 10 with `type="aboro"` and an ABORO-specific data adapter.
- [ ] ADR: what "source anchor" means for ABORO open-text vs. score dimensions.

### [ ] 12. Re-run extraction w/ merge + history (scope-tight)
**Dropped (codex):** majority-vote 3× runs (token burn, no product value yet).
**Infra:** use the generic bus from item 8 (`extraction_run_completed`), not the AV scan stream.
**Budget guard:** persisted DB counter, not in-memory (survives restart).

Subtasks:
- [ ] Merge function (pure, unit-tested): `additive` (never overwrite) + `recruiter-curated` (diff → accept/reject). "Confidence-weighted auto-overwrite" is safe only on unlocked fields (item 2's lock model).
- [ ] Backend: `POST /api/recruitment/candidatures/:id/extract` `{type, strategy}` → async run, returns `run_id`.
- [ ] Publish `extraction_run_completed` on event bus (item 8).
- [ ] Persisted rate limit: `extraction_usage (user_id, day, count, tokens_spent)`; 429 on cap; cap configurable per env.
- [ ] Prompt/model version tracking in `candidate_extractions`; "Re-run suggested" banner when stored version < current.
- [ ] UI: history timeline (vertical cards, diff summary).
- [ ] UI: diff modal per run with per-field accept/reject; locked fields never proposed as overwrite candidates.
- [ ] Export run history as aggregated JSON (no PII) for prompt tuning.
- [ ] Test: second run with different output → diff shows additions; rate-limit breach returns 429.

### [ ] 13. Compatibility % explanation — real formulas + lazy endpoint
**Reality (codex):** real formulas live at `server/lib/compatibility.ts:17` (poste) and `:123` (équipe/soft). Don't invent math. Publish those.
**API shape:** lazy detail endpoint per `(candidature, metric)`; do NOT inflate list payloads.
**Dropped:** percentile benchmark — no `/postes/:id` endpoint exists in the repo; build detail route separately first.

Subtasks:
- [ ] Read + document the actual formulas at compatibility.ts:17 and :123.
- [ ] Refactor each into a pure function returning `{total, breakdown: [{axis, candidate_score, target_score, weight, contribution}]}`.
- [ ] Unit tests for each: edge cases (empty axes, zero weight, missing score, caps).
- [ ] New endpoint `GET /api/recruitment/candidatures/:id/compat/:metric` (metric ∈ `poste|equipe|soft`) — lazy, called on click, not on list.
- [ ] UI: `%` pill clickable → popover with top 3 contributors (+/-); "Voir les détails" opens drawer with KaTeX-rendered formula + waterfall + what-if sliders (local state only).
- [ ] "Copier l'explication" exports breakdown as markdown for recruiter notes.

### [ ] 14. (FOLDED into item 1)
*See item 1 Phase 1 — the "préselectionné" alert overflow is the same root cause as the candidate-page responsiveness bug. Close this entry after item 1 Phase 1 ships.*

### [ ] 15. Revert status changes — side-effect-aware
**Safety (codex):** revert-by-last-event is unsafe if the forward step already sent an email or triggered onboarding. Need a side-effect matrix + block/compensate.
**Discoverability (codex):** revert affordance on the event row, not only on a toast.

Subtasks:
- [ ] New `server/config/status-transitions.ts` — per transition: `{side_effects: Array<'email_sent'|'onboarding_started'|'webhook_fired'|'none'>, reversible: boolean}`.
- [ ] Backend: `POST /api/recruitment/candidatures/:id/revert-status` — within 10 min, same user; consult matrix → if irreversible, 422 with reason; if `email_sent`, require `compensate=send_correction|none` in body.
- [ ] Emit new `status_change` event with `notes='reverted'`; never delete original.
- [ ] UI: every eligible timeline event gets an "↩ Annuler" affordance; disabled with tooltip when not eligible.
- [ ] UI: post-status-change toast also offers "Annuler" for 10 s as a convenience.
- [ ] Email compensation template: pre-drafted FR "Correction — votre candidature reste à l'étape X".
- [ ] Test: revert in window updates status + logs; revert after 10 min → 409; revert after email_sent without compensate → 422; with compensate=send_correction → correction email goes out + logged.

### [ ] 16. Confirmation gate + preview + optional delayed send
**Reuse (codex):** existing render pipeline at `server/lib/email.ts:258` / `:303`. Build a preview route over it, NOT a second renderer.
**Scope (codex):** delayed send is OPT-IN per risky status (refuse, proposition), not global — global delay changes delivery semantics unnecessarily.
**Audit:** "skip email" requires mandatory reason.

Subtasks:
- [ ] Backend: `POST /api/recruitment/emails/preview` body `{candidature_id, transition}` → calls email.ts:258 renderer, returns HTML WITHOUT sending.
- [ ] UI: `ConfirmEmailDialog` wraps forward-transition actions; shows HTML in iframe; buttons: "Envoyer & avancer" / "Avancer sans e-mail" / "Annuler".
- [ ] Skip-email: mandatory reason input (min 10 chars) → logged to `candidature_events`.
- [ ] Double-click guard: submit disabled 1 s after render.
- [ ] Optional 30 s delayed send — flag on specific transitions (refuse, proposition); Resend scheduled send OR in-process scheduler; cancel via `DELETE /api/recruitment/emails/queued/:id` in the window.
- [ ] Countdown toast for the queued case.
- [ ] Telemetry: skip-email + undo counters.
- [ ] Test: preview HTML matches real send; skip-email without reason → 400; undo within 30 s cancels.

### [ ] 17. React Email — migrate in place (inventory-first)
**Reality (codex):** email logic centralized at `server/lib/email.ts:258` with partial React Email usage. Don't invent a `server/emails/**` tree — do an inventory + migration map.
**Descope (codex):** full Litmus/Email-on-Acid program is overkill for an internal tool.

Subtasks:
- [ ] Inventory: list every outgoing email function in `server/lib/email.ts`; mark current state (React Email / plain HTML / string template).
- [ ] ADR: keep them in-file with React Email components inline OR split into `server/lib/emails/*.tsx`. Commit the decision.
- [ ] Shared `EmailLayout.tsx` pulling brand tokens from `server/lib/brand.ts` (logo CDN URL, primary/secondary, footer legal FR, signature component).
- [ ] Migrate each template to `EmailLayout` incrementally; preview via `/dev/emails` route (dev-only gate).
- [ ] Sanity checks: one manual render each in Gmail web, Outlook web, iOS Mail; commit screenshots.
- [ ] `docs/emails.md` — "how to add/update a template".

### [ ] 18. AI-generated body, templated wrapper (privacy-safe)
**Dropped (codex):**
- Byte-identical HTML assertion (brittle + meaningless) → assert **structural DOM invariants** (same component tree, same classnames).
- "Train on recruiter edits" — privacy/compliance trap. Log edits for audit only; no ML pipeline on candidate PII without explicit opt-in.

Subtasks:
- [ ] `server/emails/ai-schema.ts`: LLM returns only `{subject, greeting, main_paragraph, call_to_action}`.
- [ ] Version-controlled prompt at `server/prompts/email-generation.md`: tone guardrails, "vous", no emojis, short paragraphs.
- [ ] Structured output mode; reject + regenerate on schema violation.
- [ ] React Email layout slots: the four LLM fields; everything else is template.
- [ ] Recruiter edits logged to `candidature_events (type='email', notes='body edited before send')` — audit only.
- [ ] Test: render 3 different candidates → identical component tree + brand tokens; schema violation forces regen.

### [ ] 19. Pipeline-card badges — wire real data first, skip speculative priority
**Reality (codex):** list endpoint at `server/routes/recruitment.ts:302` doesn't return most of the data the badges need. Define the payload + ship backend BEFORE fancy UI.
**Descope:** priority scoring until docs/time/SLA badges are real AND recruiters ask for more.
**Defer:** SSE realtime — ship stable computed badges with periodic refetch first.

Subtasks:
- [ ] Type `CandidatureSummary` on server: `{statut, days_in_status, docs_complete: '0/3'…'3/3', canal, last_candidate_reply_at, compat: {poste, equipe, soft}}`.
- [ ] Backend: extend recruitment.ts:302 list query (join MAX(events.created_at) for time-in-status; COUNT per type for docs_complete).
- [ ] SLA config at `server/config/sla.ts`; breach adds a border to StatusChip.
- [ ] `StatusChip` (status + time-in-status + breach border).
- [ ] `DocsChip` (reuses item 7 `/3` badge).
- [ ] `CompatSparkline` (three mini-bars).
- [ ] `SourceIcon` per canal.
- [ ] "Needs-action" filter (local state).
- [ ] A11y: composite `aria-label` per composite chip.
- [ ] Defer list: priority scoring, SSE subscription (pair with item 8 once that ships).
- [ ] Test: list endpoint returns expected summary shape; UI renders all chips correctly.

### [ ] 20. Funnel v2 — cut HARD to one phase-1 bottleneck iteration
**Drastic scope cut (codex):** item 20 was "three quarters of analytics work". Ship ONE high-value thing first: bottleneck / time-in-stage overlay on the existing funnel.
**Data model fix:** refusal reason belongs on the `candidature_events` payload (`status_to='refuse'`), NOT a new column on `candidatures` (which loses history on re-refuse).
**No premature caching:** measure query cost first; no materialised views without evidence.
**Touches:** `server/routes/recruitment.ts:217` + `src/pages/recruit-funnel-page.tsx:51`.

Phase 1 (ship this):
- [ ] Backend: extend funnel endpoint to return per-link `p50_days_in_source_stage`, `p90_days_in_source_stage` + per-node `total_candidates_ever_here`.
- [ ] Frontend: hover tooltip per node shows p50 / p90; auto-highlight worst-conversion stage with a sentence ("Ralentissement ici — p50 12 j").
- [ ] Refusal reason captured in events: modify refuse action to require a reason; store in `candidature_events.notes` (structured prefix `reason:`); no schema change on `candidatures`.
- [ ] Refuse sub-breakdown: hover on "refuse" bucket shows counts by reason.

Phase 2 (gate on phase 1 value):
- [ ] Cohort compare (two date ranges side-by-side).
- [ ] Forecast (simple Markov chain over historical transitions).
- [ ] Saved views, boxplots, sparklines, source-attribution coloring.

### [ ] 21. Pipeline page — patch current bugs FIRST, redesign only if needed
**Reality (codex):** list ↔ kanban toggle already exists at `src/pages/recruit-pipeline-page.tsx:125`; read-only kanban at `src/components/recruit/kanban-board.tsx:155`. Current kanban horizontally scrolls.
**Rule:** patch the auto-scroll bug at `recruit-pipeline-page.tsx:135` and the filter UX first; DO NOT default to kanban (it's read-only + horizontal scroll, fails the "triage fast" goal).

Phase 1 (ship this — ~1 day):
- [ ] Repro and fix the auto-scroll at `recruit-pipeline-page.tsx:135`. No redesign.
- [ ] Replace filter UX with chip row: "Stuck > 7j", "Docs manquants", "Mes candidats", "Bounces". Chip-based, multi-select.
- [ ] Keep LIST as default; existing kanban toggle remains for browsing.
- [ ] Density toggle (compact / comfortable) persisted in localStorage.
- [ ] Saved views via URL params + localStorage; no server-side user-pref API (doesn't exist in repo, defer).

Phase 2 (gate on Phase 1 pain + measured time-to-triage):
- [ ] Kanban drag-drop with confirm gate (item 16) — requires fixing read-only + horizontal scroll in kanban-board.tsx:155.
- [ ] Group-by toggle (status / poste / pôle / recruiter / canal).
- [ ] Virtual scrolling only if list perf degrades at N > 500.
- [ ] Bulk actions only if recruiters request.
- [ ] Keyboard-first (j/k/e/v/s/f/?).

---

## Cross-cutting follow-ups across the batch

- [ ] **Consolidated design system pass** — items 1, 7, 17, 19, 21 all touch visual language. `/design-review` candidate after two of these ship.
- [ ] **Generic typed event bus (`server/lib/event-bus.ts`)** — shared by items 8, 12, 19. Cookie auth + per-candidature ownership check. ADR documents single-replica-only constraint.
- [ ] **Extraction runs + per-field locks** — items 2, 10, 11, 12 share `candidate_extractions` + `candidate_field_overrides`. Design together before starting item 2.
- [ ] **Email preview + optional delayed send + skip-with-reason** — items 16, 17, 18 converge. Ship preview + audit primitives first, templates second.
- [ ] **Transparency pattern** — items 10, 11, 13 all need "how did the AI compute this". Extract `<Explain>` component (popover on hover, drawer on click, source-span highlight where applicable, confidence pill).
- [ ] **Authorization + audit model (ADR REQUIRED before items 3, 9, 15, 16)** — codex flagged: repo has only `requireLead` + `getUser(req)`; many subtasks say "admin" with no role to back it. Define: (a) roles beyond lead (admin? per-pôle lead?); (b) audit standard — every state-changing action writes `candidature_events` row w/ actor + reason; (c) lead-vs-admin split for dangerous ops (overrides, deletes, reverts, bypass gates).
- [ ] **Data retention / export / erasure ADR** — codex flagged: new sensitive stores (`candidate_extractions`, full VT payloads, AI email drafts, refusal reasons in events, queued emails, scan overrides) have no policy. Define: retention windows per store; per-candidate JSON export format; hard-delete trigger on candidature deletion (including GCS objects); GDPR-style right-to-erasure flow.

---

## Codex adversarial review applied (2026-04-17)

Codex raised **49 concrete criticisms** against the original 21-item batch; all applied above. Highlights:

- **Factual corrections** (wrong table/column/file refs):
  - Real table is `candidature_documents` (not `documents`), column `uploaded_by` (not `created_by`), scans stored in `scan_result` JSON column (no `document_scans` table).
  - Download handler is `recruitment.ts:831` + `document-service.ts:135` (not 840/884).
  - ZIP stack is `archiver` (already in repo), not `jszip`.
  - Real compatibility formulas live at `compatibility.ts:17` and `:123` — the innovation block previously invented math.
  - Pipeline page already has list↔kanban toggle at `recruit-pipeline-page.tsx:125` + kanban at `kanban-board.tsx:155`.
- **Dropped as out-of-scope / dangerous:**
  - Face / photo extraction from CVs (privacy risk).
  - Real-CV fixtures in git (PII leak).
  - Permanent tenant hash-whitelist for scan overrides (malware bypass).
  - Train-on-recruiter-edits ML pipeline on candidate PII (compliance trap).
  - Majority-vote 3× extraction (token burn, no proof).
  - Global 30 s delayed-send on every transition (changes delivery semantics).
  - Byte-identical email HTML assertion (brittle).
- **Scope gates added:** items 1, 20, 21 now have explicit Phase 1 / Phase 2 splits; item 14 folded into item 1.
- **Missing cross-cutting work surfaced:** authorization + audit ADR; data retention + erasure ADR — both blocking items 3 / 9 / 15 / 16.

TOP-RISK (codex): items 20, 2, 12 — scope discipline critical, phase gates enforce it.

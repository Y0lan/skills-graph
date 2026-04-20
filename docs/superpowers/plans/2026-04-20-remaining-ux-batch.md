# Remaining UX batch — execution plan (2026-04-20)

Generated after shipping 13 items + multi-poste candidate unification + all 14 codex findings.
Last-pushed commit: `1f4499d` on `dev`. 233 tests pass.

## Loop per item

For every item in the order below:

1. **Plan** — quick brainstorm (this doc holds the decomposition; expand inline if a sub-question surfaces)
2. **Challenge plan with codex** — only when the change is architectural or cross-cutting (skip for tactical 1-file edits)
3. **Code** — small focused commit
4. **Challenge code with codex** — diff review on substantive commits (>3 files or anything touching schema / state machine / email send / scoring)
5. **Fix any P0/P1 codex findings** in a follow-up commit
6. **Ship** — push to `dev`
7. **QA** — `npm test` (must stay green) + `tsc --noEmit` (must stay clean) + manual click-through on at least the changed page
8. **Move on**

Skip steps 2 and 4 only when the item is small enough that the codex round-trip costs more than it saves (single file, <50 lines, no schema, no email).

## Already-shipped phases (context for codex / re-readers)

- Item 1 Phase 1 — responsive overhaul + fold of Item 14 — `f9c99e8`
- Item 20 Phase 1 — funnel time-in-stage + bottleneck insight — `63d2c77`
- Item 21 Phase 1 — pipeline auto-scroll fix — `cc8471f`

So this plan ships Phase 2 of those items, NOT Phase 1.

## Required ADRs before Tier A finishes

Codex flagged that several items (3, 8, 9, 15, 16, 18) write to or read from
sensitive stores or trust boundaries we haven't formalised. Block their merge
behind two short ADRs:

- **`docs/decisions/2026-XX-authorization-and-audit.md`** — define roles
  beyond `requireLead` (read-only Franck? per-pôle lead? external recruiter?)
  + per-candidature ownership rule used by the SSE auth gate (Item 8) and
  scan overrides (Item 9). Skip-email reasons + revert audit semantics
  (Item 15, 16) reference this ADR. ~30 min to write, 0 code.

- **`docs/decisions/2026-XX-data-retention-and-erasure.md`** — retention
  windows + export format + hard-delete trigger for: `candidate_extractions.raw_output`
  (Item 2/12), AI email drafts (Item 18), refusal reasons (Item 20 P1 already
  ships these in events), queued emails (Item 16), scan overrides (Item 9 done),
  full VirusTotal payloads (Item 9 polish). Includes a decision on whether
  to keep auto-uploading CV/lettre to VirusTotal at all (third-party DPA risk).

These ADRs ship as part of the first PR that touches the affected store.

## Per-category codex review rule

Codex correctly flagged that "skip codex on tactical 1-file edits" is too lax.
Override: **always** run the codex review pass on any commit that touches:

- auth or route ordering (`server/index.ts`, middleware/, route declarations)
- MIME / file handling (`server/lib/document-service.ts`, multipart parsing)
- SSE / streaming response headers
- email rendering or HTML sanitisation
- DB CHECK constraints or schema migrations
- the state machine

For everything else (CSS tweaks, copy changes, single-component edits) the
"tactical" exemption stands.

## Optimal order (revised after codex challenge)

### Tier A — Email pipeline (REORDERED 17 → 16 → 18)

Codex point: building AI body wrappers (18) before the preview/skip/audit
primitives (16) risks plumbing structured output through an outgrowing UX.
Ship preview + confirm gate FIRST, then AI body slots into a stable contract.

All three items share **one renderer contract** — `renderTransitionEmail({statut, candidate, customBody?})` — used identically by preview, dev-emails route, and actual send. Define it once in Item 17.

1. **Item 17 — Brand tokens + `/dev/emails` route + renderer contract**

   *Already in repo (per session memory + grep):* React Email is wired,
   `server/emails/sinapse-layout.tsx` exists, all six templates use it via
   `render()` calls in `server/lib/email.ts:33,68,104,125,156,…`. The
   "migration" part is largely done. What's missing:

   - Centralise hardcoded brand bits (`#008272`, logo URL, sinapse.nc, address)
     into `server/lib/brand.ts`.
   - Define and export `renderTransitionEmail({statut, ctx})` in `server/lib/email.ts`
     so Items 16 and 18 reuse one path.
   - **Hard-gate** `/dev/emails` route: `NODE_ENV !== 'production'` AND
     `requireLead` (codex flagged: PII leak risk if mounted in prod with mock data).
   - Brief `docs/emails.md` listing the 6 templates and how to add a new one.

2. **Item 16 — Email confirm gate + HTML preview + durable delayed send**
   - Backend: `POST /api/recruitment/emails/preview {candidature_id, transition}`
     calls `renderTransitionEmail` and returns HTML.
   - Frontend: `ConfirmEmailDialog` shows HTML in iframe.
   - Skip-email mandatory reason (≥10 chars), audit-logged.
   - **Codex fix:** delayed send must survive pod restart. Either use
     Resend's `scheduled_at` parameter (no in-process queue, no recovery
     needed) **or** persist a `queued_emails` table with a boot-time
     "send everything past `due_at`" sweep. Recommend Resend's scheduled
     send — zero infra cost, vendor handles durability.

3. **Item 18 — AI-body wrapper with structured output**
   - `server/emails/ai-schema.ts` → `{subject, greeting, main_paragraph, call_to_action}`.
   - System prompt at `server/prompts/email-generation.md`.
   - Anthropic structured-output mode; reject + regenerate on schema violation.
   - Slot the four LLM fields into the EmailLayout via `renderTransitionEmail`.
   - Recruiter edits logged for audit only (no ML training, codex flagged).

### Tier B — Real-time + analytics (after Tier A's audit ADR is written)

4. **Item 8 — SSE event bus**
   - Auth ADR must define per-candidature ownership before this ships.
   - K8s context: prod runs `replicas: 1` + `Recreate` strategy → in-process
     bus is fine; ADR documents the constraint.
   - **Codex flag:** prod deployment lacks the ClamAV sidecar present in dev.
     Verify scan tests cover the VT-only / skipped-scan paths before relying
     on real-time scan events in prod UX.

5. **Item 20 Phase 2 (cut hard)** — cohort compare ONLY
   - Phase 1 already shipped. Phase 2 ships the smallest analytic addition:
     `GET /api/recruitment/funnel/compare?a=&b=` returns two snapshots + diff.
   - Frontend: two date pickers; Sankey link width = ratio (thicker = improvement, red = regression).
   - **Defer** forecast / Markov / saved views until recruiters explicitly request them.

### Tier C — Extraction stack (start with a design spike)

Codex point: jumping into Item 2 implementation without first locking down the
shared schema for runs, source anchors, locks, merge strategies, retention,
and the ABORO adapter creates churn. Spike first.

6. **Item 2 design spike** — write `docs/decisions/2026-XX-extraction-architecture.md`
   - `candidate_extractions` schema + per-field locks
   - Source-span shape (CV) vs paragraph-anchor (ABORO)
   - Merge strategies (`additive` / `recruiter-curated`)
   - Retention (defer to data ADR)
   - Cost accounting
   - 1-page doc, ~1 hour

7. **Item 2 — CV extraction expansion (split into 3 commits)**
   - 7a. Schema + extractor refactor (no UI yet)
   - 7b. Persistence + backfill (separate commit, easy to revert if backfill misbehaves)
   - 7c. UI panel + cost observability counter

8. **Item 10 — CV transparency UI** (depends on 7c)

9. **Item 11 — ABORO transparency UI** (reuses item 10's drawer + ABORO adapter from spike)

10. **Item 12 — Re-run extraction with merge + history** (depends on 7c)

### Tier D — UI redesigns Phase 2

11. **Item 7 P2 — Slot card UI redesign** (backend already shipped in `619b1c0`)
    - Confirmed by codex: backend supersede + slots endpoint already in.
    - This commit is the UI swap on `candidate-detail-page` only.

12. **Item 21 P2 — Kanban drag-drop + smart filter chips**
    - Drag-drop calls into the confirm gate (Item 16) — gated on Tier A.
    - Smart filter chips ride on Item 19's enriched payload (already shipped).

13. **Item 1 P2 — Density toggle / command palette / keyboard map**
    - All three independent, ship one per small commit.

### OLD Tier A (PRE-CODEX) — for diff context

1. **Item 17 — React Email migration inventory + EmailLayout**
   - Why first: 18 and 16 both want a renderable HTML pipeline.
   - Inventory: `server/lib/email.ts:21,59,94,142,194,375` (six send sites). Mark each: pure plain HTML, partial React Email, or string template.
   - Build `server/emails/EmailLayout.tsx` (header logo, footer legal FR, signature, brand tokens from `server/lib/brand.ts`).
   - Migrate one template at a time inside `email.ts` to use `@react-email/components` rendered through the layout.
   - Dev-only `/dev/emails` route: iframe each template with mock data (helps iterate without sending).
   - Deferred: Litmus / cross-client matrix. One manual sanity check in Gmail web + Outlook web is enough for an internal tool.

2. **Item 18 — AI-body wrapper with structured output**
   - Define `server/emails/ai-schema.ts` → `{subject, greeting, main_paragraph, call_to_action}`.
   - Move tone guardrails to `server/prompts/email-generation.md` (version-controlled).
   - Anthropic structured-output mode; reject + regenerate on schema violation.
   - Layout slots the four LLM fields; everything else is React Email code.
   - Recruiter edits logged to `candidature_events (type='email', notes='body edited before send')` — audit only, no ML training.
   - Tests: render 3 different candidates → identical component tree, body text differs.

3. **Item 16 — Email confirm gate + HTML preview + opt-in delayed send**
   - Backend: `POST /api/recruitment/emails/preview {candidature_id, transition}` → returns rendered HTML using existing renderer (no second pipeline).
   - Frontend: `ConfirmEmailDialog` shows HTML in iframe before send; "Envoyer & avancer" / "Avancer sans e-mail (raison: …)" / "Annuler".
   - Skip-email reason mandatory (≥10 chars), audit-logged.
   - Optional 30s delayed send for `refuse` and `proposition` only (not global). Resend `scheduled_at` param; `DELETE /emails/queued/:id` cancels.
   - Toast countdown for queued case.
   - Telemetry: skip-email + undo counters.

### Tier B — Real-time + analytics (2 items, independent of email)

4. **Item 8 — Live SSE event bus**
   - `server/lib/event-bus.ts`: typed channels `document_scan_updated`, `extraction_run_completed`, `status_changed`. EventEmitter wrapper.
   - `GET /api/recruitment/candidatures/:id/events/stream`: cookie-authenticated, candidature-ownership check, SSE emits typed events.
   - Hook ClamAV/VT pipeline + status-change endpoint to publish.
   - Frontend `useCandidatureEventStream(candidatureId)`: `EventSource`, auto-reconnect, 3s polling fallback.
   - React Query merges into cache.
   - ADR `docs/decisions/2026-XX-event-bus.md`: in-process only, replace before scaling beyond 1 replica.
   - Test: upload doc → SSE `scanning` → `clean` without reload; kill connection → polling fallback.

5. **Item 20 P2 — Funnel cohort compare + forecast (cut hard)**
   - Phase-2 of item 20. Drop forecast / saved views / boxplots scope (codex flagged earlier).
   - Ship: cohort compare (two date ranges side-by-side, diff Sankey).
   - Backend: `GET /api/recruitment/funnel/compare?a={range}&b={range}` returns two snapshots + diff per link.
   - Frontend: two date pickers; Sankey shows ratio links (thicker = bigger improvement, red = regression).

### Tier C — Extraction stack (depends on Item 2 schema landing)

Sequence is hard: 10/11 need 2's persistence; 12 needs 2 + 10. Ship 2 first, then 10/11/12 in parallel where possible.

6. **Item 2 — CV extraction expansion**
   - Schema: `candidate_extractions (id, candidature_id, type, run_id, prompt_version, model_version, raw_output JSON, parsed_output JSON, merge_strategy, created_by, created_at)`.
   - Per-field locks: `candidate_field_overrides (candidature_id, field_name, value, locked_by, locked_at)`.
   - Refactor `cv-extraction.ts:231` → `extractCvFull(buffer, options)` returns `{value, confidence, source_span}` per field.
   - Wire write path: `candidates.ts:156` persists extracted fields + extraction row.
   - Backfill job: `scripts/backfill-cv-extractions.mjs` — replay on existing candidates, skip locked fields.
   - Synthetic fixtures: 10 fabricated CVs in `tests/fixtures/cvs/` + gold labels JSON. **Never commit real candidate CVs.**
   - UI: extracted-field panel on candidate detail; hover-span highlights CV; per-field 🔒 lock toggle.
   - Cost observability: `cv_extraction_cost_eur` counter.
   - **Dropped scope (codex):** profile photo / face extraction, gender/age as stored attributes, train-on-recruiter-edits.

7. **Item 10 — CV transparency UI**
   - `ExtractionDrawer` with `{value, confidence, source_span}` per field.
   - Confidence pill: green ≥0.9 / amber 0.7-0.9 / red <0.7.
   - Hover-to-highlight on CV preview iframe (uses item 4's preview endpoint).
   - Filter: all / ambiguous (<0.7) / high-confidence.
   - Run selector: switch between extraction runs.

8. **Item 11 — ABORO transparency UI**
   - Adapter: ABORO's structured profile → drawer rows.
   - Per-question confidence + source-paragraph anchor (no span highlighting since ABORO PDF parsing is paragraph-scoped, not span-scoped).
   - Reuses drawer shell from item 10 with `type='aboro'` adapter.

9. **Item 12 — Re-run extraction with merge + history**
   - Merge function (pure, unit-tested): `additive` (never overwrite) + `recruiter-curated` (diff → accept/reject). Locked fields never overwritten.
   - Backend: `POST /api/recruitment/candidatures/:id/extract` `{type, strategy}` async, returns `run_id`.
   - Publish `extraction_run_completed` on event bus (item 8).
   - Persisted rate limit: `extraction_usage (user_id, day, count, tokens_spent)`; 429 on cap.
   - Prompt-version + model-version banner: "Re-run suggested" when current version > stored version.
   - UI: history timeline (vertical cards); diff modal per run with per-field accept/reject.
   - Export run history aggregated JSON (no PII) for prompt tuning.
   - **Dropped (codex):** majority-vote 3× runs.

### Tier D — UI redesigns (visible polish, no infra blocking)

10. **Item 7 P2 — Slot card UI redesign**
    - Replace current "type select + upload" with three required slot cards (CV / Lettre / ABORO) + admin pool (`other`).
    - Each slot: empty dropzone OR filled card with view/download/rename/replace/delete + per-slot history drawer.
    - Pipeline DocsBadge already wired (item 19).
    - Mobile: slots stack vertically; tap-to-upload (drag-drop optional).

11. **Item 21 P2 — Kanban drag-drop + smart filter chips**
    - Kanban: `@dnd-kit/sortable` drag with confirm gate (item 16).
    - Smart filter chips at top: "Stuck > 7j", "Docs manquants", "Mes candidats", "Bounces". Multi-select. Powered by Item 19's enriched payload.
    - Group-by toggle (status / poste / pôle / recruiter / canal) — defer if scope grows.
    - Virtual scrolling (only if list perf degrades at N>500).

12. **Item 1 P2 — Density toggle / command palette / keyboard map**
    - Density: compact / comfortable / detailed; persisted in localStorage.
    - `⌘K` palette via shadcn `Command`.
    - Keyboard: `E` edit status / `R` refuser / `P` préselectionner / `V` view CV / `S` shortlist / `/` search / `?` help.

## Cross-cutting that ships JIT

- **EmailLayout component + render route** (Tier A, lands with Item 17)
- **Generic event bus** (Tier B, lands with Item 8)
- **`<Explain>` component** (Tier C, lands with Item 10 — drawer shell)
- **`candidate_extractions` + `candidate_field_overrides` schema** (Tier C, lands with Item 2)
- **Email preview endpoint** (Tier A, lands with Item 16)

## Risk register

| Risk | Item(s) | Mitigation |
|---|---|---|
| Schema migration on Litestream-backed SQLite | 2 | Idempotent ALTERs only; no ALTER COLUMN; recreate-table only when CHECK widening needed; tested by full app boot in CI |
| Email pipeline regression (production-facing) | 17, 18, 16 | Migrate templates one at a time; smoke-render in `/dev/emails`; manual send to test inbox before flipping production |
| SSE in-process limits | 8 | Documented in ADR; works for single-replica today; flag scale-out as a separate ADR |
| AI cost spike | 2, 12 | Per-day budget guard in DB (`extraction_usage`); 429 on cap; log every run cost |
| Privacy regressions | 2, 12, 18 | NO face/photo extraction, NO recruiter-edit ML training, NO real CVs in fixtures, structured output schemas reject unwanted fields |

## QA checklist (template, run after each item)

- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` 233+ pass
- [ ] Manually exercise the changed page on Chrome (look for console errors)
- [ ] If touching email: send a test email to your own address before promoting
- [ ] If touching schema: boot the app fresh (drop local DB) to confirm migrations are idempotent

## Definition of done per item

- Code shipped on `dev` with descriptive commit message
- All tests green
- TS clean
- Codex review either passed or its findings shipped in a follow-up
- TODOS.md item marked done with the closing commit hash

## Reference: prior session shipped (for context)

- 13 items + multi-poste candidate unification + 14 codex findings cleared.
- Last commit before this plan: `1f4499d`.

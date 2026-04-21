# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0.0] - 2026-04-21 — CV Intelligence v1

### Added

- **Phase 0 — One true CV pipeline + extraction state machine.** New `server/lib/cv-pipeline.ts` orchestrates every CV-to-scoring flow. Direct upload (`POST /api/candidates`) and Drupal intake both route through `processCvForCandidate`. CAS-locked status machine (`idle | running | succeeded | partial | failed`) on `candidates.extraction_status` prevents concurrent runs and surfaces failures via banner. **Fixes the Pierre LEFEVRE 0% bug** (direct-upload path never computed scores). Regression test enforces the guard.
- **Phase 1 — Audit trail.** `cv_extraction_runs` table logs every LLM call with poste snapshot + catalog version + prompt version + model + token counts + payload. `candidate_assets` content-addressed store (deduped by sha256) holds raw PDFs, extracted CV text, and lettre text. Retention policy keeps 2 most recent successful payloads per (candidate, kind), metadata beyond that, hard-deletes after 90 days (configurable).
- **Phase 2 — Fiche de poste editor.** Pencil icon per poste on the pipeline page opens a dialog to paste the job description (max 20k chars). Hidden for candidature-libre. Description feeds role-aware extraction.
- **Phase 3 — Role-aware skill extraction.** Per-candidature calibrated ratings when the poste has a fiche. Same 20-category parallel extraction, system prompt prepends `<reference type="fiche_de_poste">`. Prompt-injection defense: guard text placed AFTER the reference close tag. Multi-poste candidates get distinct scores per candidature.
- **Phase 3.5 — Shared Anthropic wrapper.** `server/lib/anthropic-tool.ts` generic `callAnthropicTool<T>` wrapper used by all LLM callers.
- **Phase 4 — Structured profile extraction.** New `candidates.ai_profile` JSON with per-field `ProfileField<T>` envelope (value, runId, sourceDoc, confidence, humanLockedAt). Operational recruiting fields only — sensitive fields (DOB/gender/nationality/marital/salary/photo) explicitly out of scope. Zod schema + phone (E.164) / URL / date normalizers via libphonenumber-js. `candidate-profile-card.tsx` with 11 Accordion sections renders at the top of the candidate detail page. Per-field lock button with SQL-level race protection. Lock survives re-extraction.
- **Phase 5 — Lettre de motivation enrichment.** Pipeline fetches the most recent lettre across all candidatures, extracts text, feeds alongside CV into profile extraction. Soft-deleted lettres ignored.
- **Phase 6 — CV-derived categories on candidate form.** Candidates whose CV mentions skills outside the role's default categories see those categories (EXISTING catalog only, never invented) in their form's Discovery step. Rating floor ≥3, evidence-gated, top-5 capped.
- **Phase 7 — Multi-pass critique + reconcile.** After baseline skill extraction, a critique pass identifies issues/missed skills, then a reconcile pass produces the final ratings. Cost-gated (skipped when <3 skills). Baseline persisted FIRST so crashes don't lose work. Reconcile overwrites on success only.
- **Phase 8 — Re-extract + history + diff.** `POST /candidates/:id/reextract` reuses the stored raw_pdf asset (no re-upload). `GET /extraction-runs` + `GET /extraction-runs/:id/payload` + `POST /extraction-runs/compare` power the history dialog (timeline + payload drill-down + typed diff via custom `server/lib/run-diff.ts`). Payload viewer logs access in candidature_events for audit. 410 Gone when retention has pruned a payload.
- **Phase 10 — Shortlist + batch outreach.** `GET /postes/:posteId/shortlist` ranks by `taux_global DESC`, excludes null-scored candidatures. `/recruit/postes/:id/shortlist` page with multi-select → compare (≤5) or batch outreach (≤20). `POST /postes/:posteId/outreach` with X-Idempotency-Key header + per-email error isolation (`{sent[], failed[]}`).

### Changed

- **Phase 9 — Scoring transparency polish.** Fixed `calculateGlobalScore` fallback weights (0.7/0.3/0 → 0.5/0.2/0.3, aligning with `scoring_weights` table default). EQUIPE breakdown dialog now surfaces `getGapAnalysis` + `getBonusSkills` data that had been computing but never rendered. Prompt version + model shown in a footer for auditability.

### Fixed

- Pierre LEFEVRE regression: POST `/api/candidates` with a CV now yields non-null `taux_compatibilite_poste / _equipe / _global` for every candidature.
- `calculateGlobalScore` soft-weight drift when `scoring_weights` row missing.

### Tests

- +95 tests across 11 new test files. Total: 252 → 347 passing. Zero real API calls — Anthropic, unpdf, Resend all mocked.

## [0.1.0.0] - 2026-04-02

### Added
- Per-category CV skill extraction: splits analysis into 18 parallel Claude calls (one per category, ~7-9 skills each) for consistent, deterministic results
- temperature:0 and system/user message separation for extraction prompts
- Reasoning field in tool schema: Claude justifies each rating, logged for debugging
- 18 domain-specific worked examples anchoring skill levels to concrete CV evidence
- Promise.allSettled with failedCategories tracking: partial extraction succeeds even if some categories fail
- Full 6-level descriptors (L0-L5) sent to Claude instead of only L0/L2/L4
- DOCX CV text extraction via mammoth (alongside existing PDF support)
- Integration test framework: 3 synthetic CVs with expected outputs, tolerance-based assertions, self-consistency verification
- 15 unit tests covering per-category architecture, partial failure, validation, and reasoning extraction

### Changed
- extractSkillsFromCv return type: now returns `{ ratings, failedCategories }` instead of raw ratings map
- Candidates route updated to handle new extraction result structure

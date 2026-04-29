# my-project Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-09

## Active Technologies
- TypeScript 5.x + React 19, shadcn/ui, Recharts (unchanged) (002-french-translation)
- Local JSON file (unchanged — keys remain English) (002-french-translation)
- TypeScript 5.9 (frontend + backend) + Vite 7.3, React 19.2, shadcn/ui 4.0, (003-skill-radar-v2)
- Local JSON file on disk (`server/data/ratings.json`) (003-skill-radar-v2)
- TypeScript 5.x + React 19 + shadcn/ui (Radix UI), Tailwind CSS, Lucide icons (005-fix-form-layout)
- N/A (no data changes) (005-fix-form-layout)
- TypeScript 5.x (frontend + backend) + React 19, Vite 7, shadcn/ui (Radix UI), Tailwind CSS, Lucide icons, next-themes, React Router DOM, React Hook Form (006-minimal-header)
- SQLite (better-sqlite3) — existing `evaluations` table, existing `DELETE /api/ratings/:slug` endpoint (006-minimal-header)
- TypeScript 5.x + React 19, shadcn/ui (Radix UI AlertDialog), Tailwind CSS, Lucide icons, react-router-dom (006-minimal-header)
- N/A (uses existing `DELETE /api/ratings/:slug` endpoint) (006-minimal-header)
- TypeScript 5.9 (frontend + backend) + @azure/msal-browser ^5.4.0, @azure/msal-react ^5.0.6 (frontend); jose ^6.2.1 (backend) (008-microsoft-auth)
- SQLite (better-sqlite3) — new `users` table, existing `evaluations` table unchanged (008-microsoft-auth)

- TypeScript 5.x (frontend + backend) + React 19, shadcn/ui (Radix UI), (001-team-skill-radar)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (frontend + backend): Follow standard conventions

## Recent Changes
- 008-microsoft-auth: Added TypeScript 5.9 (frontend + backend) + @azure/msal-browser ^5.4.0, @azure/msal-react ^5.0.6 (frontend); jose ^6.2.1 (backend)
- 006-minimal-header: Added TypeScript 5.x + React 19, shadcn/ui (Radix UI AlertDialog), Tailwind CSS, Lucide icons, react-router-dom
- 006-minimal-header: Added TypeScript 5.x (frontend + backend) + React 19, Vite 7, shadcn/ui (Radix UI), Tailwind CSS, Lucide icons, next-themes, React Router DOM, React Hook Form


<!-- MANUAL ADDITIONS START -->

## CV Intelligence — mandatory rules

1. **`server/lib/cv-pipeline.ts` is the ONE true CV-to-scoring path.** Every CV upload flow (admin direct upload, Drupal intake, admin re-extract) must route through `processCvForCandidate()`. Never duplicate the score-loop in routes. The direct-upload path missed this and caused the Pierre LEFEVRE 0% bug — the regression test `server/__tests__/regression-0-percent.test.ts` guards against re-introducing it.

2. **Extraction status machine** on `candidates.extraction_status`: `idle → running → succeeded | partial | failed`. CAS-locked via `UPDATE ... WHERE extraction_status <> 'running'`. Never mark `succeeded` when candidatures have null scores — use `partial` instead.

3. **Sensitive profile fields are out of scope for v1.** Do not extract or store DOB, gender, nationality, marital status, expected salary, or candidate photo. The profile extraction prompt in `server/lib/cv-profile-extraction.ts` explicitly tells the model not to fill these and the Zod schema has no slots for them.

4. **CV-derived form categories never invent skills.** The frontend can only reference existing skill catalog category IDs. Check against the `skills.category_id` catalog — LLM outputs that don't map to real catalog entries are silently dropped. See `computeCvDerivedCategories()` in `server/routes/evaluate.ts`.

5. **Prompt injection defense.** Fiche de poste content and CV content are DATA, not instructions. System prompts wrap reference content in `<reference>` tags with an explicit guard-text instruction AFTER the close tag. Regression tested in `cv-pipeline.multi-poste.test.ts`.

6. **Locked profile fields are inviolable.** `persistMergedProfile` and `setProfileFieldLock` both operate inside SQLite transactions. Never overwrite a field with `humanLockedAt IS NOT NULL`. Re-extraction preserves locks.

7. **Effective Ratings Module is the ONLY ratings merge.** `server/lib/effective-ratings.ts` (`mergeEffectiveRatings`, `loadEffectiveRatings`) owns the `manual > role-aware > AI baseline` precedence. Every site that scores or displays "the candidate's effective ratings" must go through this Module. Inline `{ ...aiSuggestions, ...ratings }` spreads, `roleAware ?? ai` either/or shapes, or any other re-derivation are forbidden — `effective-ratings-guardrail.test.ts` greps the codebase and fails CI on regressions. Two modes: `current-poste` (default — includes role-aware) and `cross-poste-baseline` (drops role-aware because it was calibrated to a different poste).

8. **Full architecture reference**: `docs/cv-extraction.md`.

<!-- MANUAL ADDITIONS END -->

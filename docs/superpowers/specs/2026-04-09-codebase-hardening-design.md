# Codebase Hardening & Decomposition — Design Spec

**Date:** 2026-04-09
**Branch:** feat/candidate-evaluator
**Target:** dev.radar.sinapse.nc
**Approach:** Security-first (Phase A), then full architecture decomposition (Phase B), with verification gates between each phase.

## Context

CSO audit (2026-04-09) scored the codebase at 6/10 overall. One CRITICAL finding (webhook auth fail-open), several below-gate items worth hardening, and significant architectural debt in god files. All 90 tests pass, 0 TSC errors, 0 ESLint errors. The goal is to harden and decompose without changing behavior or UI.

## Constraints

- Zero visual regressions — output stays identical
- No new features
- No dependency upgrades
- Commit each fix atomically
- All gates: `npm test && npm run lint && npx tsc --noEmit`
- Final gate: `npm run build` (stricter than tsc alone per prior learning)

---

## Phase A — Security Hardening

### A1. Webhook Auth Fail-Closed

**File:** `server/routes/recruitment.ts:75-85`
**CSO Finding:** #1, CRITICAL, 9/10 VERIFIED

**Current behavior:** If `DRUPAL_WEBHOOK_SECRET` env var is unset, the `if (WEBHOOK_SECRET)` block is skipped and POST /intake accepts all unauthenticated requests.

**Change:** Invert to fail-closed. If the secret is not configured, reject with 500.

```typescript
// Before
if (WEBHOOK_SECRET) {
  const provided = ...
  if (!provided || provided !== WEBHOOK_SECRET) {
    res.status(401).json({ error: 'Webhook secret invalide' })
    return
  }
}

// After
if (!WEBHOOK_SECRET) {
  res.status(500).json({ error: 'Webhook not configured' })
  return
}
const provided = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '')
if (!provided || provided !== WEBHOOK_SECRET) {
  res.status(401).json({ error: 'Webhook secret invalide' })
  return
}
```

**Commit:** `fix(security): fail-closed webhook auth when secret is unset`

### A2. Path Boundary Validation

**File:** `server/routes/recruitment.ts:620-632` (upload) and `:733-762` (download)
**CSO Finding:** Below-gate (6/10) but defense-in-depth best practice.

**Change:** Create `server/lib/fs-safety.ts` with a `resolveSafePath(baseDir, relativePath)` function. Use it in both upload and download handlers.

```typescript
// server/lib/fs-safety.ts
import path from 'path'

export function resolveSafePath(baseDir: string, ...segments: string[]): string {
  const resolved = path.resolve(baseDir, ...segments)
  const base = path.resolve(baseDir)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('Path traversal attempt blocked')
  }
  return resolved
}
```

Upload handler: Replace `path.join(docDir, safeFilename)` with `resolveSafePath(docDir, safeFilename)`.

Download handler: After fetching `doc.path` from DB, validate it against the expected base directory before streaming.

**Commit:** `fix(security): add path boundary validation on document upload/download`

### A3. Rate Limiting on Mutation Routes

**File:** `server/routes/recruitment.ts`

**Change:** Add rate limiter to unthrottled state-changing endpoints:
- `PATCH /candidatures/:id/status` — 20/min
- `POST /candidatures/:id/notes` — 20/min
- `POST /candidatures/:id/documents` — 10/min
- `POST /candidatures/:id/recalculate` — 5/min

Reuse the existing `rateLimit` import and pattern from `intakeRateLimit`.

**Commit:** `fix(security): rate-limit recruitment mutation endpoints`

### A4. Safe JSON Parsing

**Files:** `server/routes/recruitment.ts:720`, plus any other bare `JSON.parse` on DB data in server/

**Change:** Replace bare `JSON.parse(profile.profile_json)` with `safeJsonParse(profile.profile_json, null)`. The utility is already imported. Scan all server/ files for the same pattern and fix consistently.

**Scope rule:** Fix bare `JSON.parse` calls that parse **database or API data** (untrusted). Leave calls that parse **local config/catalog files** (trusted) alone.

**Must fix (DB/API data):**
- `recruitment.ts:720` — `JSON.parse(profile.profile_json)`
- `server/lib/db.ts:130,465-467,488-490` — JSON fields from evaluations/candidates tables
- `server/lib/candidate-analysis.ts:16` — if parsing DB-stored data

**Leave alone (trusted local files):**
- `server/lib/aggregates.ts:13` — `fs.readFileSync` of local targets file
- `server/lib/seed-catalog.ts:43,84,105` — reading local catalog JSON
- `server/lib/catalog.ts:106` — reading local catalog JSON
- `server/lib/db.ts:422` — reading local JSON file for migration

**Commit:** `fix(security): use safeJsonParse for all database JSON fields`

### A5. Strip Production Console Logs

**Scope:** Server-side only (`server/` directory). No `console.log` exists in `src/`.

**Remove (noise):**
- `server/lib/db.ts` — `[DB] Seeded...` startup message
- `server/lib/cv-extraction.ts` — extraction reasoning/debug logs
- `server/lib/candidate-analysis.ts` — analysis debug logs
- `server/lib/seed-catalog.ts` — seeding debug logs

**Keep (operational):**
- `server/lib/auth.ts` — `[AUTH] Magic link sent to...` (email delivery debugging)
- `server/lib/email.ts` — `Invitation sent to...` (delivery confirmation)
- `server/index.ts` — `Server running on...` and `[AUTH] migrations complete` (startup confirmation)
- `server/lib/summary.ts` — `[SUMMARY]` and `[COMPARISON]` logs (AI generation tracking)
- `server/routes/ratings.ts` — `[SKILL-UP]` level change log (audit trail)
- `server/routes/chat.ts` — `[CHAT] Context` log (useful for cost monitoring)
- `server/lib/db.ts:449` — `Database initialized at...` (startup confirmation)
- All `console.warn` and `console.error` calls

**Commit:** `chore: remove debug console.log from server code`

### A-Check: Verification Gate

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
```

All must pass. No regressions in 90 existing tests.

---

## Phase B — Full Architecture Decomposition

### B1. Centralize Shared Constants

**Problem:** `STATUT_LABELS` and `STATUT_COLORS` are defined in 3 separate files. Date formatting functions are duplicated.

**Change:**
- Create `src/lib/constants.ts` with `STATUT_LABELS`, `STATUT_COLORS`, `formatDateShort()`
- Create `server/lib/constants.ts` with `STATUT_LABELS` (server-side copy for ZIP generation)
- Update imports in:
  - `src/pages/candidate-detail-page.tsx` (remove lines ~105-142)
  - `src/pages/recruit-pipeline-page.tsx` (remove lines ~27-31 formatDate, ~90-101 STATUT_LABELS, ~103-114 STATUT_COLORS)
  - `src/pages/report-comparison-page.tsx:57` — also has STATUT_LABELS (without diacritics, fix during import)
  - `src/pages/report-campaign-page.tsx:43` — also has STATUT_LABELS (without diacritics, fix during import)
  - `server/routes/recruitment.ts` (remove lines ~821-825 statusLabels)

**Commit:** `refactor: centralize status constants and date formatters`

### B2. Decompose candidate-detail-page.tsx (1115 LOC)

**Problem:** 24 useState calls, data fetching, document management, status transitions, Aboro profile parsing all in one component.

**Target:** Main page component drops to ~250 LOC. Logic extracted into hooks and sub-components.

**Extract hooks:**
- `src/hooks/use-candidate-data.ts` — fetches candidate, candidatures, events, documents. Returns data + loading states. (~80 LOC)
- `src/hooks/use-transition-state.ts` — manages status transition dialog state and API call. (~50 LOC)
- `src/hooks/use-document-upload.ts` — manages file selection, upload progress, type selection dialog. (~60 LOC)

**Extract components:**
- `src/components/recruit/candidate-status-bar.tsx` — status badge, transition button, progress indicator. (~80 LOC)
- `src/components/recruit/candidate-documents-panel.tsx` — document list, upload button, download/zip actions. (~120 LOC)
- `src/components/recruit/candidate-notes-section.tsx` — notes textarea with save. (~50 LOC)
- `src/components/recruit/aboro-profile-section.tsx` — Aboro trait display, talent cloud, behavioral matrices. (~100 LOC)

**Remaining in page:** Layout shell, tab structure, radar chart integration, routing. (~250 LOC)

**Commit sequence:**
1. `refactor: extract useCandidateData hook`
2. `refactor: extract CandidateStatusBar component`
3. `refactor: extract CandidateDocumentsPanel component`
4. `refactor: extract CandidateNotesSection component`
5. `refactor: extract AboroProfileSection component`
6. `refactor: extract useTransitionState and useDocumentUpload hooks`

### B3. Decompose recruitment.ts (992 LOC)

**Problem:** Route file mixes business logic, file operations, zip generation, email sending, CV extraction orchestration.

**Extract service modules:**
- `server/lib/document-service.ts` — document upload, download, zip generation logic. (~150 LOC)
- `server/lib/aboro-service.ts` — Aboro PDF extraction, profile storage, soft skill scoring orchestration. (~80 LOC)
- `server/lib/intake-service.ts` — webhook intake processing, candidate/candidature creation. (~100 LOC)

**Remaining in route:** Thin route handlers that call service functions, request validation, response formatting. (~400 LOC)

**Commit sequence:**
1. `refactor: extract document-service from recruitment routes`
2. `refactor: extract aboro-service from recruitment routes`
3. `refactor: extract intake-service from recruitment routes`

### B4. Standardize Error Handling

**Problem:** `.catch(() => {})` silently swallows errors in `candidate-detail-page.tsx:203,226`. Inconsistent error handling across pages.

**Change:**
- Replace all `.catch(() => {})` with proper error reporting (toast via sonner, which is already a dependency)
- Add granular ErrorBoundary components for:
  - Dashboard tab panels (chart crash doesn't kill the whole page)
  - Form wizard steps
  - Candidate detail sections (documents panel, Aboro section)

Create `src/components/ui/section-error-boundary.tsx` — a lightweight ErrorBoundary that shows an inline error message instead of crashing the parent.

**Commit sequence:**
1. `fix: replace silent error catches with toast notifications`
2. `feat: add SectionErrorBoundary for granular error recovery`

### B5. Fix Type Safety

**Problem:** `AuthUser` interface is defined separately in 5+ files (`require-auth.ts`, `require-lead.ts`, `recruitment.ts`, `candidates.ts`, `roles.ts`, `chat.ts`). 3 instances of `as unknown as Record<string, unknown>` double-casting in server routes (`require-auth.ts:22`, `recruitment.ts:278`, `candidates.ts:231`).

**Change:**
- Define proper `AuthUser` interface in `server/lib/types.ts` (one source of truth)
- Export a typed `getUser(req)` helper from the same file
- Replace `as unknown as` chains with proper typed DB query results in all 3 locations
- Remove duplicate `AuthUser` definitions from individual route/middleware files

Note: `useMemo` was verified to already be in place for `progressionData` and `categoryDeltas`. No changes needed there.

**Commit sequence:**
1. `refactor: unify AuthUser type definition into server/lib/types.ts`
2. `refactor: replace unsafe type casts in server routes`

### B-Check: Verification Gate

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
```

---

## Phase C — Final Validation

### C1. Full Verification

Run complete test + lint + type check + build:
```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
```

### C2. Codex Challenge

Adversarial review of the refactored code. Run `codex review` on the full diff from the branch point to catch anything we missed.

### C3. /plan-eng-review

Architecture and execution validation. Review the decomposed structure, verify service boundaries are clean, data flow is traceable.

### C4. Push to dev.radar.sinapse.nc

Push branch, CI deploys automatically via deploy-dev.yml.

---

## Files Created (New)

| File | Purpose |
|------|---------|
| `server/lib/fs-safety.ts` | Path boundary validation utility |
| `src/lib/constants.ts` | Shared status labels, colors, date formatters |
| `server/lib/constants.ts` | Server-side status labels |
| `src/hooks/use-candidate-data.ts` | Candidate data fetching hook |
| `src/hooks/use-transition-state.ts` | Status transition state hook |
| `src/hooks/use-document-upload.ts` | Document upload state hook |
| `src/components/recruit/candidate-status-bar.tsx` | Status display + transition UI |
| `src/components/recruit/candidate-documents-panel.tsx` | Document list + upload UI |
| `src/components/recruit/candidate-notes-section.tsx` | Notes editing UI |
| `src/components/recruit/aboro-profile-section.tsx` | Aboro behavioral profile UI |
| `server/lib/document-service.ts` | Document operations service |
| `server/lib/aboro-service.ts` | Aboro extraction service |
| `server/lib/intake-service.ts` | Webhook intake service |
| `src/components/ui/section-error-boundary.tsx` | Granular error boundary |

## Files Modified (Major Changes)

| File | Change |
|------|--------|
| `server/routes/recruitment.ts` | 992 LOC -> ~400 LOC (services extracted) |
| `src/pages/candidate-detail-page.tsx` | 1115 LOC -> ~250 LOC (hooks + components extracted) |
| `src/pages/recruit-pipeline-page.tsx` | Remove duplicated constants + date formatters |

## Phase A Test Additions

Security fixes need test coverage. Add these tests:

**A1 — Webhook auth tests** (`server/__tests__/webhook-auth.test.ts`):
- Request fails with 500 when `DRUPAL_WEBHOOK_SECRET` is unset
- Request fails with 401 when wrong secret is provided
- Request succeeds with correct secret + valid payload

**A2 — Path traversal tests** (`server/__tests__/fs-safety.test.ts`):
- `resolveSafePath` allows normal filenames
- `resolveSafePath` blocks `../` traversal attempts
- `resolveSafePath` blocks absolute path injection

## Known Limitations

- **A2 stored paths:** Document paths are stored as absolute paths in the DB at upload time. If `DATA_DIR` changes between upload and download, the download boundary check validates against the new `DATA_DIR`, not the original. Acceptable for now since `DATA_DIR` doesn't change in production.

## What We're NOT Touching

- No UI/UX changes
- No new features
- No dependency upgrades
- No CI/CD changes (per user decision)
- No changes to public API response shapes

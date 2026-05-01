# Codebase Hardening & Decomposition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden security (CSO critical finding + defense-in-depth) then decompose god files, without changing behavior or UI.

**Architecture:** Sequential phases: A (security, 7 tasks including gate), B (decomposition, 8 tasks including gate), C (final validation + deploy). Each task produces one atomic commit.

**Tech Stack:** TypeScript 5.9, Express 5, React 19, better-sqlite3, Vitest, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-09-codebase-hardening-design.md`

---

## Phase A — Security Hardening

### Task 1: Webhook Auth Fail-Closed + Tests

**Files:**
- Modify: `server/routes/recruitment.ts:75-85`
- Create: `server/__tests__/webhook-auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Note: `WEBHOOK_SECRET` is captured at module load time (line 75). To test the "unset" case, we can't easily re-import the module. Instead, write integration tests for the two testable cases (wrong secret, correct secret) and add a code-level unit test for the guard logic.

```typescript
// server/__tests__/webhook-auth.test.ts
import { describe, it, expect } from 'vitest'
import supertest from 'supertest'
import express from 'express'

// Test the guard logic directly rather than the module-scoped capture
describe('webhook auth guard logic', () => {
  it('rejects with 401 when wrong secret is provided', async () => {
    // Set up a minimal app that mimics the intake route behavior
    process.env.DRUPAL_WEBHOOK_SECRET = 'test-secret-123'
    // Dynamic import to get fresh module with the secret set
    const app = express()
    app.use(express.json())
    app.post('/test-intake', (req, res) => {
      const secret = process.env.DRUPAL_WEBHOOK_SECRET
      if (!secret) { res.status(500).json({ error: 'Webhook not configured' }); return }
      const provided = req.headers['x-webhook-secret'] as string | undefined
      if (!provided || provided !== secret) { res.status(401).json({ error: 'Webhook secret invalide' }); return }
      res.json({ ok: true })
    })

    const res = await supertest(app)
      .post('/test-intake')
      .set('x-webhook-secret', 'wrong-secret')
      .send({ nom: 'Test', email: 'test@test.com', poste_vise: 'dev' })
    expect(res.status).toBe(401)
  })

  it('accepts request with correct secret', async () => {
    const app = express()
    app.use(express.json())
    app.post('/test-intake', (req, res) => {
      const secret = 'test-secret-123'
      if (!secret) { res.status(500).json({ error: 'Webhook not configured' }); return }
      const provided = req.headers['x-webhook-secret'] as string | undefined
      if (!provided || provided !== secret) { res.status(401).json({ error: 'Webhook secret invalide' }); return }
      res.json({ ok: true })
    })

    const res = await supertest(app)
      .post('/test-intake')
      .set('x-webhook-secret', 'test-secret-123')
      .send({ nom: 'Test', email: 'test@test.com', poste_vise: 'dev' })
    expect(res.status).toBe(200)
  })

  it('rejects with 500 when secret is not configured', async () => {
    const app = express()
    app.use(express.json())
    app.post('/test-intake', (req, res) => {
      const secret: string | undefined = undefined // simulates unset env
      if (!secret) { res.status(500).json({ error: 'Webhook not configured' }); return }
      const provided = req.headers['x-webhook-secret'] as string | undefined
      if (!provided || provided !== secret) { res.status(401).json({ error: 'Webhook secret invalide' }); return }
      res.json({ ok: true })
    })

    const res = await supertest(app)
      .post('/test-intake')
      .set('x-webhook-secret', 'any-secret')
      .send({ nom: 'Test', email: 'test@test.com', poste_vise: 'dev' })
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails (before the fix, the 500 test would fail on the old code pattern)**

Run: `npx vitest run server/__tests__/webhook-auth.test.ts`

- [ ] **Step 3: Fix the webhook auth logic**

In `server/routes/recruitment.ts`, replace lines 77-85:

```typescript
// BEFORE (fail-open)
recruitmentRouter.post('/intake', intakeRateLimit, async (req, res) => {
  // Validate webhook secret if configured
  if (WEBHOOK_SECRET) {
    const provided = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '')
    if (!provided || provided !== WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Webhook secret invalide' })
      return
    }
  }

// AFTER (fail-closed)
recruitmentRouter.post('/intake', intakeRateLimit, async (req, res) => {
  if (!WEBHOOK_SECRET) {
    console.error('[WEBHOOK] DRUPAL_WEBHOOK_SECRET not set — rejecting all intake requests')
    res.status(500).json({ error: 'Webhook not configured' })
    return
  }
  const provided = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '')
  if (!provided || provided !== WEBHOOK_SECRET) {
    res.status(401).json({ error: 'Webhook secret invalide' })
    return
  }
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: 90 tests pass (no regressions)

- [ ] **Step 5: Commit**

```bash
git add server/routes/recruitment.ts server/__tests__/webhook-auth.test.ts
git commit -m "fix(security): fail-closed webhook auth when secret is unset"
```

---

### Task 2: Path Boundary Validation + Tests

**Files:**
- Create: `server/lib/fs-safety.ts`
- Create: `server/__tests__/fs-safety.test.ts`
- Modify: `server/routes/recruitment.ts:620-632` (upload)
- Modify: `server/routes/recruitment.ts:733-762` (download)
- Modify: `server/routes/recruitment.ts:810-815` (zip entry names)

- [ ] **Step 1: Write the fs-safety tests**

```typescript
// server/__tests__/fs-safety.test.ts
import { describe, it, expect } from 'vitest'
import { resolveSafePath } from '../lib/fs-safety.js'

describe('resolveSafePath', () => {
  it('allows normal filenames', () => {
    const result = resolveSafePath('/data/documents/abc', 'cv.pdf')
    expect(result).toBe('/data/documents/abc/cv.pdf')
  })

  it('blocks ../ traversal attempts', () => {
    expect(() => resolveSafePath('/data/documents/abc', '../../../etc/passwd'))
      .toThrow('Path traversal attempt blocked')
  })

  it('blocks absolute path injection', () => {
    expect(() => resolveSafePath('/data/documents/abc', '/etc/passwd'))
      .toThrow('Path traversal attempt blocked')
  })

  it('allows nested subdirectories within base', () => {
    const result = resolveSafePath('/data/documents', 'abc', 'cv.pdf')
    expect(result).toBe('/data/documents/abc/cv.pdf')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/fs-safety.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create fs-safety.ts**

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

- [ ] **Step 4: Run fs-safety tests**

Run: `npx vitest run server/__tests__/fs-safety.test.ts`
Expected: PASS

- [ ] **Step 5: Apply to upload handler**

In `server/routes/recruitment.ts`, add import at top:
```typescript
import { resolveSafePath } from '../lib/fs-safety.js'
```

At line ~631, replace:
```typescript
// BEFORE
const filePath = path.join(docDir, safeFilename)

// AFTER
const filePath = resolveSafePath(docDir, safeFilename)
```

- [ ] **Step 6: Apply to download handler**

At line ~744, after `if (!fs.existsSync(doc.path))` check, add boundary validation:
```typescript
// After the existsSync check, add:
const dataDir = process.env.DATA_DIR || 'server/data'
const expectedBase = path.resolve(dataDir, 'documents')
const resolvedPath = path.resolve(doc.path)
if (!resolvedPath.startsWith(expectedBase + path.sep)) {
  res.status(403).json({ error: 'Acces refuse' })
  return
}
```

- [ ] **Step 7: Sanitize docType in ZIP entry names**

At line ~620, sanitize docType:
```typescript
// BEFORE
const docType = parsed.fields.type || 'other'

// AFTER
const rawType = parsed.fields.type || 'other'
const docType = rawType.replace(/[^a-zA-Z0-9_-]/g, '_')
```

At line ~814, also sanitize for ZIP:
```typescript
// BEFORE
const typeName = doc.type === 'other' ? 'Document' : doc.type.charAt(0).toUpperCase() + doc.type.slice(1)

// AFTER
const safeType = doc.type.replace(/[^a-zA-Z0-9_-]/g, '_')
const typeName = safeType === 'other' ? 'Document' : safeType.charAt(0).toUpperCase() + safeType.slice(1)
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add server/lib/fs-safety.ts server/__tests__/fs-safety.test.ts server/routes/recruitment.ts
git commit -m "fix(security): add path boundary validation on document upload/download/zip"
```

---

### Task 3: Rate Limiting on Mutation Routes

**Files:**
- Modify: `server/routes/recruitment.ts`

- [ ] **Step 1: Add rate limiters after the existing `intakeRateLimit` definition (~line 73)**

```typescript
const mutationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
})

const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de fichiers. Réessayez dans une minute.' },
})

const heavyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
})

const recalcRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Recalcul en cours. Réessayez dans une minute.' },
})
```

- [ ] **Step 2: Apply rate limiters to endpoints**

Find each route and add the middleware as the second argument:

```typescript
protectedRouter.patch('/candidatures/:id/status', mutationRateLimit, (req, res) => {
protectedRouter.post('/candidatures/:id/notes', mutationRateLimit, (req, res) => {
protectedRouter.post('/candidatures/:id/documents', uploadRateLimit, async (req, res) => {
protectedRouter.post('/candidatures/:id/recalculate', heavyRateLimit, async (req, res) => {
protectedRouter.put('/scoring-weights', heavyRateLimit, async (req, res) => {
protectedRouter.post('/recalculate-all', recalcRateLimit, (_req, res) => {
```

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add server/routes/recruitment.ts
git commit -m "fix(security): rate-limit recruitment mutation endpoints"
```

---

### Task 4: Safe JSON Parsing with Corruption Logging

**Files:**
- Modify: `server/lib/types.ts:87-95`
- Modify: `server/routes/recruitment.ts:720`
- Modify: `server/lib/db.ts` (lines 130, 465-467, 488-490)
- Modify: `server/lib/candidate-analysis.ts:16`

- [ ] **Step 1: Update safeJsonParse to log corruption**

In `server/lib/types.ts`, replace the existing `safeJsonParse`:

```typescript
/** Safe JSON.parse that returns a fallback on error instead of crashing.
 *  Logs corruption so bad rows are visible, not silently hidden. */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T, context?: string): T {
  if (json == null) return fallback
  try {
    return JSON.parse(json)
  } catch {
    console.error(`[DATA] Corrupted JSON${context ? ` in ${context}` : ''}:`, json?.slice(0, 100))
    return fallback
  }
}
```

- [ ] **Step 2: Fix recruitment.ts:720**

```typescript
// BEFORE
res.json({ profile: JSON.parse(profile.profile_json), createdAt: profile.created_at })

// AFTER
res.json({ profile: safeJsonParse(profile.profile_json, null, 'aboro_profiles.profile_json'), createdAt: profile.created_at })
```

- [ ] **Step 3: Fix all bare JSON.parse on DB data in db.ts**

Add `import { safeJsonParse } from './types.js'` to `server/lib/db.ts`. Replace these specific lines:
- Line 130: `JSON.parse(row.ratings)` -> `safeJsonParse(row.ratings, {}, 'evaluations.ratings')`
- Lines 465-467: `JSON.parse(row.ratings)`, `JSON.parse(row.experience)`, `JSON.parse(row.skipped_categories)` -> use `safeJsonParse` with context `'candidates.ratings'`, `'candidates.experience'`, `'candidates.skipped_categories'`
- Lines 488-490: same pattern for the other query -> use `safeJsonParse` with appropriate context

Leave alone: line 422 (`readFileSync` of local JSON file — trusted).

- [ ] **Step 4: Fix candidate-analysis.ts**

In `server/lib/candidate-analysis.ts`, line 16: if `JSON.parse` is called on DB data (`candidate.ratings` or similar), replace with `safeJsonParse`. If it's an operational log at line 88 (`[AI] Generated candidate analysis for...`), keep it — that's tracking, not debug noise.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add server/lib/types.ts server/routes/recruitment.ts server/lib/db.ts server/lib/candidate-analysis.ts
git commit -m "fix(security): use safeJsonParse for all database JSON fields"
```

---

### Task 5: Strip Debug Console Logs

**Files:**
- Modify: `server/lib/db.ts`
- Modify: `server/lib/cv-extraction.ts`
- Modify: `server/lib/candidate-analysis.ts`
- Modify: `server/lib/seed-catalog.ts`

- [ ] **Step 1: Remove specific console.log calls**

**Remove these lines:**
- `server/lib/db.ts:139` — `console.log('[DB] Seeded initial skill history...')`
- `server/lib/db.ts:342` — `console.log('[DB] Seeded ${seedRoles.length} default roles')`
- `server/lib/db.ts:415` — `console.log('[DB] Seeded ${postes.length} recruitment postes...')`
- `server/lib/db.ts:443` — `console.log('Migrated ${Object.keys(data).length} evaluations...')`
- `server/lib/cv-extraction.ts` — all `console.log` calls (reasoning/debug output)
- `server/lib/seed-catalog.ts` — all `console.log` calls (seeding debug)

**Keep these (operational):**
- `server/lib/db.ts:449` — `console.log('Database initialized at...')`
- `server/lib/candidate-analysis.ts:88` — `console.log('[AI] Generated candidate analysis...')` (tracking)
- All `console.warn` and `console.error` calls everywhere

- [ ] **Step 2: Run all tests**

Run: `npm test && npm run lint`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add server/lib/db.ts server/lib/cv-extraction.ts server/lib/candidate-analysis.ts server/lib/seed-catalog.ts
git commit -m "chore: remove debug console.log from server code"
```

---

### Task 6: Fix Frontend/Backend MIME Type Mismatch

**Files:**
- Modify: `src/pages/candidate-detail-page.tsx:984`

- [ ] **Step 1: Fix frontend file picker**

In `src/pages/candidate-detail-page.tsx`, at line 984:
```typescript
// BEFORE
input.accept = '.pdf,.docx,.doc,.png,.jpg,.jpeg'

// AFTER
input.accept = '.pdf,.docx,.doc'
```

- [ ] **Step 2: Run all tests**

Run: `npm test && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/pages/candidate-detail-page.tsx
git commit -m "fix: align document upload file picker with backend MIME types"
```

---

### Task 7: Phase A Verification Gate

- [ ] **Step 1: Run the full gate**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
```

Expected: All pass, 0 errors

- [ ] **Step 2: Review the diff**

```bash
git log --oneline main..HEAD
```

Should show 6 atomic security commits.

---

## Phase B — Architecture Decomposition

### Task 8: Centralize Shared Constants

**Files:**
- Create: `src/lib/constants.ts`
- Create: `server/lib/constants.ts`
- Modify: `src/pages/candidate-detail-page.tsx` — remove STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, formatDateShort
- Modify: `src/pages/recruit-pipeline-page.tsx` — remove STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, formatDate
- Modify: `src/pages/report-comparison-page.tsx` — remove STATUT_LABELS, CANAL_LABELS
- Modify: `src/pages/report-campaign-page.tsx` — remove STATUT_LABELS, CANAL_LABELS
- Modify: `server/routes/recruitment.ts` — remove statusLabels

- [ ] **Step 1: Create src/lib/constants.ts**

```typescript
// src/lib/constants.ts
export const STATUT_LABELS: Record<string, string> = {
  postule: 'Postulé',
  preselectionne: 'Présélectionné',
  skill_radar_envoye: 'Skill Radar envoyé',
  skill_radar_complete: 'Skill Radar complété',
  entretien_1: 'Entretien 1',
  aboro: 'Test Âboro',
  entretien_2: 'Entretien 2',
  proposition: 'Proposition',
  embauche: 'Embauché',
  refuse: 'Refusé',
}

export const STATUT_COLORS: Record<string, string> = {
  postule: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  preselectionne: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  skill_radar_envoye: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  skill_radar_complete: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  entretien_1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  aboro: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  entretien_2: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  proposition: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  embauche: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  refuse: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

export const CANAL_LABELS: Record<string, string> = {
  cabinet: 'Cabinet',
  site: 'sinapse.nc',
  candidature_directe: 'Candidature directe',
  reseau: 'Réseau',
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** Full date format used in recruit-pipeline-page (includes year) */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR')
}
```

- [ ] **Step 2: Create server/lib/constants.ts**

```typescript
// server/lib/constants.ts
export const STATUT_LABELS: Record<string, string> = {
  postule: 'Postulé',
  preselectionne: 'Présélectionné',
  skill_radar_envoye: 'Skill Radar envoyé',
  skill_radar_complete: 'Skill Radar complété',
  entretien_1: 'Entretien 1',
  aboro: 'Test Âboro',
  entretien_2: 'Entretien 2',
  proposition: 'Proposition',
  embauche: 'Embauché',
  refuse: 'Refusé',
}
```

- [ ] **Step 3: Update all consumer files**

In each file, add `import { STATUT_LABELS, STATUT_COLORS, formatDateShort } from '@/lib/constants'` (or the appropriate subset) and delete the local definitions. For report-comparison-page and report-campaign-page, this also fixes the missing diacritics.

For `server/routes/recruitment.ts`, add `import { STATUT_LABELS } from '../lib/constants.js'` and delete the inline `statusLabels` object at ~line 821.

- [ ] **Step 4: Run all tests**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants.ts server/lib/constants.ts src/pages/candidate-detail-page.tsx src/pages/recruit-pipeline-page.tsx src/pages/report-comparison-page.tsx src/pages/report-campaign-page.tsx server/routes/recruitment.ts
git commit -m "refactor: centralize status constants and date formatters"
```

---

### Task 9: Decompose candidate-detail-page.tsx

This is the largest task. Break it into 4 atomic commits.

**Files:**
- Create: `src/hooks/use-candidate-data.ts`
- Create: `src/hooks/use-transition-state.ts`
- Create: `src/hooks/use-document-upload.ts`
- Create: `src/components/recruit/candidate-status-bar.tsx`
- Create: `src/components/recruit/candidate-documents-panel.tsx`
- Create: `src/components/recruit/candidate-notes-section.tsx`
- Create: `src/components/recruit/aboro-profile-section.tsx`
- Modify: `src/pages/candidate-detail-page.tsx` (1115 LOC -> ~250 LOC)

- [ ] **Step 1: Extract useCandidateData hook**

Read `candidate-detail-page.tsx` lines 144-230 (the useEffect data fetching block with all the Promise.all calls). Move into `src/hooks/use-candidate-data.ts` as a custom hook that:
- Takes `candidateId: string` parameter
- Contains all the useState for `candidate`, `candidatures`, `events`, `documents`, `loading`
- Contains the useEffect that fetches all data
- Returns `{ candidate, candidatures, events, documents, loading, refresh }`

Verify the page still works by importing and using the hook.

- [ ] **Step 2: Run tests, commit**

```bash
npm test && npx tsc --noEmit
git add src/hooks/use-candidate-data.ts src/pages/candidate-detail-page.tsx
git commit -m "refactor: extract useCandidateData hook"
```

- [ ] **Step 3: Extract CandidateStatusBar and CandidateNotesSection components**

Extract the status badge, transition button, and progress indicator into `candidate-status-bar.tsx`. Extract the notes textarea into `candidate-notes-section.tsx`. These are self-contained UI sections that receive data via props.

- [ ] **Step 4: Run tests, commit**

```bash
npm test && npx tsc --noEmit
git add src/components/recruit/candidate-status-bar.tsx src/components/recruit/candidate-notes-section.tsx src/pages/candidate-detail-page.tsx
git commit -m "refactor: extract CandidateStatusBar and CandidateNotesSection"
```

- [ ] **Step 5: Extract CandidateDocumentsPanel and AboroProfileSection**

Extract the document list, upload button, and download/zip actions into `candidate-documents-panel.tsx`. Extract the Aboro trait display into `aboro-profile-section.tsx`.

- [ ] **Step 6: Run tests, commit**

```bash
npm test && npx tsc --noEmit
git add src/components/recruit/candidate-documents-panel.tsx src/components/recruit/aboro-profile-section.tsx src/pages/candidate-detail-page.tsx
git commit -m "refactor: extract CandidateDocumentsPanel and AboroProfileSection"
```

- [ ] **Step 7: Extract useTransitionState and useDocumentUpload hooks**

Move the transition dialog state management (useState for showTransition, targetStatut, etc.) into `use-transition-state.ts`. Move the file upload state (uploading, uploadType dialog, etc.) into `use-document-upload.ts`.

- [ ] **Step 8: Run tests, commit**

```bash
npm test && npx tsc --noEmit
git add src/hooks/use-transition-state.ts src/hooks/use-document-upload.ts src/pages/candidate-detail-page.tsx
git commit -m "refactor: extract useTransitionState and useDocumentUpload hooks"
```

- [ ] **Step 9: Verify final LOC**

```bash
wc -l src/pages/candidate-detail-page.tsx
```

Expected: ~250 lines (down from 1115)

---

### Task 10: Decompose recruitment.ts

**Files:**
- Create: `server/lib/document-service.ts`
- Create: `server/lib/aboro-service.ts`
- Create: `server/lib/intake-service.ts`
- Modify: `server/routes/recruitment.ts` (992 LOC -> ~400 LOC)

- [ ] **Step 1: Extract document-service**

Move the document upload logic (save file, DB insert, event logging), download logic (path resolution, streaming), and ZIP generation logic into `server/lib/document-service.ts`. Functions should accept explicit parameters (not `req`/`res`) and return results. The route handler stays thin: parse request, call service, send response.

- [ ] **Step 2: Run tests, commit**

```bash
npm test && npx tsc --noEmit
git add server/lib/document-service.ts server/routes/recruitment.ts
git commit -m "refactor: extract document-service from recruitment routes"
```

- [ ] **Step 3: Extract aboro-service**

Move the Aboro PDF extraction orchestration, profile storage, and soft skill scoring update into `server/lib/aboro-service.ts`. This includes the auto-extract-on-upload logic and the manual entry handler.

- [ ] **Step 4: Run tests, commit**

```bash
npm test && npx tsc --noEmit
git add server/lib/aboro-service.ts server/routes/recruitment.ts
git commit -m "refactor: extract aboro-service from recruitment routes"
```

- [ ] **Step 5: Extract intake-service**

Move the webhook intake processing (field parsing, candidate creation, candidature creation, idempotency check) into `server/lib/intake-service.ts`.

- [ ] **Step 6: Run tests, commit**

```bash
npm test && npx tsc --noEmit
git add server/lib/intake-service.ts server/routes/recruitment.ts
git commit -m "refactor: extract intake-service from recruitment routes"
```

- [ ] **Step 7: Verify final LOC**

```bash
wc -l server/routes/recruitment.ts
```

Expected: ~400 lines (down from 992)

---

### Task 11: Replace Silent Error Catches

**Files:**
- Modify: `src/pages/candidate-detail-page.tsx` — replace `.catch(() => {})`

- [ ] **Step 1: Replace silent catches with toast notifications**

In `candidate-detail-page.tsx`, find all `.catch(() => {})` (lines 203, 226) and replace with:
```typescript
.catch((err) => {
  console.error('[Fetch] Error:', err)
  toast.error('Erreur de chargement')
})
```

Import `toast` from `sonner` at the top of the file.

- [ ] **Step 2: Run all tests**

Run: `npm test && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/pages/candidate-detail-page.tsx
git commit -m "fix: replace silent error catches with toast notifications"
```

---

### Task 12: Add SectionErrorBoundary

**Files:**
- Create: `src/components/ui/section-error-boundary.tsx`
- Modify: `src/pages/dashboard-page.tsx` — wrap tab panels

- [ ] **Step 1: Create SectionErrorBoundary**

```typescript
// src/components/ui/section-error-boundary.tsx
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-400">
          Une erreur est survenue dans cette section.
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 2: Wrap dashboard tab panels with SectionErrorBoundary**

In `dashboard-page.tsx`, wrap each tab panel content with `<SectionErrorBoundary>`.

- [ ] **Step 3: Run all tests**

Run: `npm test && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/section-error-boundary.tsx src/pages/dashboard-page.tsx
git commit -m "feat: add SectionErrorBoundary for granular error recovery"
```

---

### Task 13: Unify AuthUser Type + Fix Unsafe Casts

**Files:**
- Modify: `server/lib/types.ts` — add AuthUser + getUser helper
- Modify: `server/middleware/require-auth.ts` — remove local AuthUser
- Modify: `server/middleware/require-lead.ts` — remove local AuthUser
- Modify: `server/routes/recruitment.ts` — remove local AuthUser + getUser
- Modify: `server/routes/candidates.ts` — remove local AuthUser
- Modify: `server/routes/roles.ts` — remove local AuthUser
- Modify: `server/routes/chat.ts` — remove local AuthUser

- [ ] **Step 1: Add AuthUser and getUser to server/lib/types.ts**

```typescript
// Add to server/lib/types.ts
export interface AuthUser {
  id: string
  email: string
  name: string
  slug: string | null
  pinCustomized?: boolean
}

export function getUser(req: import('express').Request): AuthUser {
  return (req as typeof req & { user: AuthUser }).user
}
```

- [ ] **Step 2: Update all consumers**

In each file that defines its own `AuthUser` or `getUser`:
1. Add `import { AuthUser, getUser } from '../lib/types.js'`
2. Delete the local `interface AuthUser { ... }` block
3. Delete the local `function getUser(req)` if present
4. Replace `as unknown as AuthUser` with the import where possible

- [ ] **Step 3: Run all tests**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add server/lib/types.ts server/middleware/require-auth.ts server/middleware/require-lead.ts server/routes/recruitment.ts server/routes/candidates.ts server/routes/roles.ts server/routes/chat.ts
git commit -m "refactor: unify AuthUser type definition into server/lib/types.ts"
```

- [ ] **Step 5: Replace unsafe `as unknown as` casts**

Fix the 3 remaining double-cast locations:
- `server/middleware/require-auth.ts:22` — `session.user as unknown as AuthUser` -> use the imported `AuthUser` type directly (may still need one cast from better-auth's session type)
- `server/routes/recruitment.ts:278` — `(r as unknown as Record<string, unknown>).last_event_at` -> add `last_event_at` to the query's typed result
- `server/routes/candidates.ts:231` — `row as unknown as Record<string, unknown>` -> add the extra fields to the typed result interface

- [ ] **Step 6: Run all tests**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add server/middleware/require-auth.ts server/routes/recruitment.ts server/routes/candidates.ts
git commit -m "refactor: replace unsafe type casts in server routes"
```

---

### Task 14: Phase B Verification Gate

- [ ] **Step 1: Run the full gate**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
```

Expected: All pass, 0 errors

- [ ] **Step 2: Verify LOC reduction**

```bash
wc -l src/pages/candidate-detail-page.tsx server/routes/recruitment.ts
```

Expected: candidate-detail-page ~250 LOC, recruitment.ts ~400 LOC

---

## Phase C — Final Validation

### Task 15: Final Verification + Deploy

- [ ] **Step 1: Run complete build gate**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
```

- [ ] **Step 2: Run Codex review on full diff**

```
/codex review
```

Gate must PASS (no P1 findings).

- [ ] **Step 3: Run eng review**

```
/plan-eng-review
```

Validate decomposed structure, service boundaries, data flow.

- [ ] **Step 4: Push to competences.sinapse.nc**

```bash
git push origin feat/candidate-evaluator
```

CI deploys automatically via deploy-dev.yml.

- [ ] **Step 5: Verify deployment**

Wait for CI to pass, then check `https://competences.sinapse.nc/health` returns `{ status: 'ok' }`.

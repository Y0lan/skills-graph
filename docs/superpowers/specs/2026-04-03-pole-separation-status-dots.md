# Pole-Based Skill Evaluation + Landing Page Status Dots

## Context

Two problems:

1. **All 13 team members fill 18 categories / 136 skills.** A Business Analyst shouldn't have to wade through Java/Platform/Architecture categories. A dev doesn't need Analyse Fonctionnelle or Conduite du Changement. The form needs to scope by pole, showing ONLY pole categories as wizard steps, with opt-in for extras.

2. **Status dots in the login dialog are broken.** The `useTeamStatus` hook fetches `/api/ratings` when the dialog opens, but the global auth gate blocks unauthenticated requests. The dots show nothing.

## Design Decisions

- **Approach C chosen:** Each member has a pole stored in their profile. The form shows ONLY pole categories as wizard steps. Non-pole categories available via an expandable "Compétences optionnelles" section after the last step.
- **Existing categories only (option B):** No new Adélia/Legacy categories for now. Legacy devs use domain-knowledge, backend, core-engineering, soft-skills. Adélia-specific categories can be added later.
- **Login dialog unchanged:** Keep the current `LoginDialog` component as-is. Fix status dots via a dedicated status-only endpoint (not by exposing the full ratings endpoint).

## Review Decisions (from /plan-eng-review + Codex outside voice)

1. **New `/api/ratings/status` endpoint** instead of whitelisting full `/api/ratings`. The full endpoint exposes all skill scores, experience, profileSummary. The status endpoint returns only `{ slug: 'submitted' | 'draft' | 'none' }`.
2. **Wizard shows ONLY pole categories as steps.** Non-pole categories are NOT wizard steps. They appear in an expandable "Compétences optionnelles" section after the last pole step. This actually solves "BA shouldn't wade through Java categories."
3. **Preserve pole on eval reset.** `deleteEvaluation()` clears ratings/experience/submitted_at but keeps the `pole` column intact.
4. **Pole in BOTH roster files.** `server/data/team-roster.ts` AND `src/data/team-roster.ts` both need the `pole` field (dual roster pattern already exists).
5. **Pole mapping lives server-side only.** API returns `poleCategories: string[]` in `GET /api/ratings/:slug`. No client-side duplication.
6. **Update existing auth-gate test.** `auth-gate.test.ts:48` expects GET /api/ratings → 401. This must change to test `/api/ratings/status` instead.
7. **Clear skippedCategories for pole categories on pole change.** When a member changes pole, any `skippedCategories` entries that are now pole categories get removed (can't have a required category in skipped state).

## Pole-to-Category Mapping

### Java / Modernisation (10 categories, ~78 skills)
- `core-engineering` — Socle Technique
- `backend-integration` — Backend & Services d'Intégration
- `frontend-ui` — Frontend & Ingénierie UI
- `platform-engineering` — Ingénierie Plateforme
- `observability-reliability` — Observabilité & Fiabilité
- `security-compliance` — Sécurité & Conformité
- `architecture-governance` — Architecture & Gouvernance
- `ai-engineering` — IA & Ingénierie Assistée par IA
- `qa-test-engineering` — QA & Ingénierie des Tests
- `soft-skills-delivery` — Soft Skills, Collaboration & Delivery

### Fonctionnel (7 categories, ~51 skills)
- `analyse-fonctionnelle` — Analyse Fonctionnelle & Ingénierie des Exigences
- `domain-knowledge` — Connaissances Métier (CAFAT / SINAPSE)
- `design-ux` — Design & UX — Services Numériques
- `project-management-pmo` — Gestion de Projet & PMO
- `change-management-training` — Conduite du Changement & Formation Utilisateur
- `management-leadership` — Management & Leadership
- `soft-skills-delivery` — Soft Skills, Collaboration & Delivery

### Legacy / Adélia / IBMi (4 categories, ~33 skills)
- `domain-knowledge` — Connaissances Métier (CAFAT / SINAPSE)
- `backend-integration` — Backend & Services d'Intégration
- `core-engineering` — Socle Technique
- `soft-skills-delivery` — Soft Skills, Collaboration & Delivery

### Currently unassigned (available as optional for any pole)
- `data-engineering-governance` — Data Engineering & Gouvernance
- `infrastructure-systems-network` — Infrastructure Système, Réseau & Stockage

## Feature 1: Fix Status Dots in Login Dialog

### Problem
`server/index.ts:119-125` — global auth gate blocks all `/api/*` for unauthenticated users. `GET /api/ratings` returns full evaluation data (scores, summaries) — too much to expose publicly.

### Fix
Create a new lightweight public endpoint:

```typescript
// In server/routes/ratings.ts
ratingsRouter.get('/status', (_req, res) => {
  const rows = db.prepare('SELECT slug, ratings, submitted_at FROM evaluations').all()
  const result: Record<string, string> = {}
  for (const row of rows) {
    if (row.submitted_at) result[row.slug] = 'submitted'
    else if (Object.keys(JSON.parse(row.ratings)).length > 0) result[row.slug] = 'draft'
    else result[row.slug] = 'none'
  }
  res.json(result)
})
```

Add to auth gate bypass:
```typescript
if (req.path === '/ratings/status' || req.path === '/ratings/status/') return next()
```

Update `useTeamStatus` hook to fetch `/api/ratings/status` instead of `/api/ratings`.

### Files
- Modify: `server/index.ts` — add `/ratings/status` bypass
- Modify: `server/routes/ratings.ts` — add `GET /status` endpoint
- Modify: `src/hooks/use-team-status.ts` — point at new URL, simplify parsing
- Modify: `server/__tests__/auth-gate.test.ts` — update test expectations

## Feature 2: Pole-Based Evaluation Form

### Data Model

**Pole column on evaluations (preserved on reset):**

```sql
ALTER TABLE evaluations ADD COLUMN pole TEXT
  CHECK(pole IS NULL OR pole IN ('java_modernisation', 'fonctionnel', 'legacy'))
```

**`deleteEvaluation()` must preserve pole:** Change from DELETE to UPDATE that clears ratings/experience/submitted_at but keeps pole:

```typescript
export function deleteEvaluation(slug: string) {
  db.prepare(`
    UPDATE evaluations
    SET ratings = '{}', experience = '{}', skipped_categories = '[]',
        submitted_at = NULL, profile_summary = NULL
    WHERE slug = ?
  `).run(slug)
}
```

**Pole-to-category mapping — server-side only:**

```typescript
// server/lib/pole-categories.ts
export const POLE_CATEGORIES: Record<string, string[]> = { ... }
export const POLE_LABELS: Record<string, string> = { ... }
```

Frontend receives `poleCategories` from API response. No client import of server code.

### Team Member Pole Assignment

Add `pole` field to `TeamMember` in BOTH roster files:
- `server/data/team-roster.ts`
- `src/data/team-roster.ts`

```typescript
export interface TeamMember {
  slug: string
  name: string
  role: string
  team: string
  pole?: string  // 'java_modernisation' | 'fonctionnel' | 'legacy'
}
```

Assignments (13 members):
- **java_modernisation:** Yolan, Alexandre, Alan, Pierre-Mathieu, Andy, Steven, Matthieu, Martin, Nicole, Bethlehem, Pierre R.
- **fonctionnel:** Olivier, Guillaume

If `pole` is undefined → see all categories (backward-compatible).

### API Changes

**`MemberEvaluation` interface** — add `pole?: string`.

**`getEvaluation()` / `getAllEvaluations()`** — include `pole` in returned data.

**`upsertEvaluation()`** — ON CONFLICT preserves existing `pole` (already works since pole isn't in the INSERT/UPDATE columns).

**`GET /api/ratings/:slug`** — add `pole` and `poleCategories: string[]` to response. `poleCategories` derived server-side from pole-categories.ts mapping. If no pole, `poleCategories` is empty array (show all).

**`PATCH /api/ratings/:slug/pole`** — new endpoint:
- Uses `requireAuth` + `requireOwnership`
- Validates pole value
- Creates evaluation row if none exists (INSERT OR IGNORE with empty defaults first)
- Clears `skippedCategories` entries that conflict with new pole's required categories
- Returns updated evaluation

### Wizard Changes

**`src/components/form/skill-form-wizard.tsx`:**

When `roleCategories` is provided:
1. **Generate wizard steps for role categories ONLY.** Non-role categories are excluded from the step flow entirely.
2. **After the last role category step, show an "Ajouter des compétences optionnelles" section.** This is a collapsible list of non-role categories. Clicking one opens it inline for rating, similar to how the wizard handles a single category but without advancing to a "next step."
3. **Review step only shows rated categories** (both pole and any optional ones the user chose to fill).

This is the key UX change: a BA sees 7 steps, not 18. A Java dev sees 10. Optional categories are discoverable but don't clutter the flow.

### Form Page Changes

`src/pages/form-page.tsx`:

1. Fetch member data via `useRatings` — response now includes `pole` and `poleCategories`
2. Pass `poleCategories` as `roleCategories` to `SkillFormWizard`
3. **Pole selector:** At the top of the form, show pole badge + "Changer" button. 3-option selector. Saves via `PATCH /pole`, refetches data.

## Files to Modify

### Feature 1 (status dots)
- `server/index.ts` — add `/ratings/status` to auth bypass
- `server/routes/ratings.ts` — add `GET /status` endpoint
- `src/hooks/use-team-status.ts` — fetch from `/api/ratings/status`
- `server/__tests__/auth-gate.test.ts` — update expectations

### Feature 2 (pole separation)
- Create: `server/lib/pole-categories.ts` — mapping + labels
- Modify: `server/lib/db.ts` — pole column migration, update MemberEvaluation interface, update getEvaluation/getAllEvaluations to return pole, change deleteEvaluation to preserve pole
- Modify: `server/routes/ratings.ts` — add pole + poleCategories to GET responses, add PATCH pole endpoint
- Modify: `server/data/team-roster.ts` — add pole field to all 13 members
- Modify: `src/data/team-roster.ts` — same pole field
- Modify: `src/pages/form-page.tsx` — pass poleCategories as roleCategories, add pole selector
- Modify: `src/components/form/skill-form-wizard.tsx` — filter steps to role categories only, add expandable optional section

## NOT in scope
- New Adélia/Legacy categories — needs skill definitions from Guillaume
- Dashboard pole-based filtering/comparison — follow-up
- Collapsed/expandable color-coded pole sections — the step filtering solves the core problem

## What already exists
- `SkillFormWizard` roleCategories prop — reorders categories, shows Requis/Optionnel badges
- `StatusIcon` component + `useTeamStatus` hook — rendering logic works, just needs the right endpoint
- `team-roster.ts` dual roster pattern (server + client) — already established
- Auth gate bypass pattern — already used for `/auth/`, `/catalog`, `/evaluate/`

## Verification

1. Open landing page (not logged in) → click "Se connecter" → status dots show green/amber/gray
2. Log in as Olivier (fonctionnel) → form shows 7 steps only. No Java categories in the wizard.
3. Log in as Yolan (java_modernisation) → form shows 10 steps only.
4. After last pole step, "Compétences optionnelles" section visible with expandable categories
5. Fill an optional category → data saved alongside pole categories
6. Change pole via selector → wizard steps update, skippedCategories cleaned
7. Reset evaluation → pole preserved, ratings cleared
8. `npm run build` passes clean
9. Auth tests pass (GET /status public, GET /ratings still gated)

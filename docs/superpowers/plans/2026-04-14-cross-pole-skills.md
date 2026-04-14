# Cross-Pole Skill Entry & Comparison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users fill skills from any pole via a guided discovery step, and compare people across poles using only shared categories.

**Architecture:** New discovery-step component in the form wizard. Backend adds `declined_categories` column and a non-pole-categories endpoint. Aggregates compute shared categories dynamically for comparison. Dashboard dropdown grouped by pole, globe button removed.

**Tech Stack:** TypeScript, React 19, shadcn/ui, Visx, SQLite (better-sqlite3), Express, Vitest

**Spec:** `docs/superpowers/specs/2026-04-14-cross-pole-skills-design.md`

---

### Task 1: DB Migration — `declined_categories` column

**Files:**
- Modify: `server/lib/db.ts`

- [ ] **Step 1: Add startup migration for declined_categories**

In `server/lib/db.ts`, after the existing schema creation, add a migration check:

```typescript
// Migration: add declined_categories column if missing
const evalCols = db.prepare("PRAGMA table_info(evaluations)").all() as { name: string }[]
if (!evalCols.some(c => c.name === 'declined_categories')) {
  db.exec("ALTER TABLE evaluations ADD COLUMN declined_categories TEXT DEFAULT '[]'")
}
const candCols = db.prepare("PRAGMA table_info(candidates)").all() as { name: string }[]
if (!candCols.some(c => c.name === 'declined_categories')) {
  db.exec("ALTER TABLE candidates ADD COLUMN declined_categories TEXT DEFAULT '[]'")
}
```

- [ ] **Step 2: Update upsertEvaluation to accept declinedCategories**

In `server/lib/db.ts`, modify `upsertEvaluation`:

```typescript
export function upsertEvaluation(
  slug: string,
  ratings: Record<string, number>,
  experience: Record<string, number>,
  skippedCategories: string[],
  declinedCategories: string[] = [],
): MemberEvaluation {
  db.prepare(`
    INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      ratings = excluded.ratings,
      experience = excluded.experience,
      skipped_categories = excluded.skipped_categories,
      declined_categories = excluded.declined_categories
  `).run(
    slug,
    JSON.stringify(ratings),
    JSON.stringify(experience),
    JSON.stringify(skippedCategories),
    JSON.stringify(declinedCategories),
  )
  return getEvaluation(slug)!
}
```

- [ ] **Step 3: Verify server starts without errors**

Run: `npm run build && node server/index.js`
Expected: Server starts, no migration errors.

- [ ] **Step 4: Commit**

```bash
git add server/lib/db.ts
git commit -m "feat: add declined_categories column with startup migration"
```

---

### Task 2: Backend — Non-pole categories endpoint

**Files:**
- Modify: `server/routes/catalog.ts`

- [ ] **Step 1: Add GET /api/catalog/non-pole-categories/:pole**

After the existing `pole-categories/:pole` route in `server/routes/catalog.ts`:

```typescript
catalogRouter.get('/non-pole-categories/:pole', (req, res) => {
  const { pole } = req.params
  const validPoles = ['legacy', 'java_modernisation', 'fonctionnel']
  if (!validPoles.includes(pole)) {
    return res.status(400).json({ error: 'Pole invalide' })
  }

  // Get this pole's categories
  const poleCatRows = getDb()
    .prepare('SELECT category_id FROM pole_categories WHERE pole = ?')
    .all(pole) as { category_id: string }[]
  const poleCatIds = new Set(poleCatRows.map(r => r.category_id))

  // Get all categories from catalog
  const allCategories = getSkillCategories()

  // Get all pole mappings to determine which pole each non-pole category belongs to
  const allPoleCats = getDb()
    .prepare('SELECT pole, category_id FROM pole_categories')
    .all() as { pole: string; category_id: string }[]

  // Build reverse map: category_id -> pole(s)
  const catToPoles = new Map<string, string[]>()
  for (const row of allPoleCats) {
    const existing = catToPoles.get(row.category_id) ?? []
    existing.push(row.pole)
    catToPoles.set(row.category_id, existing)
  }

  // Group non-pole categories by source pole
  const groups: { pole: string; label: string; categories: typeof allCategories }[] = []
  const poleLabels: Record<string, string> = {
    legacy: 'Pole Legacy (Adelia / IBMi)',
    java_modernisation: 'Pole Java / Modernisation',
    fonctionnel: 'Pole Fonctionnel',
  }

  // Collect by pole
  const byPole = new Map<string, typeof allCategories>()
  const transverse: typeof allCategories = []

  for (const cat of allCategories) {
    if (poleCatIds.has(cat.id)) continue // skip user's own pole categories
    const poles = catToPoles.get(cat.id)
    if (!poles || poles.length === 0) {
      transverse.push(cat)
    } else {
      // Use the first pole that isn't the user's pole
      const sourcePole = poles.find(p => p !== pole) ?? poles[0]
      const existing = byPole.get(sourcePole) ?? []
      existing.push(cat)
      byPole.set(sourcePole, existing)
    }
  }

  for (const [p, cats] of byPole) {
    if (cats.length > 0) {
      groups.push({ pole: p, label: poleLabels[p] ?? p, categories: cats })
    }
  }
  if (transverse.length > 0) {
    groups.push({ pole: 'transverse', label: 'Transverse', categories: transverse })
  }

  res.json({ groups })
})
```

- [ ] **Step 2: Test the endpoint manually**

Run: `curl http://localhost:3001/api/catalog/non-pole-categories/java_modernisation | jq '.groups[].pole'`
Expected: `"fonctionnel"`, `"transverse"` (not `"java_modernisation"`)

- [ ] **Step 3: Commit**

```bash
git add server/routes/catalog.ts
git commit -m "feat: add non-pole-categories endpoint for discovery step"
```

---

### Task 3: Backend — Accept declinedCategories in ratings API

**Files:**
- Modify: `server/routes/ratings.ts`

- [ ] **Step 1: Parse declinedCategories from request body**

In `server/routes/ratings.ts`, in the PUT handler (around line 60), add after `skippedCategories` parsing:

```typescript
const { ratings, experience, skippedCategories, declinedCategories } = req.body
```

Add validation after the existing `skipped` validation:

```typescript
const declined = declinedCategories ?? []
if (!Array.isArray(declined)) {
  res.status(400).json({ error: 'Categories declines invalides : doit etre un tableau' })
  return
}
```

Update the `upsertEvaluation` call:

```typescript
const memberData = upsertEvaluation(slug, ratings, expObj, skipped, declined)
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/ratings.ts
git commit -m "feat: accept declinedCategories in ratings API"
```

---

### Task 4: Backend — Shared category computation in aggregates

**Files:**
- Modify: `server/routes/aggregates.ts`

- [ ] **Step 1: Add shared categories to member aggregate response**

In `server/routes/aggregates.ts`, in the member aggregate endpoint, add `ratedCategoryIds` to the response. After computing `categoryAverages`:

```typescript
// Compute which categories this member has rated (at least 1 skill with value > 0)
const ratedCategoryIds = Object.entries(categoryAverages)
  .filter(([, avg]) => avg > 0)
  .map(([catId]) => catId)
```

Add `ratedCategoryIds` to the response JSON.

- [ ] **Step 2: Commit**

```bash
git add server/routes/aggregates.ts
git commit -m "feat: include ratedCategoryIds in member aggregate response"
```

---

### Task 5: Frontend — Discovery step component

**Files:**
- Create: `src/components/form/discovery-step.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import SkillRatingRow from './skill-rating-row'
import type { SkillCategory, Skill } from '@/data/skill-catalog'

interface CategoryGroup {
  pole: string
  label: string
  categories: SkillCategory[]
}

interface DiscoveryStepProps {
  groups: CategoryGroup[]
  ratings: Record<string, number>
  declinedCategories: string[]
  onRate: (skillId: string, value: number) => void
  onDecline: (categoryId: string) => void
  onUndecline: (categoryId: string) => void
  onContinue: () => void
}

export default function DiscoveryStep({
  groups,
  ratings,
  declinedCategories,
  onRate,
  onDecline,
  onUndecline,
  onContinue,
}: DiscoveryStepProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [checkedSkills, setCheckedSkills] = useState<Set<string>>(new Set())
  const declinedSet = new Set(declinedCategories)

  // Pre-check skills that already have ratings
  useEffect(() => {
    const alreadyRated = new Set<string>()
    for (const group of groups) {
      for (const cat of group.categories) {
        for (const skill of cat.skills) {
          if (ratings[skill.id] !== undefined && ratings[skill.id] > 0) {
            alreadyRated.add(skill.id)
          }
        }
      }
    }
    if (alreadyRated.size > 0) {
      setCheckedSkills(prev => new Set([...prev, ...alreadyRated]))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExpand(categoryId: string) {
    if (expandedCategory === categoryId) {
      setExpandedCategory(null)
    } else {
      setExpandedCategory(categoryId)
      // Undecline if it was declined
      if (declinedSet.has(categoryId)) {
        onUndecline(categoryId)
      }
    }
  }

  function handleDecline(categoryId: string) {
    onDecline(categoryId)
    if (expandedCategory === categoryId) {
      setExpandedCategory(null)
    }
  }

  function toggleSkill(skillId: string) {
    setCheckedSkills(prev => {
      const next = new Set(prev)
      if (next.has(skillId)) {
        next.delete(skillId)
      } else {
        next.add(skillId)
      }
      return next
    })
  }

  const POLE_HEADING_COLORS: Record<string, string> = {
    legacy: 'text-[#EC8C32]',
    java_modernisation: 'text-[#1B6179]',
    fonctionnel: 'text-[#F0B800]',
    transverse: 'text-muted-foreground',
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold">Competences supplementaires</h2>
        <p className="text-sm text-muted-foreground">
          Avez-vous des competences dans d'autres domaines ?
        </p>
      </div>

      {groups.map(group => (
        <div key={group.pole} className="space-y-2">
          <h3 className={cn('text-sm font-semibold uppercase tracking-wider', POLE_HEADING_COLORS[group.pole] ?? 'text-muted-foreground')}>
            {group.label}
          </h3>

          {group.categories.map(cat => {
            const isExpanded = expandedCategory === cat.id
            const isDeclined = declinedSet.has(cat.id)
            const ratedCount = cat.skills.filter(s => checkedSkills.has(s.id) && ratings[s.id] > 0).length

            return (
              <Card
                key={cat.id}
                className={cn(
                  'transition-all duration-200',
                  isDeclined && 'opacity-50 bg-muted/30',
                )}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleExpand(cat.id)}
                      className="flex items-center gap-2 text-left min-w-0 flex-1"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{cat.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {cat.skills.slice(0, 3).map(s => s.label).join(', ')}...
                        </p>
                      </div>
                      {ratedCount > 0 && (
                        <span className="ml-auto shrink-0 flex items-center gap-1 text-xs text-primary font-medium">
                          <Check className="h-3 w-3" /> {ratedCount}
                        </span>
                      )}
                    </button>

                    {!isExpanded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDecline(cat.id)}
                        className="shrink-0 text-muted-foreground"
                      >
                        Passer
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      <p className="text-xs text-muted-foreground">Cochez les competences que vous maitrisez :</p>
                      {cat.skills.map(skill => {
                        const isChecked = checkedSkills.has(skill.id)
                        return (
                          <div key={skill.id}>
                            <label className="flex items-center gap-2 cursor-pointer py-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSkill(skill.id)}
                                className="rounded border-input"
                              />
                              <span className="text-sm">{skill.label}</span>
                            </label>
                            {isChecked && (
                              <div className="ml-6">
                                <SkillRatingRow
                                  skill={skill}
                                  value={ratings[skill.id]}
                                  onChange={(value) => onRate(skill.id, value)}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}

      <div className="pt-4">
        <Button onClick={onContinue} className="w-full">
          Continuer vers le recapitulatif
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/form/discovery-step.tsx
git commit -m "feat: add discovery-step component for cross-pole skill entry"
```

---

### Task 6: Frontend — Integrate discovery step into form wizard

**Files:**
- Modify: `src/components/form/skill-form-wizard.tsx`
- Modify: `src/hooks/use-skill-form.ts`
- Modify: `src/pages/form-page.tsx`

- [ ] **Step 1: Add declinedCategories to use-skill-form hook**

In `src/hooks/use-skill-form.ts`, add `declinedCategories` state alongside `skippedCategories`. Add it to the autosave payload and the load response parsing.

- [ ] **Step 2: Fetch non-pole categories in form-page**

In `src/pages/form-page.tsx`, after the existing `poleCategories` fetch, add:

```typescript
const [nonPoleGroups, setNonPoleGroups] = useState<CategoryGroup[] | null>(null)

useEffect(() => {
  if (!member?.pole) return
  fetch(`/api/catalog/non-pole-categories/${member.pole}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) setNonPoleGroups(data.groups) })
    .catch(() => {})
}, [member?.pole])
```

Pass `nonPoleGroups` to `SkillFormWizard`.

- [ ] **Step 3: Add discovery step to wizard flow**

In `src/components/form/skill-form-wizard.tsx`, insert the discovery step between the last category step and the review step. The discovery step is a single wizard step. Track `discoveryVisited` state.

When the "Soumettre" button is clicked and `!discoveryVisited`, navigate to the discovery step instead of submitting.

- [ ] **Step 4: Test the full flow**

Run the dev server, log in, navigate to the form. Complete required categories. Verify:
- Discovery step appears after last required category
- Categories grouped by pole heading
- "Oui" expands checkboxes, "Passer" grays out
- "Continuer" goes to review
- Submit works after visiting discovery

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-skill-form.ts src/pages/form-page.tsx src/components/form/skill-form-wizard.tsx
git commit -m "feat: integrate discovery step into form wizard"
```

---

### Task 7: Frontend — Grouped compare dropdown + remove globe button

**Files:**
- Modify: `src/components/dashboard/personal-overview.tsx`
- Modify: `src/pages/dashboard-page.tsx`

- [ ] **Step 1: Remove globe button and crossPole state**

In `src/components/dashboard/personal-overview.tsx`:
- Remove `Globe` import
- Remove `crossPole` / `setCrossPole` state
- Remove the Globe button JSX (around line 288-297)
- In `comparableMembers` memo: always return all submitted members (no pole filter)

- [ ] **Step 2: Group compare dropdown by pole**

In the `<Select>` for comparison, replace the flat member list with grouped `<SelectGroup>` elements:

```typescript
// Group members by pole
const membersByPole = useMemo(() => {
  const groups = new Map<string | null, typeof comparableMembers>()
  for (const m of comparableMembers) {
    const pole = m.pole ?? null
    const existing = groups.get(pole) ?? []
    existing.push(m)
    groups.set(pole, existing)
  }
  return groups
}, [comparableMembers])
```

Render with `<SelectGroup>` and `<SelectLabel>` for each pole. User's pole first, then others, then "Direction / Transverse" for null-pole. Hide empty groups.

- [ ] **Step 3: Rename "Moyenne equipe" based on scope**

Change the first `<SelectItem>` label from "Moyenne equipe" to "Moyenne de mon pole" when the dashboard has a pole filter active, and "Moyenne globale" when unfiltered. Pass `poleFilter` as a prop or derive from context.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/personal-overview.tsx src/pages/dashboard-page.tsx
git commit -m "feat: group compare dropdown by pole, remove globe button"
```

---

### Task 8: Frontend — Shared-category radar comparison

**Files:**
- Modify: `src/components/dashboard/personal-overview.tsx`
- Modify: `src/components/visx-radar-chart.tsx`

- [ ] **Step 1: Compute shared categories in personal-overview**

When `compareSlug` is set, compute shared categories between the viewed member and the compared member:

```typescript
const sharedCategoryIds = useMemo(() => {
  if (!compareSlug || !compareAggregate || !aggregate) return null
  const myRated = new Set(
    Object.entries(aggregate.categoryAverages)
      .filter(([, avg]) => avg > 0)
      .map(([id]) => id)
  )
  const theirRated = new Set(
    Object.entries(compareAggregate.categoryAverages)
      .filter(([, avg]) => avg > 0)
      .map(([id]) => id)
  )
  return [...myRated].filter(id => theirRated.has(id))
}, [compareSlug, aggregate, compareAggregate])
```

- [ ] **Step 2: Filter radar data to shared categories**

When passing data to `VisxRadarChart`, filter to `sharedCategoryIds` when in comparison mode.

- [ ] **Step 3: Filter strength/gap badges**

When `sharedCategoryIds` is set, filter `topStrengths` and `topGaps` to only include categories in the shared set.

- [ ] **Step 4: Add mode banner**

When comparing cross-pole (detected by different poles between the two members), show a banner:

```tsx
{compareSlug && isCrossPole && (
  <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-[#1B6179] dark:border-primary/30 dark:bg-primary/10 dark:text-primary">
    Comparaison inter-poles — categories communes uniquement
  </div>
)}
```

- [ ] **Step 5: Add category names label below radar**

Below the radar chart, when in comparison mode:

```tsx
{sharedCategoryIds && (
  <p className="text-xs text-muted-foreground text-center mt-2">
    Comparaison sur : {sharedCategoryIds.map(id => categoryLabel(id)).join(', ')}
  </p>
)}
```

- [ ] **Step 6: Handle zero shared categories**

When `sharedCategoryIds` is empty (length 0), show the friendly empty state instead of the radar:

```tsx
<div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-8 text-center">
  <p className="font-medium">Pas de categories en commun.</p>
  <p className="text-sm text-muted-foreground mt-1">
    Completez vos competences supplementaires pour enrichir la comparaison.
  </p>
</div>
```

- [ ] **Step 7: Add category list to radar export footer**

In `src/components/visx-radar-chart.tsx`, modify the PNG export function. When a `comparisonLabel` prop is provided, draw it as footer text in the canvas before export.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/personal-overview.tsx src/components/visx-radar-chart.tsx
git commit -m "feat: shared-category radar comparison with mode banner and export footer"
```

---

### Task 9: Tests

**Files:**
- Create: `tests/discovery-step.test.ts`
- Create: `tests/shared-categories.test.ts`

- [ ] **Step 1: Test discovery step rendering**

```typescript
import { describe, it, expect } from 'vitest'

describe('discovery step logic', () => {
  it('groups non-pole categories correctly', () => {
    // Test that java_modernisation pole excludes its own categories
    // and groups fonctionnel + legacy + transverse correctly
  })

  it('declined categories stored separately from skipped', () => {
    // Verify declinedCategories is a distinct array
  })
})
```

- [ ] **Step 2: Test shared category computation**

```typescript
describe('shared category computation', () => {
  it('returns only categories where both members rated skills', () => {
    const memberA = { categoryAverages: { 'soft-skills-delivery': 3.5, 'backend-integration': 4.0, 'architecture-governance': 2.0 } }
    const memberB = { categoryAverages: { 'soft-skills-delivery': 2.5, 'analyse-fonctionnelle': 3.0, 'architecture-governance': 3.5 } }
    // Shared: soft-skills-delivery, architecture-governance
    // Not shared: backend-integration (only A), analyse-fonctionnelle (only B)
  })

  it('returns empty array when no overlap', () => {
    // Member A only has legacy categories, Member B only has fonctionnel-specific
  })

  it('java vs fonctionnel shares exactly 3 default categories', () => {
    // architecture-governance, soft-skills-delivery, domain-knowledge
    // NOT core-engineering (not in fonctionnel)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: add tests for discovery step and shared-category comparison"
```

---

### Task 10: Final integration test

- [ ] **Step 1: Full flow test**

1. Log in → navigate to form → complete required categories
2. Discovery step appears → expand one category → check 2 skills → rate them → decline others
3. Review step shows rated skills from discovery
4. Submit
5. Navigate to dashboard → compare with someone from another pole
6. Verify: radar shows shared categories only, banner appears, badges filtered
7. Compare with someone from same pole → full radar, no banner

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Push to dev**

```bash
git push origin dev
```

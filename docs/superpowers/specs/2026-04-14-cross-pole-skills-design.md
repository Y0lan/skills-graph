# Cross-Pole Skill Entry & Comparison — Design Spec

## Context

The SINAPSE Skill Radar lets team members self-assess their skills across 19 categories. Categories are grouped by pole (team): java_modernisation (11 categories), fonctionnel (9 categories), legacy (5 categories). Some categories are shared across poles (Architecture, Soft Skills, Domain Knowledge).

**Problem**: The form only shows your pole's categories. Extra categories are buried behind a button on the review step. When comparing across poles, radar charts show all 19 axes with most at 0. This makes cross-pole comparison useless.

**Three changes**: guided discovery step in the form, shared-category radar comparison, grouped compare dropdown.

---

## 1. Form: Guided Discovery Step

### Location
A new step after all required pole categories and before the review step. Shows in the progress bar as a dedicated step labeled "+".

### Layout: Vertical Scroll with Collapsible Cards
All non-pole categories shown on one scrollable page, grouped by pole heading. Each category is a collapsed card. "Oui, j'en ai" expands inline. "Suivant" collapses and grays out the card. A "Continuer vers le recapitulatif" button appears at the bottom.

```
-- Pole Fonctionnel --
  [v] Analyse Fonctionnelle              [Suivant]
      Cadrage, modelisation, specifications...

  [v] Design & UX                        [Suivant]
      Wireframing, accessibilite, tests UX...

-- Pole Legacy --
  [v] Legacy IBM i / Adelia              [Suivant]
      RPG, CL, Adelia, DB2/400...

-- Transverse --
  [v] Infrastructure, Systemes, Reseau   [Suivant]
      Linux, Docker, Networking...

              [Continuer vers le recapitulatif]
```

### "Oui, j'en ai" — Individual Skill Picking (not full category commitment)
When the user taps "Oui, j'en ai", the card expands inline into a **checklist of skills** with checkboxes. Skills appear in catalog order (same as required category steps). The user checks only the skills they know, then rates just those using the existing `SkillRatingRow` component. Unchecked skills are ignored (not counted as 0). This avoids the trap of committing to rate all 7-10 skills in a category.

### "Suivant" — Declined Category
Tapping "Suivant" marks the category as `declined` and moves to the next. This is stored as a new `declined_categories: string[]` field, separate from the existing `skipped_categories`. This distinction is important for analytics:
- `declined_categories`: "I don't have these skills" (informed decision)
- `skipped_categories`: "I'll do this later" / "I didn't finish" (deferred)

### Grouping
- Categories already in the user's pole are NOT shown (they were required steps)
- Remaining categories grouped by which pole they belong to
- `infrastructure-systems-network` (orphan, not assigned to any pole) goes under "Transverse"
- Each pole heading uses the pole label from POLE_LABELS

### Submit Flow
The discovery step is not blocking submission. However, the step must be **visited** at least once (even if the user clicks "Suivant" through everything). The header "Soumettre" button navigates to the discovery step first if it hasn't been visited, then to review.

### Async Safety
Pole categories are fetched before wizard initialization. The discovery step only mounts after pole data is loaded, avoiding stale step state from async fetch races.

---

## 2. Radar Comparison: Shared Categories Only

### Rule
When comparing two people, the radar only plots axes for categories where **both** people have rated at least one skill. This is computed dynamically from actual ratings, not from pole assignments.

### Minimum Overlap
- Same-pole comparison: both filled the same required categories, full radar
- Cross-pole comparison: minimum 3 shared categories (Architecture, Soft Skills, Domain Knowledge). If users fill extra categories via the discovery step, the shared set grows.
- `core-engineering` is NOT in the fonctionnel pole, so java_modernisation vs fonctionnel shares 3, not 4

### Full-Stack Alignment
When in comparison mode, ALL dashboard components align to the shared category set:
- **Radar chart**: shared categories only
- **Strength badges**: filtered to shared categories
- **Gap badges**: filtered to shared categories (red gap badges remain semantic red)
- **AI comparison summary**: scoped to shared categories
- **Profile summary text**: scoped to shared categories

### Label
Below the radar chart: "Comparaison sur Soft Skills, Architecture, Domaine" — showing category **names**, not just a count. Users need to know which categories survived filtering and why others disappeared.

### Mode Indicator
When selecting someone from another pole, a banner appears above the comparison: "Comparaison inter-poles — categories communes uniquement". This replaces the removed globe button as the explicit mode signal.

### Export
When exporting radar as PNG, the footer includes the category list: "Comparaison sur: Soft Skills, Architecture, Domaine". Context travels with the image.

---

## 3. Compare Dropdown: Grouped by Pole

### Structure
```
Moyenne de mon pole    (when pole filter active)
-- or --
Moyenne globale        (when no pole filter)

-- Mon pole (Java / Modernisation) --
  Alice Martin
  Bob Dupont
  ...

-- Pole Fonctionnel --
  Claire Bernard
  ...

-- Direction / Transverse --
  Marie Directrice (pole: null)
  ...
```

### Rules
- Members grouped by pole with pole label as section header
- User's own pole first, then other poles alphabetically
- Null-pole members (managers, directors) under "Direction / Transverse"
- Empty groups are **hidden** (if no legacy members, no "Pole Legacy" section)
- "Moyenne equipe" renamed to match actual scope: "Moyenne de mon pole" when pole-filtered, "Moyenne globale" when unfiltered
- Globe button removed entirely

---

## 4. Data Model Changes

### New field: `declined_categories`
- **Schema**: `declined_categories TEXT DEFAULT '[]'` (JSON array of category IDs) on the evaluations/candidates table
- **Semantics**: Categories the user explicitly said "I don't have these skills" during discovery
- **Distinct from**: `skipped_categories` which means "deferred / didn't finish"
- **API**: Included in the ratings save/submit payloads

### Aggregate computation
- `declined_categories` are treated as true zeros (user confirmed they don't have the skill)
- `skipped_categories` are excluded from averages (unknown state)
- When computing shared categories for comparison: a category counts as "rated" if the user rated at least 1 skill in it. Declined categories do NOT count as rated.

---

## 5. Interaction States

| Feature | Loading | Empty | Error | Success |
|---------|---------|-------|-------|---------|
| Discovery step | Skeleton cards while pole categories fetch | No non-pole categories exist: skip step entirely, go to review | Catalog fetch fails: "Impossible de charger les categories" + retry button | All cards answered: "Continuer" button enabled |
| Expanded checkboxes | N/A (inline) | N/A (always has skills from catalog) | N/A | Checked skills show SkillRatingRow inline |
| Comparison radar | Same as current loading state | 0 shared categories: friendly empty state (see below) | Aggregate fetch fails: current error handling | Radar renders with category name label |
| Compare dropdown | Team loading: skeleton | Empty pole group: hidden entirely | Fetch fails: current error handling | Selected member highlighted |

### Zero Shared Categories (empty state)
When comparing two people with 0 categories in common, show:
- "Pas de categories en commun."
- "Completez vos competences supplementaires pour enrichir la comparaison."
- Link to `/form/{slug}` pointing to the discovery step
- No radar drawn, no badges, no summary

---

## 6. Responsive & Accessibility

### Mobile (< 640px)
- Discovery cards: full-width, edge-to-edge
- Expanded checkboxes + rating rows: stack vertically, same as existing SkillRatingRow on mobile
- Touch targets: already 44px+ from existing components
- Compare dropdown: full-width on mobile
- Mode banner: full-width, smaller text

### Accessibility
- Discovery cards: `role="group"` with pole heading as `aria-label`
- Keyboard: Tab through cards, Enter to expand/collapse, Space to toggle checkboxes
- Screen reader: expanded/collapsed state announced via `aria-expanded`
- Contrast: all text meets WCAG AA (existing brand colors verified)

---

## 7. Design System Alignment

- Pole headings: use POLE_COLORS from constants.ts (orange/teal/gold)
- "Transverse" heading: muted foreground styling
- "Oui, j'en ai" button: `Button variant="outline"` with brand teal border
- "Suivant" button: `Button variant="ghost"`
- Expanded skill checkboxes: reuse existing `SkillRatingRow` component
- Mode banner (inter-poles): teal info box pattern (`border-primary/30 bg-primary/5 text-[#1B6179]`)
- Declined card state: `opacity-50` with muted background, collapsed
- Cards: reuse shadcn `Card` component with `ring-1 ring-foreground/10`

---

## What We Accept

- **3-axis minimum for pure cross-pole comparison** is inherent. The discovery step is the mechanism to expand that. We don't force categories onto poles where they don't belong.
- **Some self-selection bias remains**: confident people will opt into more categories. The `declined_categories` field lets us measure the bias. Individual skill picking (vs. full category commitment) reduces the cost of saying "yes" and thus reduces the bias.
- **"5 seconds per category" is aspirational**: with individual skill picking, the real flow is: read name + examples (3s) → decide yes/no (2s). If yes, scan ~8 skills and check 2-3 (15s) → rate those (30s). Total per "yes" category: ~50s. Per "no" category: ~5s.

---

## Files to Modify

### Backend
- `server/lib/db.ts` — add `declined_categories` column, add `infrastructure-systems-network` to a "transverse" pole mapping
- `server/routes/ratings.ts` — accept and store `declined_categories`
- `server/routes/aggregates.ts` — exclude declined categories from comparison, compute shared categories dynamically
- `server/routes/catalog.ts` — new endpoint: `GET /api/catalog/non-pole-categories/:pole` returning categories NOT in the pole, grouped by source pole

### Frontend — Form
- `src/components/form/skill-form-wizard.tsx` — add discovery step with guided flow
- `src/components/form/discovery-step.tsx` — new component: pole-grouped category cards with skill checkboxes
- `src/hooks/use-skill-form.ts` — add `declinedCategories` state
- `src/pages/form-page.tsx` — ensure discovery step is visited before submit

### Frontend — Dashboard
- `src/components/dashboard/personal-overview.tsx` — remove globe button, filter strength/gap badges to shared categories in comparison mode, add mode banner
- `src/components/visx-radar-chart.tsx` — accept filtered category set, add category names to export footer
- `src/pages/dashboard-page.tsx` — group compare dropdown by pole, rename "Moyenne equipe"

### Frontend — Shared
- `src/lib/types.ts` — add `declinedCategories` to form types
- `src/lib/constants.ts` — no changes needed (POLE_LABELS already exist)

---

## Verification

1. **Form**: Fill pole categories → discovery step appears → click through with mix of yes/no → review shows only rated skills
2. **Form edge case**: Submit without visiting discovery → redirected to discovery first
3. **Same-pole comparison**: Both users filled same categories → full radar, no filtering banner
4. **Cross-pole comparison**: Java vs Fonctionnel → radar shows 3 axes (Architecture, Soft Skills, Domain), banner appears, badges filtered
5. **Cross-pole with extras**: Both users filled Core Engineering via discovery → radar shows 4 axes
6. **Null-pole members**: Appear under "Direction / Transverse" in dropdown
7. **Empty groups**: No "Pole Legacy" shown if 0 members
8. **Export**: PNG footer shows category names
9. **Declined vs skipped**: `declined_categories` stored separately, analytics queryable

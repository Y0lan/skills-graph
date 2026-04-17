<!-- /autoplan restore point: /home/yolan/.gstack/projects/Y0lan-skills-graph/dev-autoplan-restore-20260417-130530.md -->
# Comparison page redesign: ranked list + role-aware radar + row actions

**Status:** approved (v3 post full autoplan pipeline)
**Branch:** dev
**Owner:** Yolan
**Review artifacts:** CEO dual voices (Claude subagent + Codex), Design dual voices, Eng dual voices — all in session transcript.

## Problem

On `/recruit/reports/comparison/:posteId` the recruiter's job is "decide who to
preselect for the next stage of this poste." The current page fails that job:

1. **No ranking signal.** All candidates render as radar overlays. Nothing
   tells the recruiter who fits best.
2. **Wrong axes for the role.** The radar plots all 18 categories even when
   the role only uses 4. Everyone looks weak.
3. **No decisive action.** Ranking without a CTA is stale — the recruiter
   identifies their pick, then has to navigate elsewhere to act.

## Approach

Answer the job-to-be-done on one page: rank → see gaps → act.

### Primary UI: ranked candidates table

Sortable table, one row per candidate. Default sort: `taux_compatibilite_poste
DESC, taux_global DESC, created_at ASC, id ASC` (stable).

Columns:

| ☐ | Rank | Candidate | Role-fit % | Gaps | Actions |

- **Checkbox** (max 4 selected) controls radar overlay below.
- **Rank** derived, stable.
- **Role-fit %** uses existing `tauxPoste` (aka `taux_compatibilite_poste`).
- **Gaps** chips: plain language, server-computed. E.g., `Backend: below target`,
  tooltip shows rating `Scored 1/3`.
- **Actions**: `Préselectionner` (primary, advances `postule` → `preselectionne`),
  `Refuser` (secondary destructive, transitions to `refuse`). Both use `AlertDialog`
  confirmation. Both disabled when current `statut` already past that transition.
  Both available from any non-terminal state (user requested: reject available at
  every step).

### Secondary UI: role-aware radar (selected candidates overlay, max 4)

Below the table:
- **Axes** filtered to poste's `roleCategories`. Falls back to full catalog if
  empty for an active role (with staleness banner — see below).
- **Overlay** matches the checkbox selection from the table (default: top 3).
- **Missing scores** render at 0 in gray, not omitted. Preserves "this candidate
  never addressed this skill" signal.
- Legend color-coded, synced to table row highlight on hover.

### Staleness banner (role_categories empty for active role)

Yellow alert above the table:
> **Role configuration incomplete.** This role has no skill categories
> configured. Ranking and radar use fallback (all categories).
> [Configure categories] (stubbed, links to future admin UI) [Dismiss for session]

## Auto-decisions (from autoplan review)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Use `roleCategories` camelCase | DRY — matches `evaluate.ts:53`, `recruitment.ts:253,320` |
| 2 | Compute gaps server-side | DRY — `compatibility.ts:220` has the role/category math |
| 3 | Extend `GET /api/recruitment/postes/:id/candidatures` with `{rank, gaps, roleCategories}` | Boil lakes — one endpoint change fixes N+1 + ranking + gaps + axes |
| 4 | Gap chip labels plain French: "Backend : sous l'objectif" with tooltip `Score 1/3` | Explicit — never show bare signed integers |
| 5 | Tie-break: `taux_compat DESC, taux_global DESC, created_at ASC, id ASC` | Stable |
| 6 | Spec all 6 missing states (loading, empty, fetch error, partial scores, single candidate, staleness) | Completeness |
| 7 | Selection persisted by candidate id, survives refetch | Explicit |
| 8 | Drop "soft-deleted candidatures" edge (no `deleted_at` column) | Codex correct |
| 9 | Staleness banner CTA buttons (not bare text) | Completeness |
| 10 | Radar overlay: checkboxes in table, max 4 | User pick |
| 11 | Row actions: Préselectionner (primary) + Refuser (secondary) with AlertDialog confirms | User pick |

## Scope

**In scope**
- Backend: rewrite `GET /api/recruitment/postes/:id/candidatures` to return
  enriched rows: `{id, candidateName, tauxPoste, tauxGlobal, rank, gaps: [...],
  statut, createdAt, lastEventAt}`. Response also includes top-level
  `roleCategories: string[]`.
- Backend: new server-side gap helper `computeRoleGaps(ratings, roleCategories,
  threshold=3)` in `server/lib/compatibility.ts` or new `server/lib/gap-analysis.ts`.
  Returns `[{categoryId, categoryLabel, rating, severity: 'missing'|'below'|'critical'}]`.
- Frontend: rewrite `src/pages/report-comparison-page.tsx` with new layout.
- Frontend: gap chip component `src/components/gap-chip.tsx`.
- Frontend: six states rendered — loading skeleton, empty, fetch error,
  partial scores, single candidate, staleness warning.
- Actions: inline `Préselectionner` / `Refuser` with `AlertDialog` confirmation,
  calls existing `PATCH /api/recruitment/candidatures/:id` status route.
- Tests:
  - Backend unit: `computeRoleGaps` deterministic, handles missing ratings,
    partial ratings, threshold boundary.
  - Backend integration: enriched candidatures endpoint returns `rank`, `gaps`,
    `roleCategories`. Stable tie-break on equal scores. Null-fit sorted last.
  - Frontend component: table renders in rank order, gap chips show plain
    labels, checkbox max 4 enforced, row actions trigger transitions, all 6
    states render.
- Visual QA on dev.radar.sinapse.nc: BA poste (poste-7) + Java poste (poste-4),
  both views.

**NOT in scope**
- Role categories editor UI → TODOS.md.
- Weighted category importance (must-have vs nice-to-have) → TODOS.md.
- Toggle to full-profile radar (show all 18 axes) → TODOS.md.
- Shortlist feature (separate dimension from `statut`) → TODOS.md.
- Schedule interview integration → TODOS.md.
- Prod deployment (ships to dev, prod push separate).

## Implementation sketch

### Backend

**`server/lib/gap-analysis.ts` (new):**
```ts
export interface RoleGap {
  categoryId: string
  categoryLabel: string
  rating: number | null
  severity: 'missing' | 'below' | 'critical'
}

export function computeRoleGaps(
  ratings: Record<string, number>,
  roleCategoryIds: string[],
  categoryLabels: Record<string, string>,
  threshold = 3,
): RoleGap[] {
  const gaps: RoleGap[] = []
  for (const catId of roleCategoryIds) {
    const rating = ratings[catId]
    if (rating === undefined || rating === null) {
      gaps.push({ categoryId: catId, categoryLabel: categoryLabels[catId] ?? catId, rating: null, severity: 'missing' })
    } else if (rating < threshold) {
      gaps.push({
        categoryId: catId,
        categoryLabel: categoryLabels[catId] ?? catId,
        rating,
        severity: rating <= 1 ? 'critical' : 'below',
      })
    }
  }
  return gaps.sort((a, b) => (a.rating ?? -1) - (b.rating ?? -1)).slice(0, 3)
}
```

**`server/routes/recruitment.ts`:** extend the poste-candidatures route.
```ts
// GET /api/recruitment/postes/:id/candidatures
const roleCategories = getRoleCategories(poste.role_id)
const rows = rawRows
  .map((r, idx) => ({
    ...r,
    rank: idx + 1,
    gaps: computeRoleGaps(r.ratings ?? {}, roleCategories, categoryLabels),
  }))
res.json({ roleCategories, candidatures: rows })
```

SQL ORDER: `ORDER BY taux_compatibilite_poste DESC NULLS LAST, taux_global DESC NULLS LAST, created_at ASC, id ASC`.

### Frontend

`report-comparison-page.tsx` new layout (ASCII):

```
┌─────────────────────────────────────────────────┐
│ Développeur Java Full Stack · 7 candidats       │
│ [⚠️ Role config incomplete] (only if stale)    │
├─────────────────────────────────────────────────┤
│ ☐  Rang  Candidat    Fit%   Gaps          Actions
│ ☑  1     Marie       87%    (aucun)       [Préselec][Refuser]
│ ☑  2     Jean        72%    Backend:sous  [Préselec][Refuser]
│ ☑  3     Alex        64%    Sécu:sous     [Préselec][Refuser]
│ ☐  4     Paul        58%    Back,Sécu     [Préselec][Refuser]
├─────────────────────────────────────────────────┤
│ Radar (3 sélectionnés)                          │
│    [VisxRadarChart, role-filtered axes]         │
└─────────────────────────────────────────────────┘
```

State management: `useState` for `selectedIds: Set<string>` + `viewState: 'loading' | 'loaded' | 'error' | 'empty' | 'stale'`.

### Row action flow

1. Click `Préselectionner` → `AlertDialog`: "Préselectionner Marie Dupont ? Elle recevra un email pour compléter le Skill Radar."
2. Confirm → `PATCH /api/recruitment/candidatures/:id` with `{statut: 'preselectionne'}`.
3. On success → refetch the page data, row shows new status badge, button grays out.
4. Same flow for `Refuser` with destructive button + "Cette action enverra un email de refus au candidat."

Both buttons disabled if:
- Current `statut` is `embauche`, `refuse`, or `retire` (terminal states).
- For `Préselectionner`: also disabled if already past `postule` (can't re-preselect).

## Tests

**Backend:**
- `server/__tests__/gap-analysis.test.ts`:
  - No ratings → all missing severity.
  - All ratings ≥ threshold → empty gaps.
  - Mixed → returns top-3 weakest, severity correct.
  - Rating = threshold → not a gap.
- `server/__tests__/recruitment.test.ts`:
  - Enriched endpoint returns `rank`, `gaps`, `roleCategories`.
  - Stable tie-break: 2 candidates with equal tauxPoste+tauxGlobal → sorted by `createdAt` then `id`.
  - Null tauxPoste → last in order.
  - Staleness: role with 0 categories returns empty `roleCategories`, gaps empty.

**Frontend:**
- `src/pages/__tests__/report-comparison-page.test.tsx`:
  - Table renders candidates in server-provided rank order.
  - Gap chip renders plain French, tooltip shows `X/3`.
  - Checkbox: 4 selected + try to check 5th → blocked, toast or disabled state.
  - Checkbox selection persists by candidate id across simulated refetch.
  - `Préselectionner` confirm flow calls PATCH with correct payload.
  - `Refuser` confirm flow same.
  - Buttons disabled on terminal statut.
  - Loading skeleton, empty, error, single-candidate, staleness states all render.

**Visual QA (dev):**
- Open `/recruit/reports/comparison/poste-4-dev-java-fullstack` → Java-relevant axes.
- Open `/recruit/reports/comparison/poste-7-business-analyst` → BA-relevant axes.
- Preselect a test candidate → status badge changes, email sent (check inbox).
- Seed a role with 0 categories → staleness banner visible.

## Risks

- **`taux_compatibilite_poste` accuracy** — the ranking signal. If extraction is noisy (CV variance), ranking looks wrong. Acknowledged. Gap breakdown gives recruiter sanity-check signal.
- **Row-level status transitions from compare view** — recruiter might mis-click and preselect/reject the wrong candidate. Mitigated by AlertDialog confirmation naming the candidate explicitly.
- **Checkbox × 4 UX** — if 4 are checked and user clicks a 5th, we disable the checkbox (visually obvious) rather than silently ignoring.
- **Staleness banner visibility** — could be dismissed then forgotten. Re-appears each session. Future admin UI will fix root cause.

## Rollout

1. One commit on dev branch.
2. `npm run build && npm test` must pass (build is stricter than lint — learned this the hard way).
3. CI deploys to dev.radar.sinapse.nc.
4. Visual QA per above.
5. Prod push: separate decision.

## Follow-ups → TODOS.md

- Role categories editor UI (admin).
- Weighted category importance (must-have / nice-to-have).
- Toggle to full-profile radar for edge cases.
- Shortlist feature (cross-poste).
- Schedule interview integration.

## GSTACK REVIEW REPORT

| Review | Trigger | Runs | Status | Findings |
|--------|---------|------|--------|----------|
| CEO Review | autoplan | 1 | approved after pivot | Original plan scope "cosmetics not decisions"; pivoted to ranked-list-first |
| Codex CEO | autoplan | 1 | confirmed pivot | Same finding as Claude CEO subagent |
| Design Review | autoplan | 1 | issues fixed in v3 | Gap chips unreadable, 6 missing states, no CTA |
| Codex Design | autoplan | 1 | confirmed | Same findings as Claude design subagent |
| Eng Review | autoplan | 1 | issues fixed in v3 | Endpoint shape, naming (roleCategories), gap placement, tie-breaks |
| Codex Eng | autoplan | 1 | confirmed | Same findings as Claude eng subagent |

**VERDICT:** APPROVED. All 11 auto-decisions applied, 2 taste decisions resolved by user, 5 items deferred to TODOS.md.

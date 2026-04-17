# Recruitment funnel Sankey diagram

**Status:** approved
**Branch:** dev
**Owner:** Yolan

## Problem

Recruiters can see how many candidates are at each stage today (horizontal bar
funnel on `/recruit/reports/campaign`), but they can't see **how candidates
flowed between stages**: how many of the 30 who applied got preselected? How
many of those took the skill radar? Where do candidates drop off — at refusal
after CV review, after the radar, after entretien 1?

This matters for operational learning. If 80% of applicants get preselected
but only 20% complete the radar, the radar invitation is the leak. The bar
funnel can't show that — it just shows "20 preselected, 5 radar complete." The
flow data is in `candidature_events` already, just not visualized.

## Approach

A Sankey diagram on a new page `/recruit/funnel`. Nodes are statuses; links
are counts of candidatures that transitioned between them. Source data is the
`candidature_events` table where `type='status_change'`.

### Data model

Backend endpoint `GET /api/recruitment/funnel` returns:

```ts
{
  nodes: [{ id: 'postule', label: 'Postulé', count: 30 }, ...],
  links: [{ source: 'postule', target: 'preselectionne', value: 18 }, ...],
  totals: { all: 30, hired: 2, refused: 12, in_progress: 16 }
}
```

Counts come from:
- **Links**: `SELECT statut_from, statut_to, COUNT(DISTINCT candidature_id)
  FROM candidature_events WHERE type='status_change' AND statut_from IS NOT NULL
  GROUP BY statut_from, statut_to`
- **Node counts**: distinct candidatures that have ever been in that status
  (sum of incoming links + initial pool for `postule`).

### Library

`d3-sankey` (~10KB, canonical d3 plugin). Renders into SVG. We already use d3
patterns via visx so this fits.

### Filters (v1)

- **Time range**: last 30 days / last 90 days / all time. Default: last 90 days.
- **Pole filter**: legacy / java_modernisation / all. Default: all. Same dropdown
  as the existing pipeline page.

That's it for v1. No per-poste filter, no canal breakdown — those are visible on
the existing pipeline + comparison pages.

## Scope

**In scope**
- Backend: `GET /api/recruitment/funnel?days=90&pole=all` returning nodes/links/totals.
- Frontend: new `src/pages/recruit-funnel-page.tsx` with d3-sankey chart.
- Route: `/recruit/funnel` in `App.tsx`.
- Navigation link from `/recruit` and `/recruit/pipeline` headers.
- Unit tests for the aggregation function (handles empty events, multiple
  transitions on same candidature, terminal states).
- Visual QA on dev.

**NOT in scope**
- Per-candidature drill-down from a Sankey link.
- Time animation (e.g., how the Sankey changes month over month).
- Cross-poste comparison (different sankeys side by side).
- Alternative chart types (Gantt of pipeline timing, etc.).

## Implementation

### Backend

`server/lib/funnel-analysis.ts` (new):
```ts
export interface FunnelNode { id: string; label: string; count: number }
export interface FunnelLink { source: string; target: string; value: number }
export interface FunnelData {
  nodes: FunnelNode[]
  links: FunnelLink[]
  totals: { all: number; hired: number; refused: number; in_progress: number }
}

export function buildFunnel(opts: { days?: number; pole?: string }): FunnelData
```

Logic:
1. Query candidatures (filtered by pole + days since created_at).
2. Query candidature_events (filtered to those candidature ids, type='status_change').
3. Aggregate links by (statut_from, statut_to).
4. Build nodes from STATUSES array, count = candidatures currently in or
   ever-touched that status.
5. Compute totals.

`server/routes/recruitment.ts`: add the route, parse query params, call
`buildFunnel`, return JSON.

### Frontend

`src/pages/recruit-funnel-page.tsx`:
- Fetch `/api/recruitment/funnel` with current filters.
- Render with d3-sankey + custom SVG. Use the existing color palette
  (`statut` colors from `STATUT_LABELS`).
- Tooltip on links: "X candidates: Postulé → Préselectionné".
- Empty state: "Pas encore assez de transitions pour afficher le funnel."
- Loading skeleton.
- Error state.
- Filter chips at top (time range, pole).

### Tests

- `server/__tests__/funnel-analysis.test.ts`:
  - No events → empty links, all candidatures counted under their current status.
  - Single candidature with 3 transitions → 3 links of value 1.
  - Multiple candidatures merging at same source → correct value sum.
  - Time range filter excludes old candidatures.
  - Pole filter excludes other-pole candidatures.
  - Terminal state (embauche, refuse) has no outgoing links.

- Visual QA on dev: open `/recruit/funnel`, verify shape matches reality
  using the existing bar funnel as ground truth.

## Risks

- **Empty data state**: brand-new postes have no transitions. Page shows
  "not enough data yet" alert. Resolved via empty state.
- **Cyclic transitions**: candidates can be reopened (e.g., from refuse back
  to preselectionne if state machine allows). d3-sankey requires a DAG.
  Resolved by pinning node order and treating cycles as new logical layer
  (rare in practice; acceptable for v1).
- **Large datasets**: Sankey can render slowly with many nodes/links. We have
  10 statuses max. Negligible.

## Rollout

1. One commit on dev.
2. `npm run build && npm test` pass.
3. CI deploys to dev.
4. Visual QA: open `/recruit/funnel`, sanity check against bar funnel.
5. Prod push: separate decision.

## Follow-ups → TODOS.md

- Per-candidature drill-down (click a link → list of candidates in that flow).
- Time animation (month-over-month evolution).
- Drop-off rate annotations on each link.

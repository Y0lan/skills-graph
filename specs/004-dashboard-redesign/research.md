# Research: Dashboard Redesign & Expert Finder

## R1. Expert Finder Data Source — Per-Skill Ratings API

**Decision**: Extend the existing `GET /api/aggregates` team endpoint to include per-member, per-skill ratings. Add a `skillRatings: Record<string, number>` field to `TeamMemberAggregateResponse`.

**Rationale**: The current `/api/aggregates` endpoint returns only category-level averages (`categoryAverages: Record<string, number>`). The Expert Finder needs individual skill scores (e.g. "Java: 4, SQL: 3") to rank members by specific skill combos. The raw data already exists in `getAllEvaluations()` from `server/lib/db.ts` — we just need to expose it in the team aggregate response.

**Why extend vs new endpoint**: A separate `/api/skill-ratings` endpoint would mean the dashboard page needs two API calls. Since the dashboard already fetches `/api/aggregates`, extending it keeps data fetching simple. The payload increase is minimal (~65 skill IDs × 12 members = ~780 key-value pairs).

**Alternatives considered**:
- New dedicated endpoint (`GET /api/expert-finder?skills=java,sql`): Server-side filtering is unnecessary — the dataset is tiny (~780 ratings). Client-side filtering is instant and avoids extra API calls.
- Client fetches all raw evaluations: Exposes more data than needed (experience, skippedCategories).

## R2. Dashboard Tab Navigation — shadcn Tabs Component

**Decision**: Use shadcn/ui `Tabs` component for section navigation. Three tabs: "Mon profil" (personal), "Équipe" (team intelligence), "Expert Finder".

**Rationale**: shadcn/ui `Tabs` is already installed in the project (added in Phase 1 of the v2 spec). It uses Radix UI primitives, provides keyboard navigation and ARIA attributes out of the box, and integrates with the existing design system. Constitution Principle II mandates shadcn/ui for all UI components.

**Tab behavior**:
- When visiting `/dashboard/:slug`: default tab is "Mon profil" (personal)
- When visiting `/dashboard` (no slug): default tab is "Équipe" (team)
- Tab switching is client-side only — no URL changes, no re-fetching
- Both team and member data are fetched on page load regardless of active tab (data is small)

**Alternatives considered**:
- URL hash routing (`/dashboard#team`): Adds complexity, not needed for 3 tabs.
- Sidebar navigation: Overkill for 3 sections, wastes horizontal space.
- Accordion sections: Harder to navigate, doesn't solve the "long scroll" problem.

## R3. Expert Finder UI Pattern — Combobox Multi-Select

**Decision**: Use a shadcn/ui Combobox-style multi-select for skill picking. Group skills by category in the dropdown. Show selected skills as removable tags/badges.

**Rationale**: With ~65 skills, a flat list is overwhelming. Grouping by category (9 groups) and providing type-ahead search makes selection fast. The shadcn/ui Popover + Command pattern (combobox) handles this well — it's already the recommended approach in shadcn docs for searchable selects.

**Components needed**: `Popover`, `Command` (shadcn command component uses cmdk). The `Popover` is already installed. `Command` needs to be added via `npx shadcn@latest add command`.

**Alternatives considered**:
- Plain multi-select dropdown: No search/filter, slow for 65 items.
- Text input with autocomplete: Harder to browse by category.
- Checkbox list: Takes too much vertical space.

## R4. Enhanced Category Cards — Target vs Actual

**Decision**: Show a visual bar comparing team average to team target on each category card. The bar fills proportionally (0–5 scale), with a target marker.

**Rationale**: The current cards show team average as a number with a colored progress bar, but there's no target comparison. The spec (FR-020) requires showing progress toward target. A dual-bar or bar-with-marker pattern clearly communicates "where we are vs where we should be."

**Challenge**: The current `TeamCategoryAggregateResponse` does NOT include a team target — it only has `teamAvgRank`, `minRank`, `maxRank`. We need to compute a team-level target from the per-role targets in `targets.json`, averaged across the team's role distribution.

**Decision for team target**: Compute a weighted team target per category: average of each member's role target. This gives a realistic "where the team should be" considering the mix of roles.

## R5. Per-Skill Scores in Team Aggregate

**Decision**: Extend `computeTeamAggregate()` in `server/lib/aggregates.ts` to include `skillRatings` per member and `categoryTargets` at the team level.

**Data shape extension**:
- `TeamMemberAggregateResponse` gains: `skillRatings: Record<string, number>` (skill ID → rating, only for submitted ratings, excludes N/A/-2)
- `TeamAggregateResponse` gains: `categoryTargets: Record<string, number>` (category ID → weighted team target)

**Computation for category targets**:
1. For each category, for each submitted member, look up their role's target from `targets.json`
2. Average those targets = team target for that category
3. This accounts for role distribution (e.g. more developers → targets skew toward developer expectations)

# Tasks: Dashboard Redesign & Expert Finder

**Input**: Design documents from `/specs/004-dashboard-redesign/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api.md, research.md

**Tests**: Not requested — manual browser testing per constitution.

**Organization**: Tasks grouped by user story (P1–P3) for independent implementation.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US3 mapping to spec user stories

## Path Conventions

- Frontend: `src/` at repository root
- Backend: `server/` at repository root
- UI components: `src/components/ui/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, add shadcn components, extend shared types

- [x] T001 Add shadcn/ui command component via CLI: `npx shadcn@latest add command` in src/components/ui/
- [x] T002 [P] Extend TeamMemberAggregateResponse in src/lib/types.ts: add `skillRatings: Record<string, number>` and `topStrengths: { categoryId: string; avg: number }[]`
- [x] T003 [P] Extend TeamAggregateResponse in src/lib/types.ts: add `categoryTargets: Record<string, number>`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend API extension that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Extend `computeTeamAggregate()` in server/lib/aggregates.ts: for each submitted member, include `skillRatings` (skill ID → rating, excluding N/A/-2 and unrated) from their evaluation data
- [x] T005 [P] Add `topStrengths` computation in server/lib/aggregates.ts: for each member, compute top 3 highest-rated categories sorted descending by average
- [x] T006 [P] Add `categoryTargets` computation in server/lib/aggregates.ts: for each category, compute weighted average of role targets across all submitted members (load from server/data/targets.json)

**Checkpoint**: `GET /api/aggregates` returns extended response with skillRatings, topStrengths, categoryTargets

---

## Phase 3: User Story 1 — Expert Finder: Search by Skill (Priority: P1)

**Goal**: Users can search for who's best at specific skill combinations using a multi-select skill picker with ranked results

**Independent Test**: Open `/dashboard` → scroll to Expert Finder section → select "Java" → see ranked members → add "SQL" → ranking updates → verify empty state with unrated skill

### Implementation for User Story 1

- [x] T007 [US1] Create expert-finder ranking logic in src/lib/expert-finder.ts: `rankMembersBySkills(members: TeamMemberAggregateResponse[], selectedSkillIds: string[]): ExpertResult[]` — compute average score per member across selected skills, exclude unrated (null), sort by average descending then matchCount descending (FR-002, FR-004)
- [x] T008 [US1] Create ExpertResult type in src/lib/types.ts (or expert-finder.ts): slug, name, role, team, averageScore, skillScores Record<string, number | null>, matchCount, totalSelected
- [x] T009 [US1] Build Expert Finder component in src/components/dashboard/expert-finder.tsx: skill picker (shadcn Command in Popover, grouped by category with type-ahead search), selected skills as removable Badge tags, category filter dropdown (FR-001, FR-005)
- [x] T010 [US1] Add results display to expert-finder.tsx: ranked member list with name, role, per-skill score columns, match count badge "3/4 compétences évaluées", visual score indicators (FR-003, FR-006)
- [x] T011 [US1] Add empty states to expert-finder.tsx: "Sélectionnez des compétences" when no skills selected; "Aucun membre n'a encore évalué ces compétences" when no results (FR edge case)
- [x] T012 [US1] Integrate Expert Finder into src/pages/dashboard-page.tsx: add as new section below existing sections (temporary — will move to tab in US2), pass teamAggregate.members data

**Checkpoint**: Expert Finder works end-to-end — select skills, see ranked members, empty states handle correctly

---

## Phase 4: User Story 2 — Reorganized Dashboard Layout (Priority: P2)

**Goal**: Replace vertical scroll layout with tabbed navigation: Mon profil / Équipe / Expert Finder

**Independent Test**: Open `/dashboard/yolan-maldonado` → 3 tabs visible → default tab is "Mon profil" → click "Équipe" → team content shows → click "Expert Finder" → search appears → switch back → instant transitions

### Implementation for User Story 2

- [x] T013 [US2] Restructure src/pages/dashboard-page.tsx: wrap content in shadcn `<Tabs>` with 3 `<TabsTrigger>`: "Mon profil", "Équipe", "Expert Finder" (FR-010, FR-011)
- [x] T014 [US2] Implement tab default logic in dashboard-page.tsx: if slug present default to "profil" tab, if no slug default to "equipe" tab; hide "Mon profil" tab when no slug (FR-015)
- [x] T015 [US2] Move PersonalOverview into "Mon profil" TabsContent in dashboard-page.tsx (FR-012)
- [x] T016 [US2] Move TeamOverview, CategorySummaryCards, CategoryDeepDive, SkillsGapTable, TeamMembersGrid into "Équipe" TabsContent in dashboard-page.tsx (FR-013)
- [x] T017 [US2] Move Expert Finder component into "Expert Finder" TabsContent in dashboard-page.tsx (FR-014)
- [x] T018 [US2] Style tab bar: persistent at top of dashboard, responsive sizing, proper spacing with page header

**Checkpoint**: Dashboard has 3 navigable tabs, correct defaults per URL, instant switching, existing content preserved

---

## Phase 5: User Story 3 — Enhanced Data Display (Priority: P3)

**Goal**: Better visual hierarchy in category cards (target comparison), gap table (bar indicators), and member grid (strengths)

**Independent Test**: Open `/dashboard` → Équipe tab → category cards show dual bar (actual vs target) → gap table has visual severity bars → member grid shows top strengths alongside gaps

### Implementation for User Story 3

- [x] T019 [US3] Refactor src/components/dashboard/category-summary-cards.tsx: add target marker/line on progress bar, accept `categoryTargets` prop, show "Objectif: X.X" label alongside team average (FR-020)
- [x] T020 [US3] Pass `categoryTargets` from dashboard-page.tsx to CategorySummaryCards component
- [x] T021 [US3] Refactor src/components/dashboard/skills-gap-table.tsx: add inline visual bar (width proportional to gap severity 0–5 scale) next to existing severity badge, color-coded (red ≥2, amber ≥1, green <1) (FR-021)
- [x] T022 [US3] Refactor src/components/dashboard/team-members-grid.tsx: show `topStrengths` (top 3 highest categories) as green badges alongside existing red gap badges (FR-022)
- [x] T023 [US3] Verify all new visual elements adapt to light/dark theme via shadcn CSS tokens (FR-023)

**Checkpoint**: Category cards show target comparison, gap table has visual bars, member cards show strengths — all in both themes

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, performance, cleanup

- [x] T024 [P] Keyboard navigation audit: verify tab order through tab bar, Expert Finder combobox, results list — ensure focus states visible and ARIA attributes correct
- [x] T025 [P] Theme audit: toggle light/dark on all 3 tabs — verify all new components use shadcn tokens, no hardcoded colors
- [x] T026 Performance check: verify <2s dashboard load, <500ms Expert Finder results with 12 members × 65 skills
- [x] T027 Clean up: remove temporary Expert Finder section placement (from T012 before tab restructuring), remove any dead code from refactored components
- [ ] T028 Run quickstart.md 10-point verification checklist end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (types extended)
- **Phase 3 (US1 Expert Finder)**: Depends on Phase 2 (API returns skillRatings)
- **Phase 4 (US2 Layout)**: Depends on Phase 2 (API returns categoryTargets) — can start in parallel with US1
- **Phase 5 (US3 Display)**: Depends on Phase 2 (API returns categoryTargets + topStrengths) — can start in parallel with US1/US2
- **Phase 6 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1 Expert Finder)**: Foundation only — no story dependencies
- **US2 (P2 Layout)**: Independent — moves existing components into tabs + Expert Finder from US1
- **US3 (P3 Display)**: Independent — modifies existing components with new API data

### Parallel Opportunities

- Phase 1: T002 and T003 can run in parallel with T001
- Phase 2: T004, T005, T006 can all run in parallel (different computations, same file but independent functions)
- Phase 3–5: US1, US2, US3 can start in parallel after Phase 2 (different files)
- Phase 6: T024 and T025 can run in parallel

---

## Parallel Example: Phase 2

```bash
# All foundational tasks in parallel (independent computations):
Task: "Add skillRatings to computeTeamAggregate in server/lib/aggregates.ts"
Task: "Add topStrengths to computeTeamAggregate in server/lib/aggregates.ts"
Task: "Add categoryTargets to computeTeamAggregate in server/lib/aggregates.ts"
```

## Parallel Example: User Stories

```bash
# After Phase 2, these stories can run in parallel:
Agent A: "US1 — Expert Finder (T007–T012)"
Agent B: "US2 — Tab layout (T013–T018)"
Agent C: "US3 — Enhanced display (T019–T023)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (~2 min)
2. Complete Phase 2: Extend aggregate API
3. Complete Phase 3: Expert Finder
4. **STOP and VALIDATE**: Users can search for skill experts
5. Continue to US2 (tabs) for better navigation

### Incremental Delivery

1. Setup + Foundational → Extended API ready
2. US1 (Expert Finder) → "Who's the best at X?" works → **MVP!**
3. US2 (Tab Layout) → Dashboard is organized and navigable
4. US3 (Enhanced Display) → Data is clearer and more actionable
5. Polish → Accessibility + performance audit

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps to spec user stories for traceability
- Each user story is independently testable at its checkpoint
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- Expert Finder is initially added as a section (T012), then moved to tab (T017) — T027 cleans up

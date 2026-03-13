# Tasks: Skill Radar v2

**Input**: Design documents from `/specs/003-skill-radar-v2/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api.md, research.md

**Tests**: Not requested — manual browser testing per constitution.

**Organization**: Tasks grouped by user story (P1–P5) for independent implementation.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5 mapping to spec user stories

## Path Conventions

- Frontend: `src/` at repository root
- Backend: `server/` at repository root
- UI components: `src/components/ui/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies, add shadcn components, create config files

- [x] T001 Install new npm dependencies: `react-hook-form`, `zod`, `@hookform/resolvers`, `next-themes`, `recharts-to-png`
- [x] T002 Add shadcn/ui components via CLI: `form`, `select`, `radio-group`, `popover`, `dialog`, `separator`, `progress`, `tabs` in src/components/ui/
- [x] T003 [P] Create target scores config file at server/data/targets.json with target ranks per role × category (see data-model.md Target entity)
- [x] T004 [P] Create shared TypeScript types for API responses in src/lib/types.ts (Category, Skill, Member, Rating, Aggregate shapes from contracts/api.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: API endpoints and schemas that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create GET /api/categories endpoint serving skill catalog in server/routes/categories.ts (import from src/data/skill-catalog.ts, reshape to contract format)
- [x] T006 [P] Create GET /api/members endpoint serving team roster in server/routes/members.ts (import from src/data/team-roster.ts)
- [x] T007 [P] Add POST /api/ratings/:slug/submit endpoint in server/routes/ratings.ts (set submittedAt timestamp, validate ratings exist)
- [x] T008 [P] Replace hardcoded VALID_SLUGS in server/routes/ratings.ts with dynamic lookup from team-roster.ts data
- [x] T009 [P] Create Zod validation schemas in src/lib/schemas.ts: SkillFormSchema using z.record() for ratings (0–5), experience (0–4), skippedCategories (string[])
- [x] T010 Register new routes (categories, members, aggregates) in server/index.ts

**Checkpoint**: All API endpoints available, Zod schemas ready, targets.json in place

---

## Phase 3: User Story 1 — Self-Evaluate via Wizard (Priority: P1) 🎯 MVP

**Goal**: A member completes the full ~65-skill evaluation through a multi-step wizard with autosave, validation, review, and submit

**Independent Test**: Open `/form/yolan-maldonado` → rate skills across 9 steps → verify autosave in server/data/ratings.json → reload and resume → Review & Confirm → Submit → verify submittedAt is set

### Implementation for User Story 1

- [x] T011 [US1] Create useSkillForm hook in src/hooks/use-skill-form.ts: single useForm() with zodResolver(SkillFormSchema), default values loaded from GET /api/ratings/:slug
- [x] T012 [US1] Create useAutosave hook in src/hooks/use-autosave.ts: useWatch + 800ms debounce → PUT /api/ratings/:slug on change
- [x] T013 [US1] Refactor src/components/form/skill-form-wizard.tsx to use React Hook Form: wrap in shadcn <Form>, manage step state (done/active/locked), single form across all steps
- [x] T014 [US1] Refactor src/components/form/category-step.tsx to use <FormField> for each skill, with <FormControl> wrapping the rating selector
- [x] T015 [US1] Refactor src/components/form/skill-rating-row.tsx to work with FormControl: receive field from useController, add N/A button (sets value to -2), add data-skill attribute for scroll targeting
- [x] T016 [US1] Update src/components/form/rating-legend.tsx to show calibrated descriptors via shadcn Popover or Tooltip per skill (FR-003)
- [x] T017 [US1] Implement step validation in skill-form-wizard.tsx: form.trigger(fieldsInCurrentStep) before unlocking next step (FR-004)
- [x] T018 [US1] Implement scroll-to-error: on validation failure, find first errored field via form.formState.errors, scrollIntoView with smooth behavior (FR-009, FR-032)
- [x] T019 [US1] Build Review & Confirm step component in src/components/form/review-step.tsx: summary table per category with avg score and "Modifier" links back to each step (FR-008)
- [x] T020 [US1] Implement submit flow in src/pages/form-page.tsx: on final submit, POST /api/ratings/:slug/submit, show success confirmation
- [x] T021 [US1] Implement re-evaluation: when wizard opens with existing submittedAt, pre-fill form with saved ratings, reset submittedAt to null on edit (FR-010b)
- [x] T022 [US1] Update src/components/form/progress-bar.tsx to reflect step states (done/active/locked) with visual indicators and step navigation

**Checkpoint**: Full wizard flow works end-to-end — rate, autosave, reload resume, validate, review, submit

---

## Phase 4: User Story 2 — Individual Radar Dashboard (Priority: P2)

**Goal**: A submitted member sees their radar chart (9 axes, 0–5 scale) with team-average overlay, rich tooltips, and theme-adaptive colors

**Independent Test**: After submitting ratings, open `/dashboard/yolan-maldonado` → radar chart visible with 9 axes → toggle team overlay → hover for tooltips → switch theme → colors update

### Implementation for User Story 2

- [x] T023 [US2] Create aggregate computation module in server/lib/aggregates.ts: compute per-member category averages, team averages, gaps vs targets (algorithm from research.md R4)
- [x] T024 [US2] Create GET /api/aggregates/:slug endpoint in server/routes/aggregates.ts returning member dashboard data per contracts/api.md
- [x] T025 [US2] [P] Register aggregates router in server/index.ts
- [x] T026 [US2] Refactor src/components/radar-chart.tsx: accept aggregate data, render RadarChart with 9 axes on 0–5 scale, use shadcn color tokens (--chart-1 through --chart-9)
- [x] T027 [US2] Add team-average overlay toggle to radar-chart.tsx: second Radar series togglable via legend click (FR-012)
- [x] T028 [US2] Add rich tooltips to radar-chart.tsx: on axis hover, show member score + team average with labels (FR-013)
- [x] T029 [US2] Refactor src/components/dashboard/personal-overview.tsx to fetch from /api/aggregates/:slug and pass data to radar-chart
- [x] T030 [US2] Implement empty state in personal-overview.tsx: "Aucune évaluation soumise" with link to /form/:slug when no ratings exist
- [x] T031 [US2] Implement draft state in personal-overview.tsx: show partial radar with "Brouillon" badge when submittedAt is null but ratings exist

**Checkpoint**: Individual dashboard shows accurate radar with overlay, tooltips, empty/draft states

---

## Phase 5: User Story 3 — Team Overview & Gap Analysis (Priority: P3)

**Goal**: Team dashboard shows member grid, category aggregates, gap analysis with top-3 gaps per member, and category filtering

**Independent Test**: With 2+ members submitted, open `/dashboard` → see member grid → category summaries → gap table with severity indicators → filter by category

### Implementation for User Story 3

- [x] T032 [US3] Create GET /api/aggregates endpoint (team-level) in server/routes/aggregates.ts returning team overview data per contracts/api.md
- [x] T033 [US3] Refactor src/components/dashboard/team-members-grid.tsx: fetch from /api/aggregates, render member cards with name, role, mini score summary
- [x] T034 [US3] Refactor src/components/dashboard/category-summary-cards.tsx: show team-average per category with min/max distribution indicators
- [x] T035 [US3] Refactor src/components/dashboard/skills-gap-table.tsx: compute gap (target − actual), display top 3 gaps per member with severity badges (FR-018, FR-019)
- [x] T036 [US3] Refactor src/components/dashboard/team-overview.tsx: compose member grid + category summaries + gap table into team view
- [x] T037 [US3] Add category filter to src/pages/dashboard-page.tsx: shadcn Select to filter team view by category (FR-020)
- [x] T038 [US3] Implement gap list export: "Exporter" button on gap table to copy top gaps as CSV to clipboard or download

**Checkpoint**: Team dashboard shows aggregated data, gap analysis, filters — all from real member ratings

---

## Phase 6: User Story 4 — Premium Theme Switching (Priority: P4)

**Goal**: Replace custom theme hook with next-themes, add FOUC-prevention script, build premium animated Sun↔Moon toggle

**Independent Test**: Toggle light/dark/system → instant application → reload → persisted → zero flash → all UI elements (charts, forms, cards) adapt

### Implementation for User Story 4

- [x] T039 [US4] Create ThemeProvider wrapper in src/providers/theme-provider.tsx: configure next-themes with attribute="class", defaultTheme="system", enableSystem, disableTransitionOnChange
- [x] T040 [US4] Add FOUC-prevention inline script to index.html <head>: read localStorage theme, apply .dark class before React mounts (see research.md R1)
- [x] T041 [US4] Update src/App.tsx: wrap app in ThemeProvider, remove old theme initialization
- [x] T042 [US4] Delete src/hooks/use-theme.ts and migrate all consumers to next-themes useTheme hook
- [x] T043 [US4] Rebuild src/components/theme-toggle.tsx: icon-only button with animated Sun↔Moon (micro-rotation + fade + scale, 200–350ms ease-out transition, kibo-ui inspiration)
- [x] T044 [US4] Verify all shadcn components and Recharts charts adapt to theme via CSS variable tokens — fix any hardcoded colors

**Checkpoint**: Theme switch is instant, persisted, zero-FOUC, with premium animation — all UI adapts

---

## Phase 7: User Story 5 — Export Radar Charts (Priority: P5)

**Goal**: Users can export the radar chart as PNG or SVG from the dashboard

**Independent Test**: Open dashboard with radar chart → click "Export PNG" → PNG downloads → click "Export SVG" → SVG downloads → both include active overlays and current theme

### Implementation for User Story 5

- [x] T045 [US5] Add PNG export button to radar-chart.tsx using recharts-to-png useCurrentPng hook — wrap chart in fixed-dimension container for export (800×600)
- [x] T046 [US5] Add SVG export button to radar-chart.tsx: serialize SVG element via XMLSerializer, trigger download as .svg file
- [x] T047 [US5] Ensure exports capture current theme colors (resolve CSS variables) and active overlay series

**Checkpoint**: Both PNG and SVG exports produce accurate chart images matching on-screen display

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, performance, cleanup

- [x] T048 [P] WCAG AA contrast audit: verify all interactive elements in both light and dark themes using browser dev tools or axe
- [x] T049 [P] Keyboard navigation audit: verify tab order through wizard form, dashboard controls, theme toggle — ensure focus states visible, ARIA attributes correct (FR-029–FR-032)
- [x] T050 Performance check: verify 60 FPS during chart interactions, <2s dashboard load, smooth wizard transitions
- [x] T051 Clean up dead code: remove unused v1 imports, patterns, and components superseded by v2 refactors
- [x] T052 Run quickstart.md 10-point verification checklist end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (deps installed)
- **Phase 3 (US1 Wizard)**: Depends on Phase 2 (API + schemas)
- **Phase 4 (US2 Radar)**: Depends on Phase 2 (API) + requires at least one submitted rating
- **Phase 5 (US3 Team)**: Depends on Phase 2 (API) + requires 2+ submitted ratings
- **Phase 6 (US4 Theme)**: Can start after Phase 1 — independent of other stories
- **Phase 7 (US5 Export)**: Depends on Phase 4 (radar chart must exist)
- **Phase 8 (Polish)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1 Wizard)**: Foundation only — no story dependencies. **MVP**
- **US2 (P2 Individual Radar)**: Foundation only — needs submitted data (from US1 or seed data)
- **US3 (P3 Team Overview)**: Foundation only — needs submitted data from 2+ members
- **US4 (P4 Theme)**: Fully independent — can run in parallel with any story
- **US5 (P5 Export)**: Depends on US2 (radar-chart.tsx must be refactored first)

### Parallel Opportunities

- Phase 1: T003 and T004 can run in parallel with T001/T002
- Phase 2: T005, T006, T007, T008, T009 can all run in parallel
- Phase 3–6: US1, US2, US3, US4 can start in parallel after Phase 2
- Phase 7: Must wait for US2 completion

---

## Parallel Example: Phase 2

```bash
# All foundational tasks in parallel (different files):
Task: "Create GET /api/categories in server/routes/categories.ts"
Task: "Create GET /api/members in server/routes/members.ts"
Task: "Add POST submit endpoint in server/routes/ratings.ts"
Task: "Replace VALID_SLUGS in server/routes/ratings.ts"
Task: "Create Zod schemas in src/lib/schemas.ts"
```

## Parallel Example: User Stories

```bash
# After Phase 2, these stories can run in parallel:
Agent A: "US1 — Wizard form (T011–T022)"
Agent B: "US2 — Individual radar (T023–T031)"
Agent C: "US4 — Theme switching (T039–T044)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (~5 min)
2. Complete Phase 2: Foundational API endpoints
3. Complete Phase 3: User Story 1 (Wizard)
4. **STOP and VALIDATE**: One member can fully self-evaluate
5. Seed 2+ members with ratings for next stories

### Incremental Delivery

1. Setup + Foundational → API ready
2. US1 (Wizard) → Members can self-evaluate → **MVP!**
3. US2 (Individual Radar) → Members see their skill profile
4. US3 (Team Overview) → Managers see team intelligence
5. US4 (Theme) → Premium visual polish
6. US5 (Export) → Chart sharing for reports
7. Polish → Accessibility + performance audit

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps to spec user stories for traceability
- Each user story is independently testable at its checkpoint
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- Existing v1 code is refactored in-place — no separate directories

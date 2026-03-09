# Tasks: Team Skill Radar

**Input**: Design documents from `/specs/001-team-skill-radar/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api.md, research.md, quickstart.md, skill-descriptors.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize Vite + React + TypeScript project with all dependencies

- [x] T001 Scaffold Vite project with React + TypeScript template and configure `tsconfig.json`
- [x] T002 Install dependencies: react-router-dom, recharts, express, cors, @types/express, @types/cors, concurrently, tsx
- [x] T003 Install and configure Tailwind CSS 4 in `src/styles/globals.css` with shadcn/ui CSS variables (light + dark tokens)
- [x] T004 Initialize shadcn/ui and generate base components (Button, Card, Tooltip, Table, Badge) in `src/components/ui/`
- [x] T005 [P] Configure ESLint (`eslint.config.js`) and Prettier (`.prettierrc`)
- [x] T006 [P] Create project directory structure matching plan.md: `server/`, `server/routes/`, `server/data/`, `src/data/`, `src/lib/`, `src/hooks/`, `src/components/form/`, `src/components/dashboard/`, `src/pages/`
- [x] T007 Configure `vite.config.ts` with API proxy (`/api` → `http://localhost:3001`) and dev server settings
- [x] T008 Configure `package.json` scripts: `dev` (concurrently Vite + Express via tsx), `build` (Vite build), `start` (Express serving `dist/`)
- [x] T009 Add `server/data/` to `.gitignore` for `ratings.json`

**Checkpoint**: `npm run dev` starts both Vite and Express servers without errors

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Hardcoded data catalogs, API server, routing, and shared utilities that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T010 [P] Create team roster in `src/data/team-roster.ts` — 11 members with slug, name, role, team fields per data-model.md (4 sub-teams: Ingenierie Technique, Developpement, QA & Automatisation, Management)
- [x] T011 [P] Create rating scale in `src/data/rating-scale.ts` — levels 0-5 with labels (Unknown, Awareness, Guided, Autonomous, Advanced, Expert) and descriptions
- [x] T012 [P] Create experience scale in `src/data/experience-scale.ts` — levels 0-4 (Never, <6 months, 6m-2y, 2-5y, 5+ years)
- [x] T013 Create skill catalog in `src/data/skill-catalog.ts` — 9 categories with ~65 skills, each with id, label, categoryId, and 6 anchored level descriptors from `skill-descriptors.md`
- [x] T014 [P] Create calibration prompts in `src/data/calibration-prompts.ts` — 9 scenario prompts (one per category) from `skill-descriptors.md`
- [x] T015 [P] Create `src/lib/utils.ts` with shadcn/ui `cn()` helper (clsx + tailwind-merge)
- [x] T016 Create ratings computation helpers in `src/lib/ratings.ts` — teamAveragePerSkill, categoryAverage, categorySummary (avgStrength, coverage, topSkill, weakestSkill), skillsGapData (teamAvg, countAt3Plus, highestRater, lowestRater, riskColor) per data-model.md derived data formulas
- [x] T017 Create Express server entry point in `server/index.ts` — serve API on port 3001, JSON body parser, cors middleware, serve `dist/` in production, auto-create `server/data/ratings.json` as `{}` if missing
- [x] T018 Create ratings API routes in `server/routes/ratings.ts` — implement 3 endpoints per contracts/api.md: GET /api/ratings (all), GET /api/ratings/:slug (single, 404 if not in roster), PUT /api/ratings/:slug (upsert with validation: slug in roster, ratings is object, values 0-5 integers; handle experience object and skippedCategories array; set submittedAt)
- [x] T019 Create `src/App.tsx` with React Router v7 setup — routes: `/form/:slug` → FormPage, `/dashboard/:slug?` → DashboardPage, catch-all → redirect or 404

**Checkpoint**: Express API responds to curl requests; Vite dev server proxies correctly; `npm run dev` runs both; all data catalogs importable

---

## Phase 3: User Story 1 — Submit Skill Self-Assessment via Personal Link (Priority: P1) MVP

**Goal**: Team members open their personal link, see their name pre-filled, rate ~65 skills across 9 categories via a multi-step wizard with calibration prompts, experience duration, and skip-category option, then submit. Previous ratings pre-fill on revisit.

**Independent Test**: Open `http://localhost:5173/form/yolan-maldonado`, see "Yolan MALDONADO — Architecte Technique Logiciel", rate skills across all 9 steps, submit, reopen and verify pre-fill. Open unknown slug and see error.

### Implementation for User Story 1

- [x] T020 [P] [US1] Create `src/hooks/use-ratings.ts` — custom hook with: fetchRatings(slug) → GET /api/ratings/:slug, submitRatings(slug, data) → PUT /api/ratings/:slug, loading/error states, return ratings + experience + skippedCategories + submittedAt
- [x] T021 [P] [US1] Create rating legend component in `src/components/form/rating-legend.tsx` — always-visible strip showing levels 0-5 with labels and colors from rating-scale.ts, responsive layout
- [x] T022 [P] [US1] Create progress bar component in `src/components/form/progress-bar.tsx` — shows "Step X/9 — {categoryLabel}" with visual progress indicator using shadcn/ui
- [x] T023 [P] [US1] Create skill rating row component in `src/components/form/skill-rating-row.tsx` — row of 6 buttons (? 1 2 3 4 5), selected state highlighted, skill label, tooltip/expandable showing anchored level descriptions for that skill from skill-catalog.ts descriptors
- [x] T024 [P] [US1] Create experience selector component in `src/components/form/experience-selector.tsx` — inline selector per skill showing 5 options (0-4) from experience-scale.ts, compact button group or dropdown
- [x] T025 [P] [US1] Create calibration prompt component in `src/components/form/calibration-prompt.tsx` — displays category-specific scenario text from calibration-prompts.ts in a highlighted card/callout at the top of each step
- [x] T026 [P] [US1] Create skip category button in `src/components/form/skip-category-button.tsx` — button that marks all skills in current category as -2 (skipped), shows confirmation, visually indicates skipped state
- [x] T027 [US1] Create category step component in `src/components/form/category-step.tsx` — composes calibration-prompt + skill-rating-row + experience-selector for each skill in the category, skip-category-button, manages local state for all skills in category
- [x] T028 [US1] Create skill form wizard container in `src/components/form/skill-form-wizard.tsx` — manages 9-step navigation (Next/Back/Submit), aggregates all category states, calls submitRatings on final step, preserves progress between steps, shows rating-legend persistently
- [x] T029 [US1] Create form page in `src/pages/form-page.tsx` — reads `:slug` param, validates against team-roster.ts (show error for unknown slug), displays member name + role, fetches existing ratings for pre-fill via use-ratings hook, renders skill-form-wizard, shows success confirmation after submit

**Checkpoint**: Full form wizard functional — navigate 9 steps, rate skills, set experience, skip categories, submit, reopen with pre-filled data. Unknown slug shows error page.

---

## Phase 4: User Story 2 — View Team & Category Radar Graphs (Priority: P1)

**Goal**: Dashboard displays 6 sections — personal overview radar (9 axes, pinned if personal link), team overview with viewer overlay, 9 category summary cards, 9 category deep-dive radars, sortable skills gap table with risk coloring, team members grid with mini radars.

**Independent Test**: After 2+ members submit via US1, open `http://localhost:5173/dashboard/yolan-maldonado` — see personal radar pinned at top, team overview with overlay, all 6 sections with correct averaged values. Open `/dashboard` without slug — all sections visible, no pinning.

**Dependencies**: Requires US1 to collect data, but can be built in parallel using mock/seed data

### Implementation for User Story 2

- [x] T030 [P] [US2] Create radar chart wrapper in `src/components/radar-chart.tsx` — Recharts RadarChart wrapper accepting data points array, optional overlay dataset, axis labels, responsive sizing, dark/light aware colors, reusable for both overview (9 axes) and deep-dive (per-category skills as axes)
- [x] T031 [P] [US2] Create personal overview radar in `src/components/dashboard/personal-overview.tsx` — 9-axis radar (one axis per category) showing viewer's category averages computed via lib/ratings.ts, rendered only when slug provided
- [x] T032 [P] [US2] Create team overview radar in `src/components/dashboard/team-overview.tsx` — 9-axis radar showing team category averages, with optional viewer's line overlaid when personal dashboard link used
- [x] T033 [P] [US2] Create category summary cards in `src/components/dashboard/category-summary-cards.tsx` — 9 cards using shadcn/ui Card, each showing: category name + emoji, avg strength, coverage count (members with at least one skill >=3), top skill name, weakest skill name, computed via lib/ratings.ts categorySummary
- [x] T034 [P] [US2] Create category deep-dive radars in `src/components/dashboard/category-deep-dive.tsx` — 9 radar charts (one per category), axes = individual skills in that category, shows team average line + optional viewer overlay, uses radar-chart.tsx wrapper
- [x] T035 [P] [US2] Create skills gap table in `src/components/dashboard/skills-gap-table.tsx` — shadcn/ui Table with columns: skill name, category, team avg, count at 3+, highest rater, lowest rater. Sortable by any column. Row color-coding via Badge: red (0-1 at 3+), yellow (2-3 at 3+), green (4+ at 3+). Uses lib/ratings.ts skillsGapData
- [x] T036 [P] [US2] Create member card in `src/components/member-card.tsx` — small card with member name, role, team, mini 9-axis radar chart (or greyed-out placeholder if not submitted), uses radar-chart.tsx in compact mode
- [x] T037 [US2] Create team members grid in `src/components/dashboard/team-members-grid.tsx` — responsive grid of 11 member-card components, greyed-out cards for members who haven't submitted, ordered by sub-team
- [x] T038 [US2] Create dashboard page in `src/pages/dashboard-page.tsx` — reads optional `:slug` param, fetches all ratings via GET /api/ratings, computes all derived data via lib/ratings.ts, renders 6 sections in order: personal overview (if slug), team overview (with overlay if slug), category summary cards, category deep-dives, skills gap table, team members grid. Show empty state message when no data submitted.

**Checkpoint**: Dashboard renders all 6 sections with correct data. Personal link pins viewer's chart. Generic link shows all without pinning. Empty state shown when no data exists.

---

## Phase 5: User Story 3 — Toggle Dark/Light Mode (Priority: P3)

**Goal**: User can switch between dark and light themes. Preference persists via localStorage across page reloads.

**Independent Test**: Click theme toggle — UI switches instantly. Reload page — preference preserved.

### Implementation for User Story 3

- [x] T039 [P] [US3] Create `src/hooks/use-theme.ts` — hook managing `theme` state ("light"|"dark"|"system"), reads/writes localStorage key, applies class to `document.documentElement`, defaults to system preference via `prefers-color-scheme`
- [x] T040 [P] [US3] Create theme toggle component in `src/components/theme-toggle.tsx` — shadcn/ui Button with sun/moon icon, calls use-theme toggle, accessible label
- [x] T041 [US3] Integrate theme toggle into app layout in `src/App.tsx` — add theme toggle button in top-right corner of all pages, initialize theme on app mount via use-theme hook

**Checkpoint**: Theme switches instantly on toggle. Persists across reload. All components (charts, cards, table) render correctly in both modes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, performance, responsive design, final validation

- [x] T042 Create friendly error page component for unknown slugs in `src/pages/form-page.tsx` — styled message with link back to dashboard when slug not in roster
- [x] T043 Add lazy loading for Recharts components in `src/pages/dashboard-page.tsx` using React.lazy + Suspense to improve initial load
- [x] T044 Ensure responsive layout across all pages — form wizard usable on tablet+, dashboard scrollable on all screen sizes, radar charts resize gracefully
- [x] T045 Run full quickstart.md verification checklist — open form link, rate and submit, verify pre-fill, check dashboard sections, test dark/light toggle, restart server and verify persistence

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 Form (Phase 3)**: Depends on Phase 2 — independent of US2/US3
- **US2 Dashboard (Phase 4)**: Depends on Phase 2 — can be built in parallel with US1 (use seed data for testing)
- **US3 Theme (Phase 5)**: Depends on Phase 2 — can be built in parallel with US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1 Form)**: After Phase 2 — no dependency on other stories
- **US2 (P1 Dashboard)**: After Phase 2 — needs submitted data to verify (from US1 or seed), but implementation is independent
- **US3 (P3 Theme)**: After Phase 2 — fully independent, enhances all pages

### Within Each User Story

- Data hooks before UI components
- Atomic components (rating-row, experience-selector) before composite (category-step)
- Composite components before page-level orchestration
- Page component integrates everything last

### Parallel Opportunities

**Phase 2** (after T010-T012 data files):
```
Parallel: T010, T011, T012, T014, T015 (independent data/util files)
Then: T013 (large skill catalog — can parallel with T015-T016)
Then: T016, T017, T018 (depend on data files)
Then: T019 (depends on pages existing)
```

**Phase 3 US1** (all [P] tasks):
```
Parallel: T020, T021, T022, T023, T024, T025, T026 (independent components + hook)
Then: T027 (composes T023, T024, T025, T026)
Then: T028 (composes T027, T021, T022)
Then: T029 (composes T028, T020)
```

**Phase 4 US2** (all [P] tasks):
```
Parallel: T030, T031, T032, T033, T034, T035, T036 (independent components)
Then: T037 (composes T036)
Then: T038 (composes all dashboard components)
```

**Phase 5 US3**:
```
Parallel: T039, T040 (hook + toggle component)
Then: T041 (integrates into App)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (~30 min)
2. Complete Phase 2: Foundational — data catalogs + API + routing
3. Complete Phase 3: US1 Form Wizard
4. **STOP and VALIDATE**: Submit ratings via form, verify API persistence, verify pre-fill
5. Demo-ready with data collection working

### Incremental Delivery

1. Setup + Foundational → Project skeleton running
2. US1 Form → Collect real team ratings (deploy to local network)
3. US2 Dashboard → Visualize collected data with all 6 sections
4. US3 Theme → Polish with dark/light mode
5. Polish → Error handling, performance, responsive design

### Suggested Execution (Solo Developer)

1. Phase 1 + 2: Setup everything (biggest effort: T013 skill catalog with ~390 descriptors)
2. Phase 3 US1: Get data collection working ASAP — send links to team
3. Phase 4 US2: Build dashboard while team fills forms
4. Phase 5 + 6: Final polish

---

## Notes

- T013 (skill catalog) is the largest single task — ~65 skills × 6 level descriptors = ~390 entries from skill-descriptors.md
- API contracts in contracts/api.md need updating to include `experience` and `skippedCategories` fields (data-model.md is authoritative)
- [P] tasks = different files, no dependencies between them
- Commit after each task or logical group of parallel tasks
- Stop at any checkpoint to validate independently

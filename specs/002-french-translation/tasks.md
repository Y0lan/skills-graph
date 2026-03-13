# Tasks: French-Only Translation

**Input**: Design documents from `/specs/002-french-translation/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Not requested — manual browser verification only.

**Organization**: Tasks grouped by user story. US1 (French UI) and US2 (French descriptors) are both P1 and share files, so they are combined into one phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Data Files)

**Purpose**: Translate data files that are dependencies for both form and dashboard components

- [X] T001 Translate rating level names and descriptions to French in `src/data/rating-scale.ts` (Inconnu, Notions, Guidé, Autonome, Avancé, Expert)

**Checkpoint**: Rating legend and dashboard references use French level names

---

## Phase 2: User Stories 1+2 — French UI & Skill Descriptors (Priority: P1)

**Goal**: All form and dashboard text is in French. All ~390 skill descriptors are translated to natural French.

**Independent Test**: Navigate through the form wizard and dashboard — every label, button, message, and skill descriptor is in French (except technical terms).

### Skill Catalog Translation (bulk work — parallelizable by category)

> Each task translates all skill descriptors for one category in `src/data/skill-catalog.ts`. Category labels and skill labels that are product names remain unchanged. Only the 6 descriptor strings per skill are translated.

- [X] T002 [P] [US2] Translate category label + all skill descriptors for "Core Engineering" (7 skills × 6 = 42 strings) in `src/data/skill-catalog.ts`
- [X] T003 [P] [US2] Translate category label + all skill descriptors for "Backend & Integration Services" (8 skills × 6 = 48 strings) in `src/data/skill-catalog.ts`
- [X] T004 [P] [US2] Translate category label + all skill descriptors for "Frontend & UI Engineering" (6 skills × 6 = 36 strings) in `src/data/skill-catalog.ts`
- [X] T005 [P] [US2] Translate category label + all skill descriptors for "Platform Engineering" (7 skills × 6 = 42 strings) in `src/data/skill-catalog.ts`
- [X] T006 [P] [US2] Translate category label + all skill descriptors for "Observability & Reliability" (7 skills × 6 = 42 strings) in `src/data/skill-catalog.ts`
- [X] T007 [P] [US2] Translate category label + all skill descriptors for "Security & Compliance" (7 skills × 6 = 42 strings) in `src/data/skill-catalog.ts`
- [X] T008 [P] [US2] Translate category label + all skill descriptors for "Architecture, Governance & Delivery" (9 skills × 6 = 54 strings) in `src/data/skill-catalog.ts`
- [X] T009 [P] [US2] Translate category label + all skill descriptors for "Soft Skills & Collaboration" (6 skills × 6 = 36 strings) in `src/data/skill-catalog.ts`
- [X] T010 [P] [US2] Review and polish descriptors for "Domain Knowledge (CAFAT / SINAPSE)" (9 skills × 6 = 54 strings, already partially French) in `src/data/skill-catalog.ts`

### Form Components (parallelizable — different files)

- [X] T011 [P] [US1] Translate legend instruction text in `src/components/form/rating-legend.tsx`
- [X] T012 [P] [US1] Translate "Step X/Y" and percentage label in `src/components/form/progress-bar.tsx`
- [X] T013 [P] [US1] Translate "Before you rate:" label in `src/components/form/calibration-prompt.tsx`
- [X] T014 [P] [US1] Translate skipped category message in `src/components/form/category-step.tsx`
- [X] T015 [P] [US1] Translate button labels (Back, Next, Submit, Submitting...) in `src/components/form/skill-form-wizard.tsx`
- [X] T016 [P] [US1] Translate skip/undo labels and confirmation text in `src/components/form/skip-category-button.tsx`

### Dashboard Components (parallelizable — different files)

- [X] T017 [P] [US1] Translate card labels (Avg strength, Coverage, Top skill, Weakest) in `src/components/dashboard/category-summary-cards.tsx`
- [X] T018 [P] [US1] Translate table headers (Skill, Category, Team Avg, At 3+, Highest, Lowest, Risk) and risk badge labels (High Risk, Medium, Covered) in `src/components/dashboard/skills-gap-table.tsx`
- [X] T019 [P] [US1] Translate section title "Team Members" in `src/components/dashboard/team-members-grid.tsx`
- [X] T020 [P] [US1] Translate section title "Team Overview" in `src/components/dashboard/team-overview.tsx`
- [X] T021 [P] [US1] Translate section title "Your Overview — {name}" in `src/components/dashboard/personal-overview.tsx`
- [X] T022 [P] [US1] Translate radar legend names ("Team Average" → "Moyenne équipe", "You" → "Vous") in `src/components/radar-chart.tsx`

### Page-Level Components (parallelizable — different files)

- [X] T023 [P] [US1] Translate all messages in `src/pages/form-page.tsx`: "Member not found", "Loading your ratings...", "Ratings submitted!", thank-you message, "View your dashboard", "Edit ratings", "Go to Dashboard", "Error", "Last submitted:"
- [X] T024 [P] [US1] Translate all messages in `src/pages/dashboard-page.tsx`: "Team Skill Radar" → "Radar des Compétences", "Viewing as:", "Loading dashboard...", "No data yet", empty state message, "Loading charts..."
- [X] T025 [P] [US1] Translate loading fallback "Loading..." in `src/App.tsx`
- [X] T026 [P] [US1] Translate aria-labels ("Switch to light mode" / "Switch to dark mode") in `src/components/theme-toggle.tsx`

**Checkpoint**: All form and dashboard UI is fully in French. Skill descriptors read naturally.

---

## Phase 3: User Story 3 — French Calibration Prompts (Priority: P2)

**Goal**: All 9 calibration prompts are translated to French.

**Independent Test**: Navigate through each category step in the form wizard and verify each calibration prompt is in French.

- [X] T027 [US3] Translate all 9 calibration prompt paragraphs to French in `src/data/calibration-prompts.ts` (preserve technical terms like GitLab CI, AG Grid, Keycloak, etc.)

**Checkpoint**: All calibration prompts display in French.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Date formatting, final verification, cleanup

- [X] T028 Switch date display to French locale (`toLocaleString('fr-FR')`) in `src/pages/form-page.tsx`
- [X] T029 Run `npx tsc -b && npx eslint src/ && npx vite build` to verify no build errors
- [ ] T030 Manual browser walkthrough: navigate every form step and dashboard view, confirm zero English strings remain (excluding technical terms)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1+US2)**: T011 (rating-legend) depends on T001 (rating-scale) for consistent level names. All other Phase 2 tasks can start in parallel with Phase 1.
- **Phase 3 (US3)**: Independent — can run in parallel with Phase 2
- **Phase 4 (Polish)**: Depends on all previous phases

### Parallel Opportunities

**Maximum parallelism within Phase 2:**
- All 9 skill catalog tasks (T002-T010) can run in parallel — each touches a different category section
- All 6 form component tasks (T011-T016) can run in parallel — different files
- All 6 dashboard component tasks (T017-T022) can run in parallel — different files
- All 4 page-level tasks (T023-T026) can run in parallel — different files

**Cross-phase parallelism:**
- Phase 3 (T027) can run in parallel with Phase 2

### Within Skill Catalog (T002-T010)

These all edit the same file (`skill-catalog.ts`) but different sections. If using parallel agents, each agent must edit only its assigned category section to avoid conflicts. Sequential execution is safer but slower.

---

## Parallel Example: Phase 2

```bash
# Launch all form component translations together:
Task: "Translate legend instruction text in src/components/form/rating-legend.tsx"
Task: "Translate Step X/Y label in src/components/form/progress-bar.tsx"
Task: "Translate Before you rate label in src/components/form/calibration-prompt.tsx"
Task: "Translate skipped message in src/components/form/category-step.tsx"
Task: "Translate button labels in src/components/form/skill-form-wizard.tsx"
Task: "Translate skip/undo labels in src/components/form/skip-category-button.tsx"

# Launch all dashboard component translations together:
Task: "Translate card labels in src/components/dashboard/category-summary-cards.tsx"
Task: "Translate table headers in src/components/dashboard/skills-gap-table.tsx"
Task: "Translate Team Members title in src/components/dashboard/team-members-grid.tsx"
Task: "Translate Team Overview title in src/components/dashboard/team-overview.tsx"
Task: "Translate Your Overview title in src/components/dashboard/personal-overview.tsx"
Task: "Translate radar legend names in src/components/radar-chart.tsx"
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2)

1. Complete T001 (rating-scale.ts) — 5 minutes
2. Complete T002-T010 (skill-catalog.ts) — bulk of work, ~390 strings
3. Complete T011-T026 (all UI components) — ~50 strings
4. **STOP and VALIDATE**: Browse form + dashboard, verify French throughout
5. If good → proceed to Phase 3

### Recommended Execution

Given this is a single-developer project:
1. T001 first (foundational)
2. T002-T010 sequentially (same file, avoids merge conflicts)
3. T011-T026 in parallel batches by file group (form, dashboard, pages)
4. T027 (calibration prompts)
5. T028-T030 (polish + verify)

---

## Notes

- All tasks are string replacements — no logic changes
- Technical terms (Java, Docker, Kubernetes, OAuth2, etc.) stay in English
- Skill labels that are product names stay unchanged
- Category emojis stay unchanged
- API keys and JSON field names stay in English
- The domain knowledge category is already partially in French — T010 is review/polish only
- Commit after each phase for clean git history

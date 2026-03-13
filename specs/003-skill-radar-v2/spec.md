# Feature Specification: Skill Radar v2

**Feature Branch**: `003-skill-radar-v2`
**Created**: 2026-03-10
**Status**: Draft
**Input**: Complete team skill radar application — self-evaluation wizard, individual & team dashboard with radar charts, gap analysis, premium theming, and backend data services.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Self-Evaluate Skills via Wizard (Priority: P1)

A team member opens their personal evaluation page. They are guided through a multi-step wizard organized by skill category (9 categories, ~65 skills total). For each skill, a row displays the skill name and 6 descriptive levels — Inconnu (0), Débutant (1), Intermédiaire (2), Avancé (3), Confirmé (4), Expert (5) — with calibrated descriptions available via contextual help (tooltip or expandable text). The member selects the level that best describes their current ability.

Progress is saved automatically as the member works (debounced autosave). If they close or reload the browser, they resume exactly where they left off. Each step is validated before the next unlocks. After completing all categories, a "Review & Confirm" screen presents a summary table with per-category scores and direct links to edit any category. On final submission, ratings are persisted.

**Why this priority**: Self-evaluation is the sole data-entry mechanism. Without it, no dashboard, radar, or gap analysis can exist. This is the foundational user journey.

**Independent Test**: A single member can complete the entire wizard end-to-end, save, reload, resume, review, and submit — producing a full set of ratings stored on the server.

**Acceptance Scenarios**:

1. **Given** a member opens `/rate/:memberId` for the first time, **When** they view the wizard, **Then** they see step 1 (first category) with all its skills, each defaulting to unrated, and remaining steps appear locked.
2. **Given** a member rates all skills in the current step, **When** they click "Next", **Then** the step is marked done, the next step unlocks and becomes active.
3. **Given** a member has partially completed the wizard, **When** they close the browser and reopen the same URL, **Then** they resume at the last incomplete step with all prior ratings preserved.
4. **Given** a member reaches the "Review & Confirm" step, **When** they view the summary, **Then** they see a table of all 9 categories with average score per category and can click any category to jump back and edit.
5. **Given** a member clicks "Submit" on the review step, **When** all required skills are rated, **Then** all ratings are saved to the server and the member receives a success confirmation.
6. **Given** a member has not rated all required skills in a step, **When** they try to advance, **Then** they see inline error messages on missing fields and the form scrolls to the first error.

---

### User Story 2 — View Individual Radar Dashboard (Priority: P2)

A team member (or their manager) opens the dashboard at `/dashboard/:memberId`. The centerpiece is a radar chart with 9 axes — one per skill category — displaying the member's average score per category (scale 0–5). The member's profile can be overlaid with the team average to instantly visualize strengths and gaps. The legend allows toggling individual series on/off. Tooltips on each axis show the exact score. The chart colors automatically adapt to the current theme (light or dark).

**Why this priority**: The radar visualization is the core value proposition — it transforms raw ratings into an immediately readable skill profile. Without it, the assessment data has no visual output.

**Independent Test**: After at least one member has submitted ratings, opening their dashboard displays a radar chart with correct per-category averages and a functioning team-average overlay.

**Acceptance Scenarios**:

1. **Given** a member has submitted their ratings, **When** they open `/dashboard/:memberId`, **Then** a radar chart with 9 labeled axes displays their per-category average scores.
2. **Given** the dashboard is open, **When** the user enables "Team average" overlay, **Then** a second series appears on the radar showing the team's mean score per category.
3. **Given** the dashboard is open, **When** the user hovers over a chart axis, **Then** a tooltip displays the exact numerical score (member and team, if overlay is active).
4. **Given** the dashboard is in light mode, **When** the user switches to dark mode, **Then** chart colors, backgrounds, and labels update seamlessly without a page reload.

---

### User Story 3 — View Team Overview & Gap Analysis (Priority: P3)

A manager (or any team member) views the team-level dashboard showing aggregated insights: a grid of all team members (cards or chips) with mini skill summaries, category-level aggregates (team averages, score distributions), and a gap/risk analysis. The gap analysis computes the difference between a member's score and the expected target for their role, weighted by category importance. The top 3 gaps are highlighted with clear "upskilling" call-to-action (linking to internal resources or exportable as a list).

**Why this priority**: Team-level visibility and gap identification are the primary management use case. This story turns individual data into actionable team intelligence.

**Independent Test**: With at least 2 members evaluated, the team dashboard displays the member grid, aggregated category scores, and the gap analysis correctly identifies skills below target.

**Acceptance Scenarios**:

1. **Given** multiple members have submitted ratings, **When** a user opens the team dashboard, **Then** they see a grid of member cards each showing the member's name, role, and a mini radar or score summary.
2. **Given** the team dashboard is open, **When** the user views the category summary, **Then** they see team-average scores per category and a visual distribution (e.g., bar or heatmap).
3. **Given** target scores are defined per role and category, **When** the gap analysis runs for a member, **Then** gaps (target minus actual) are calculated and the top 3 are surfaced with severity indicators.
4. **Given** a gap is displayed, **When** the user clicks "plan d'upskilling", **Then** they see a detail view or can export the gap list.
5. **Given** the team dashboard is open, **When** the user filters by category, **Then** only members and metrics for that category are shown.

---

### User Story 4 — Premium Theme Switching (Priority: P4)

Any user can switch between three theme modes: light, dark, and system-detected. The toggle is a compact icon-only button (sun/moon) with a polished micro-animation (rotation, fade, scale). Theme preference is persisted locally. On page load, the correct theme applies instantly with zero flash of unstyled or wrong-themed content. All UI elements — including charts, tooltips, form fields, and cards — adapt automatically to the selected theme.

**Why this priority**: Theme support is a constitutional requirement (Principle III) and directly impacts perceived quality. It must work flawlessly but depends on base UI being built first.

**Independent Test**: Toggle between light, dark, and system modes — verify instant application, persistence after reload, zero flash, and that charts/forms render correctly in each mode.

**Acceptance Scenarios**:

1. **Given** the app loads for the first time, **When** the user's OS is in dark mode, **Then** the app renders in dark mode without any flash of light content.
2. **Given** the user clicks the theme toggle, **When** the icon animates from sun to moon (or reverse), **Then** the entire UI transitions within 200–350 ms with no visual artifacts.
3. **Given** the user selects dark mode, **When** they close and reopen the app, **Then** dark mode is immediately applied on load.
4. **Given** any theme is active, **When** viewing the radar chart, **Then** chart colors, grid lines, labels, and tooltips are legible and aesthetically consistent with the active theme.

---

### User Story 5 — Export Radar Charts (Priority: P5)

A user viewing a radar chart (individual or team overlay) can export it as an image file (PNG or SVG) for use in presentations, reports, or sharing. The export captures the chart in its current state (including active overlays and theme).

**Why this priority**: Export is a convenience feature requested for management reporting. It adds value but is not critical for core assessment and visualization workflows.

**Independent Test**: Open a dashboard with a radar chart, click export, and verify a correctly rendered image file is downloaded.

**Acceptance Scenarios**:

1. **Given** a radar chart is displayed, **When** the user clicks "Export PNG", **Then** a PNG image file is downloaded containing the chart as displayed on screen.
2. **Given** a radar chart has team overlay active, **When** the user exports, **Then** the exported image includes both series (member and team average).

---

### Edge Cases

- **Empty state**: What happens when a member opens the dashboard before submitting any ratings? The system MUST display a clear empty state message ("Aucune évaluation soumise") with a link to start the evaluation.
- **Partial submission**: If a member has saved progress but not submitted, the dashboard MUST show partial radar data based on rated categories, with a visible "Brouillon" badge indicating the evaluation is incomplete, and a link to resume the wizard.
- **Re-evaluation**: When a member reopens a previously submitted wizard, the system MUST pre-fill all fields with their existing ratings. Updated ratings overwrite previous values (no history).
- **Single member team**: Gap analysis and team average MUST gracefully handle a team of one (team average equals member score, gap analysis still computes against targets).
- **All skills rated identically**: The radar chart MUST render correctly even if all 9 categories have the same score (regular polygon, not collapsed).
- **Browser back/forward during wizard**: Navigation MUST NOT lose unsaved progress or break step state.
- **Concurrent edits**: If a member opens the wizard in two tabs, the most recently saved version wins (last-write-wins). No data corruption.

## Clarifications

### Session 2026-03-10

- Q: Can a member reopen and modify ratings after submission? → A: Yes — ratings can be reopened and overwritten at any time, no version history kept.
- Q: Are category weights equal or custom for risk calculation? → A: All 9 categories weighted equally; risk = gap magnitude.
- Q: Dashboard display scale — 0–5 or 0–100? → A: Display 0–5 everywhere, matching the 6 rating levels directly.
- Q: Dashboard behavior for partial (unsubmitted) evaluations? → A: Show partial radar data with a visible "Brouillon" (draft) badge.

## Requirements *(mandatory)*

### Functional Requirements

**Evaluation Wizard**

- **FR-001**: System MUST present skills grouped into 9 predefined categories: Socle Technique, Backend, Frontend, Platform, Observabilité, Sécurité, Architecture, Soft Skills, Domaine CAFAT/SINAPSE.
- **FR-002**: System MUST provide exactly 6 rating levels per skill: Inconnu (0), Débutant (1), Intermédiaire (2), Avancé (3), Confirmé (4), Expert (5), each with a calibrated description.
- **FR-003**: System MUST display calibrated descriptions for each level via contextual help (tooltip, popover, or expandable text) to guide accurate self-assessment.
- **FR-004**: Wizard MUST enforce step validation — a step cannot be marked "done" until all its required skills are rated.
- **FR-005**: Wizard MUST support three step states: done, active, and locked.
- **FR-006**: System MUST automatically save ratings as the user works — within 1 second of the last interaction — and persist to the server.
- **FR-007**: System MUST restore wizard progress on page reload — the user resumes at the last incomplete step with all prior ratings intact.
- **FR-008**: Wizard MUST include a final "Review & Confirm" step showing a per-category summary with the ability to navigate back to any category for editing.
- **FR-009**: On validation failure, the system MUST display inline error messages on the offending fields and automatically scroll to the first error.
- **FR-010**: Users MUST be able to mark individual skills as "N/A" (not applicable) to exclude them from scoring.
- **FR-010b**: After submission, a member MUST be able to reopen the wizard and modify their ratings at any time. Updated ratings overwrite the previous values with no version history.

**Dashboard — Individual**

- **FR-011**: System MUST display a radar chart with 9 axes (one per category) showing the member's average score per category on a 0–5 scale (matching the 6 rating levels).
- **FR-012**: System MUST support overlaying the team average on the same radar chart, togglable via the legend.
- **FR-013**: Radar chart MUST display rich tooltips on hover showing the exact numerical score per axis.
- **FR-014**: Chart colors and labels MUST automatically adapt to the active theme (light/dark).
- **FR-015**: Users MUST be able to export the radar chart as PNG or SVG.

**Dashboard — Team**

- **FR-016**: System MUST display a grid of team members with name, role, and a visual skill summary (mini radar or score indicator).
- **FR-017**: System MUST show category-level aggregates: team average per category and score distribution.
- **FR-018**: System MUST compute gap analysis: gap = target score (per role/category) minus member's actual score. All 9 categories are weighted equally — risk equals gap magnitude (no custom weighting in v1).
- **FR-019**: System MUST surface the top 3 gaps per member with severity indicators and actionable links.
- **FR-020**: Users MUST be able to filter the team view by category.

**Theme**

- **FR-021**: System MUST support three theme modes: light, dark, and system-detected.
- **FR-022**: Theme preference MUST persist locally across sessions.
- **FR-023**: Theme MUST apply instantly on page load with zero flash of wrong-themed content.
- **FR-024**: Theme toggle MUST be an icon-only button with a smooth micro-animation (200–350 ms transition).

**Data Services**

- **FR-025**: System MUST provide endpoints to retrieve the skill catalog (categories and skills with level descriptions).
- **FR-026**: System MUST provide endpoints to list team members.
- **FR-027**: System MUST provide endpoints to read and save all ratings for a given member in a single operation.
- **FR-028**: System MUST provide an endpoint returning pre-aggregated data per member (category averages, team averages, target scores) for dashboard consumption.

**Accessibility**

- **FR-029**: All interactive elements MUST meet WCAG AA contrast ratio in both light and dark themes.
- **FR-030**: All form controls, chart tooltips, and chart legends MUST be fully operable via keyboard.
- **FR-031**: All form errors and states MUST be communicated via appropriate ARIA attributes.
- **FR-032**: Wizard MUST support "skip-to-error" navigation on form validation failure.

### Key Entities

- **Category**: A skill grouping (9 total). Attributes: unique key, display label, sort order. Categories are system-defined and immutable.
- **Skill**: A specific competency belonging to one category. Attributes: unique identifier, category, display label, and 6 level descriptors (rank 0–5 with calibrated phrases). Skills are predefined (~65 total).
- **Member**: A team member who can be evaluated. Attributes: unique identifier, display name, role.
- **Rating**: A member's self-assessment on a single skill. Attributes: member reference, skill reference, selected rank (0–5), optional free-text notes, timestamp. One rating per member per skill.
- **Aggregate**: A computed view per member per category. Attributes: member reference, category, member's average rank, team average rank, target rank (defined per role/category).

### Assumptions

- The skill catalog (categories + skills + level descriptions) is predefined and loaded as reference data. It is not user-editable in v1.
- Target scores per role/category are predefined by a team lead or administrator and stored as configuration. The mechanism for editing targets is out of scope for v1 (manual file edit is acceptable).
- There is no authentication in v1 — the app runs on a trusted internal network. Any user can access any member's evaluation page and dashboard.
- Team size is small (5–20 members). The system does not need to optimize for hundreds of users.
- "N/A" ratings are excluded from category average calculations (they do not count as zero).

### Out of Scope (v1)

- Authentication, SSO, and role-based access control
- Temporal history (comparing evaluations over time)
- ML-based skill recommendations
- Advanced exports (Excel, PDF reports)
- Mobile-specific layouts

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member completes the full self-evaluation (~65 skills) in under 15 minutes.
- **SC-002**: After submitting, the member's radar dashboard loads and displays accurate per-category scores within 2 seconds.
- **SC-003**: 100% of wizard progress is recovered after an unexpected browser close and reopen.
- **SC-004**: Theme switch applies to all UI elements (including charts) within 350 ms with zero visual flash on page load.
- **SC-005**: All interactive elements pass WCAG AA contrast checks in both light and dark modes.
- **SC-006**: The gap analysis correctly identifies the top 3 skill gaps for a member when compared against predefined role targets.
- **SC-007**: Radar chart exports (PNG/SVG) produce a visually accurate reproduction of the on-screen chart including active overlays.
- **SC-008**: All chart tooltips and form controls are fully operable via keyboard navigation alone.

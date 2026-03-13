# Feature Specification: Dashboard Redesign & Expert Finder

**Feature Branch**: `004-dashboard-redesign`
**Created**: 2026-03-10
**Status**: Draft
**Input**: User description: "Better organization/layout of dashboard elements, better data display, and an Expert Finder feature to search who's good in specific tech (e.g. java and SQL, or java only, or Bash and kafka)"

## User Scenarios & Testing

### User Story 1 - Expert Finder: Search by Skill (Priority: P1)

A team member or manager wants to find who is the best person to ask about a specific technology or combination of technologies. They open the dashboard and use a search/filter interface to select skill names (e.g. "Java", "SQL", "Kafka"). The system shows a ranked list of team members who score highest on those selected skills, with their individual scores visible.

**Why this priority**: This is the main new capability requested. It directly answers "who should I ask about X?" — a daily need for team collaboration and knowledge sharing.

**Independent Test**: Open `/dashboard` → use the Expert Finder search → select "Java" → see ranked list of members by Java score → add "SQL" → list updates to show members ranked by combined Java + SQL proficiency.

**Acceptance Scenarios**:

1. **Given** the team dashboard is open with submitted evaluations, **When** the user selects "Java" in the Expert Finder, **Then** a ranked list of members appears sorted by their Java score (highest first), showing each member's name, role, and score for that skill.
2. **Given** the user has selected "Java", **When** they add "SQL" as a second skill, **Then** the ranking updates to show members sorted by their combined average score across both skills.
3. **Given** the user has selected skills, **When** a member has not rated one of the selected skills (or marked it N/A), **Then** that member appears lower in the list with a visual indicator showing the missing skill.
4. **Given** the user has selected skills, **When** no submitted member has rated any of the selected skills, **Then** an empty state message is shown: "Aucun membre n'a encore évalué ces compétences."

---

### User Story 2 - Reorganized Dashboard Layout (Priority: P2)

The dashboard currently stacks 6 sections vertically in a long scroll. The redesign introduces a tabbed or sectioned layout that groups related information together, reducing cognitive load and making navigation faster. The layout should feel organized and scannable at a glance.

**Why this priority**: Improving the layout benefits all dashboard users immediately and makes the dashboard usable as a real management tool rather than a data dump.

**Independent Test**: Open `/dashboard` → dashboard loads with clear visual sections/tabs → user can quickly navigate between personal view, team overview, and expert finder without excessive scrolling.

**Acceptance Scenarios**:

1. **Given** a member opens `/dashboard/:slug`, **When** the page loads, **Then** the dashboard displays organized sections with clear navigation between: personal overview, team intelligence, and expert finder.
2. **Given** the dashboard is open, **When** the user switches between sections, **Then** the transition is instant (no full page reload, no loading spinner for already-fetched data).
3. **Given** a screen width of 1280px or wider, **When** viewing the team intelligence section, **Then** category summary cards and gap table are visible without scrolling past the fold.

---

### User Story 3 - Enhanced Data Display (Priority: P3)

Data cards and tables use clearer visual hierarchy, consistent spacing, and better use of color to communicate meaning. Category cards show progress toward target more clearly. The gap table uses inline bar indicators instead of raw numbers. Member cards in the grid show a more compact, scannable format.

**Why this priority**: Polish that improves readability and data comprehension. Lower priority because the data is already displayed — this makes it better, not new.

**Independent Test**: Open `/dashboard` → visually compare category cards (progress toward target is clear) → check gap table (severity is immediately visible via color + bar) → verify member grid cards are compact and scannable.

**Acceptance Scenarios**:

1. **Given** team data is loaded, **When** viewing category summary cards, **Then** each card shows the team average, target, and a visual progress indicator (bar or gauge) showing how close the team is to the target.
2. **Given** the gap table is visible, **When** scanning the table, **Then** gap severity is communicated via both color coding and a visual bar/indicator, not just a number and text badge.
3. **Given** the team members grid is visible, **When** viewing member cards, **Then** each card shows a clear status (submitted/pending), top strengths (not just gaps), and a compact score summary.

---

### Edge Cases

- What happens when only 1 member has submitted? Expert Finder still works but shows only that member's scores.
- What happens when searching for a skill that no one has rated? Show an empty state with guidance.
- What happens when a member has skipped an entire category? Their scores for skills in that category are excluded from Expert Finder rankings (they are not penalized with 0).
- What happens on narrow screens (<768px)? Tabs collapse to a stacked layout; Expert Finder remains usable with a single-column result list.

## Requirements

### Functional Requirements

#### Expert Finder (US1)
- **FR-001**: System MUST provide a multi-select skill picker that lets users choose 1 or more skills from the full catalog (~65 skills).
- **FR-002**: System MUST rank team members by their average score across all selected skills, highest first.
- **FR-003**: System MUST show each member's individual score per selected skill in the results.
- **FR-004**: System MUST exclude unrated or N/A skills from a member's average (not count as 0) but visually indicate the missing skill.
- **FR-005**: System MUST allow filtering the skill picker by category to narrow skill selection.
- **FR-006**: System MUST show the number of matched skills per member (e.g. "3/4 compétences évaluées").

#### Dashboard Layout (US2)
- **FR-010**: Dashboard MUST organize content into navigable sections: Personal, Team Intelligence, Expert Finder.
- **FR-011**: Section navigation MUST be persistent and visible (tabs, sidebar, or anchored nav).
- **FR-012**: Personal section MUST contain the personal radar chart and individual gaps.
- **FR-013**: Team Intelligence section MUST contain team overview radar, category summaries, category deep-dive, gap table, and member grid.
- **FR-014**: Expert Finder MUST be a dedicated section accessible from the main navigation.
- **FR-015**: Dashboard MUST preserve the current URL structure (`/dashboard` for team, `/dashboard/:slug` for personal).

#### Enhanced Data Display (US3)
- **FR-020**: Category summary cards MUST show a visual indicator of progress toward the team target (not just a number).
- **FR-021**: Gap table MUST use visual severity indicators (color + bar width) alongside text badges.
- **FR-022**: Member cards MUST show top strengths (highest-rated categories) in addition to top gaps.
- **FR-023**: All data visualizations MUST work in both light and dark themes.

### Key Entities

- **SkillQuery**: A user's selection of 1+ skills to search for experts. Composed of skill IDs, optional category filter.
- **ExpertResult**: A ranked member entry showing: member info, per-skill scores, combined average, match count.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can find the top expert for any skill combination in under 10 seconds (select skills, see ranked results).
- **SC-002**: Dashboard sections are navigable with a single click/tap — no scrolling required to switch between personal, team, and expert finder views.
- **SC-003**: All dashboard data is visible and readable without horizontal scrolling on screens 1280px and wider.
- **SC-004**: Expert Finder results update within 500ms of skill selection change.
- **SC-005**: Dashboard loads all sections in under 2 seconds on a standard connection.

## Assumptions

- The Expert Finder operates on already-submitted evaluations only (drafts are excluded).
- Skill search is client-side (the full catalog and ratings are already fetched for the dashboard).
- No new API endpoints are needed for Expert Finder — it can compute rankings from the existing team aggregate data, extended to include per-skill scores.
- The section navigation uses client-side tabs (no URL hash routing needed beyond the existing slug pattern).
- Mobile layout is a nice-to-have, not a hard requirement (desktop-first per project constitution).

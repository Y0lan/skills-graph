# Feature Specification: French-Only Translation

**Feature Branch**: `002-french-translation`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "Translate the entire app into French ONLY"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - French UI Throughout the App (Priority: P1)

A team member opens the form or dashboard and sees every label, message, button, and description in French. There is no language switcher — French is the only language.

**Why this priority**: The entire team is French-speaking. English UI creates friction and confusion when rating skills.

**Independent Test**: Navigate to any page (form, dashboard, error states) and verify all visible text is in French.

**Acceptance Scenarios**:

1. **Given** a team member opens the form page, **When** they view skill categories, rating levels, buttons, and calibration prompts, **Then** all text is displayed in French.
2. **Given** a team member opens the dashboard, **When** they view chart labels, card titles, table headers, and risk badges, **Then** all text is displayed in French.
3. **Given** a team member encounters an error or empty state, **When** error messages, loading states, or "no data" messages appear, **Then** all text is displayed in French.

---

### User Story 2 - French Skill Descriptors (Priority: P1)

Each skill's 6 level descriptors (Unknown through Expert) are displayed in French so team members can accurately self-assess against criteria written in their native language.

**Why this priority**: The descriptors are the core of the rating experience. Misunderstanding a descriptor due to language leads to inaccurate ratings, which defeats the purpose of the tool.

**Independent Test**: Open the form for any skill category, expand a skill, and verify all 6 descriptors are in French.

**Acceptance Scenarios**:

1. **Given** a team member views any skill rating card, **When** they read the level descriptions, **Then** each descriptor is written in natural French.
2. **Given** a team member views the rating legend, **When** they read level names (Unknown, Awareness, Guided, etc.), **Then** the names are in French.

---

### User Story 3 - French Calibration Prompts (Priority: P2)

The calibration prompts shown before each category are in French so team members understand the scenario used for self-calibration.

**Why this priority**: Calibration prompts help normalize ratings across the team. French prompts ensure everyone understands the scenarios equally.

**Independent Test**: Navigate through each category step and verify the calibration prompt text is in French.

**Acceptance Scenarios**:

1. **Given** a team member enters a new category step, **When** the calibration prompt is displayed, **Then** the prompt text is entirely in French.

---

### Edge Cases

- Technical terms (e.g., "Kubernetes", "OAuth2", "Spring Boot") remain in their original form — they are industry-standard names, not translatable words.
- Skill labels that are proper nouns or product names (e.g., "Java", "Docker", "Grafana") remain untranslated.
- Domain knowledge category labels that are already in French remain unchanged.
- Team member names are never translated.
- Date formatting should use French locale (e.g., "9 mars 2026" instead of "3/9/2026").

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All UI labels, button text, page titles, and status messages MUST be in French.
- **FR-002**: All 6 rating level names MUST be translated to French (e.g., "Unknown" → "Inconnu", "Awareness" → "Notions", "Guided" → "Guidé", "Autonomous" → "Autonome", "Advanced" → "Avancé", "Expert" → "Expert").
- **FR-003**: All ~390 skill descriptors (65 skills × 6 levels) MUST be translated to natural, professional French.
- **FR-004**: All 9 calibration prompts MUST be translated to French.
- **FR-005**: All dashboard labels (chart names, table headers, card titles, risk badges) MUST be in French.
- **FR-006**: All error messages, loading states, empty states, and confirmation messages MUST be in French.
- **FR-007**: Dates displayed to users MUST use French locale formatting.
- **FR-008**: Technical product names and acronyms (Java, Docker, OAuth2, etc.) MUST remain untranslated.
- **FR-009**: The translation MUST be hardcoded — no internationalization framework or language switcher is required.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of user-visible text across all pages is in French (zero English strings remain in UI).
- **SC-002**: Team members can complete the full rating form without encountering any English text (excluding technical terms).
- **SC-003**: All dashboard views (radar charts, summary cards, gap table, member grid) display French labels exclusively.
- **SC-004**: The translation reads naturally to native French speakers — no machine-translation artifacts or awkward phrasing.

## Assumptions

- The app serves a single French-speaking team; no multi-language support is needed.
- Technical terms and product names are universally understood and should not be translated.
- The existing data structure (API payloads, JSON keys) remains in English — only the UI layer changes.
- Team roles and team names in `team-roster.ts` are already in French and need no changes.
- The domain knowledge category is already partially in French and needs minimal changes.

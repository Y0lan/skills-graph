# Feature Specification: Minimal Header Bar

**Feature Branch**: `006-minimal-header`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Ajoute un header minimaliste et invisible, qui contient le theme switcher, et des boutons. Sur le formulaire ajoute un bouton dans le header pour reset tout le formulaire, et un bouton pour aller dans la dashboard."

## Clarifications

### Session 2026-03-11

- Q: When a user resets their form, should their "submitted" status also be cleared? → A: Yes, clear submittedAt — member becomes "pending" again, excluded from team aggregates until re-submission.
- Q: Should the header be sticky (fixed at top) or scroll with the page? → A: Sticky — header stays fixed at the top of the viewport at all times.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Global Minimal Header (Priority: P1)

On every page of the application (form and dashboard), a subtle, minimal header bar is visible at the top of the screen. It contains the theme toggle (light/dark) and provides page-specific action buttons. The header is designed to be "invisible" — it blends into the background with no heavy borders, shadows, or contrasting backgrounds. It stays out of the way visually while remaining accessible.

**Why this priority**: The header is the container for all other buttons. Without it, there's no consistent place for navigation or actions.

**Independent Test**: Navigate to any page and verify the header is present with the theme toggle. Toggle the theme to confirm it works from its new location.

**Acceptance Scenarios**:

1. **Given** the user is on any page (form or dashboard), **When** the page loads, **Then** a minimal sticky header is visible at the top of the viewport containing the theme toggle button, and it remains visible when the user scrolls.
2. **Given** the header is visible, **When** the user observes the header design, **Then** it has no heavy borders, no box shadows, and uses a transparent or near-transparent background that blends with the page.
3. **Given** the theme toggle was previously floating in the top-right corner, **When** the header is implemented, **Then** the floating toggle is removed and the toggle lives exclusively in the header.

---

### User Story 2 - Form Reset Button (Priority: P1)

When the user is on the form page (`/form/:slug`), the header includes a "Reset" button that clears all their ratings, experience values, and skipped categories — returning the form to a blank state. Before resetting, the user is asked to confirm to prevent accidental data loss.

**Why this priority**: Core requested functionality. Users need a quick way to start their evaluation over without manually clearing each skill.

**Independent Test**: Fill out several skills on the form, click Reset in the header, confirm the dialog, and verify all ratings return to their default (unrated) state.

**Acceptance Scenarios**:

1. **Given** the user is on the form page with some skills already rated, **When** they click the "Reset" button in the header, **Then** a confirmation dialog appears asking them to confirm the reset.
2. **Given** the confirmation dialog is open, **When** the user confirms, **Then** all ratings, experience values, skipped categories, and the submitted status are cleared. The form returns to step 1 in blank state, and the member appears as "pending" on the dashboard until they re-submit.
3. **Given** the confirmation dialog is open, **When** the user cancels, **Then** no data is changed and the dialog closes.
4. **Given** the form has been reset, **When** the user continues filling out the form, **Then** autosave resumes saving the new data normally.

---

### User Story 3 - Dashboard Navigation Button on Form (Priority: P1)

When the user is on the form page, the header includes a button to navigate to the dashboard. This gives users a quick way to switch between evaluating their skills and viewing the team dashboard without needing to manually edit the URL.

**Why this priority**: Core requested functionality. Without this, users on the form have no visible navigation to get to the dashboard.

**Independent Test**: Navigate to a form page, click the dashboard button in the header, and verify you arrive at the dashboard.

**Acceptance Scenarios**:

1. **Given** the user is on the form page for member "jean-dupont", **When** they click the "Dashboard" button in the header, **Then** they are navigated to `/dashboard/jean-dupont` (their personal dashboard view).
2. **Given** the user is on the form page, **When** they observe the header, **Then** the dashboard button is clearly identifiable with an icon and/or label.

---

### User Story 4 - Context-Aware Header Content (Priority: P2)

The header shows different buttons depending on which page the user is on. On the form page, it shows Reset + Dashboard buttons. On the dashboard page, it shows relevant actions for that context (e.g., a link back to the form if viewing a personal dashboard). The theme toggle is always present regardless of page.

**Why this priority**: Enhances navigation consistency but is secondary to the core form-page buttons.

**Independent Test**: Navigate between form and dashboard pages and verify the header buttons change appropriately.

**Acceptance Scenarios**:

1. **Given** the user is on the form page, **When** they look at the header, **Then** they see the theme toggle, a reset button, and a dashboard navigation button.
2. **Given** the user is on the dashboard page for a specific member, **When** they look at the header, **Then** they see the theme toggle and a button to go to that member's form.
3. **Given** the user is on the team dashboard (no slug), **When** they look at the header, **Then** they see only the theme toggle (no form link since there's no specific member context).

---

### Edge Cases

- What happens when the user resets while on a step other than step 1? The form should return to step 1.
- What happens if the user navigates away (to dashboard) while the form has unsaved changes? Autosave should already have persisted the latest state, so no data loss occurs.
- What happens on very narrow screens (mobile)? The header should remain usable — buttons may collapse to icon-only to save space.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST display a sticky header bar fixed at the top of the viewport on every page.
- **FR-002**: The header MUST contain the theme toggle (moved from its current floating position).
- **FR-003**: The header MUST be visually minimal — no heavy borders, drop shadows, or opaque backgrounds that contrast with the page content.
- **FR-004**: On the form page, the header MUST include a "Reset" button that clears all form data (ratings, experience, skipped categories) and the submitted status, so the member is excluded from team aggregates until re-submission.
- **FR-005**: The reset action MUST require user confirmation before executing.
- **FR-006**: After a reset, the form MUST return to step 1 in a blank/default state.
- **FR-007**: On the form page, the header MUST include a button to navigate to the dashboard.
- **FR-008**: The dashboard navigation button MUST link to the current member's personal dashboard (`/dashboard/:slug`).
- **FR-009**: The header content MUST be context-aware, showing different buttons based on the current page.
- **FR-010**: On a personal dashboard page, the header SHOULD include a button to navigate back to that member's form.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can toggle the theme from the header on any page in a single click.
- **SC-002**: Users can reset an in-progress form in under 3 seconds (click reset, confirm, form clears).
- **SC-003**: Users can navigate from the form to the dashboard in a single click.
- **SC-004**: The header occupies minimal vertical space (no more than ~48px height) and does not push page content down significantly.
- **SC-005**: All header actions are accessible on mobile viewports (minimum 375px width) without horizontal scrolling.

## Assumptions

- The header replaces the current floating theme toggle; no other floating elements remain.
- "Reset" means clearing the local form state, the persisted server-side data, and the submitted status for this member (via the existing API), so a page refresh after reset shows blank data and the member is excluded from team aggregates.
- The header is sticky/fixed at the top of the viewport, always visible regardless of scroll position.

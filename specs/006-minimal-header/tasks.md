# Tasks: Minimal Header Bar

**Input**: Design documents from `/specs/006-minimal-header/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contracts.md, quickstart.md

**Tests**: Not requested — manual verification only.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Exact file paths included in all descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install required shadcn/ui component

- [x] T001 Install shadcn/ui AlertDialog component via `npx shadcn@latest add alert-dialog`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create shared components and hook extensions needed by multiple user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create AppHeader component in `src/components/app-header.tsx` — fixed `<header>` at viewport top, full width, h-12, z-50, `bg-background/80 backdrop-blur-sm`, no borders/shadows, accepts `headerActions?: ReactNode` prop for page-specific buttons (left side), always renders ThemeToggle on right side, semantic `<header>` element
- [x] T003 [P] Create ResetConfirmDialog component in `src/components/reset-confirm-dialog.tsx` — uses shadcn/ui AlertDialog primitives, French labels ("Réinitialiser le formulaire ?", "Annuler", "Réinitialiser"), destructive styling on confirm button, props: `open`, `onOpenChange`, `onConfirm`, `loading?`
- [x] T004 [P] Add `resetRatings` method to `useRatings` hook in `src/hooks/use-ratings.ts` — calls `DELETE /api/ratings/${slug}`, on success sets `data` to null and returns `true`, on error sets `error` and returns `false`, manages `loading` state, update `UseRatingsReturn` interface

**Checkpoint**: Foundation ready — AppHeader, ResetConfirmDialog, and resetRatings hook available for story implementation

---

## Phase 3: User Story 1 — Global Minimal Header (Priority: P1) 🎯 MVP

**Goal**: A subtle, minimal sticky header bar is visible at the top of every page, containing the theme toggle relocated from its floating position.

**Independent Test**: Navigate to any page → header visible at top with theme toggle. Toggle theme → works. Scroll → header stays fixed. Old floating toggle is gone.

### Implementation for User Story 1

- [x] T005 [US1] Remove floating ThemeToggle div and ThemeToggle import from `src/App.tsx` — delete the `<div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>` block
- [x] T006 [US1] Add AppHeader to `src/pages/form-page.tsx` — import AppHeader, render `<AppHeader />` (no headerActions yet) at the top of the page, add `pt-12` to the main content container to offset the fixed header
- [x] T007 [P] [US1] Add AppHeader to `src/pages/dashboard-page.tsx` — import AppHeader, render `<AppHeader />` (no headerActions yet) at the top of the page, add `pt-12` to the main content container to offset the fixed header

**Checkpoint**: Header visible on every page with theme toggle. Floating toggle removed. Page content properly offset.

---

## Phase 4: User Story 2 — Form Reset Button (Priority: P1)

**Goal**: On the form page, a Reset button in the header clears all ratings, experience, skipped categories, and submitted status, returning the form to step 1 in blank state.

**Independent Test**: Fill out several skills on the form → click Reset in header → confirmation dialog appears → confirm → form clears to step 1, all data erased. Cancel → no change.

### Implementation for User Story 2

- [x] T008 [US2] Expose form reset capability in `src/components/form/skill-form-wizard.tsx` — accept a `resetKey` prop (number); when `resetKey` changes, call `form.reset()` with default values, `setCurrentStep(0)`, and clear skipped categories state
- [x] T009 [US2] Wire reset flow in `src/pages/form-page.tsx` — import ResetConfirmDialog, add `resetRatings` from useRatings, add dialog open state + resetKey counter state, reset handler calls `resetRatings(slug)` then increments `resetKey` and sets `submitted` to false, add Reset button (RotateCcw icon from Lucide, `aria-label="Réinitialiser"`) to AppHeader's `headerActions`, render ResetConfirmDialog with open/onOpenChange/onConfirm wired, pass `resetKey` to SkillFormWizard

**Checkpoint**: Reset button in form header → dialog → confirm clears all data (server + client) and returns to step 1.

---

## Phase 5: User Story 3 — Dashboard Navigation Button on Form (Priority: P1)

**Goal**: On the form page, a button in the header navigates to the current member's personal dashboard.

**Independent Test**: Navigate to `/form/:slug` → click Dashboard button in header → navigates to `/dashboard/:slug`.

### Implementation for User Story 3

- [x] T010 [US3] Add dashboard navigation button to header actions in `src/pages/form-page.tsx` — add a Link (react-router-dom) or `<a>` to `/dashboard/${slug}` as a shadcn/ui Button with LayoutDashboard icon from Lucide and text "Dashboard", add alongside the existing Reset button inside `headerActions`

**Checkpoint**: Form page header shows Reset + Dashboard buttons + ThemeToggle. Dashboard link navigates correctly.

---

## Phase 6: User Story 4 — Context-Aware Header Content (Priority: P2)

**Goal**: The header shows different buttons depending on the current page. Dashboard with slug shows a link back to the member's form. Team dashboard (no slug) shows only the theme toggle.

**Independent Test**: Navigate to `/dashboard/:slug` → header shows "Modifier" link to form. Navigate to `/dashboard` → header shows only theme toggle. Navigate between form and dashboard → buttons change.

### Implementation for User Story 4

- [x] T011 [US4] Add context-aware header actions to `src/pages/dashboard-page.tsx` — when `slug` is present, pass a Button (Link to `/form/${slug}`) with ClipboardEdit icon + "Modifier" label as `headerActions` to AppHeader; when no slug, pass no `headerActions` (theme toggle only)
- [x] T012 [US4] Remove the existing inline "Modifier" Button from `src/pages/dashboard-page.tsx` — delete the `<Button variant="outline" size="sm" render={<Link to={...} />}>` element from the dashboard's in-page header section, since navigation is now handled by AppHeader

**Checkpoint**: All pages show correct context-aware header content. No duplicate navigation buttons.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verification and cleanup across all user stories

- [x] T013 Run `npx tsc --noEmit` to verify no type errors across all modified files
- [x] T014 Run `npm run lint` to verify no new lint warnings
- [x] T015 Run quickstart.md verification scenarios — all 8 verification steps from quickstart.md pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — install AlertDialog first
- **Foundational (Phase 2)**: Depends on Phase 1 (AlertDialog installed for ResetConfirmDialog)
- **US1 (Phase 3)**: Depends on Phase 2 (AppHeader component must exist)
- **US2 (Phase 4)**: Depends on Phase 3 (AppHeader integrated into form-page.tsx)
- **US3 (Phase 5)**: Depends on Phase 3 (AppHeader integrated into form-page.tsx)
- **US4 (Phase 6)**: Depends on Phase 3 (AppHeader integrated into dashboard-page.tsx)
- **Polish (Phase 7)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational — can start immediately after Phase 2
- **US2 (P1)**: Depends on US1 (AppHeader must be in form-page.tsx before adding Reset button to headerActions)
- **US3 (P1)**: Depends on US1 (AppHeader must be in form-page.tsx before adding Dashboard link to headerActions) — can run in parallel with US2
- **US4 (P2)**: Depends on US1 (AppHeader must be in dashboard-page.tsx) — can run in parallel with US2/US3

### Within Each User Story

- Components and hooks before page integration
- Core functionality before polish

### Parallel Opportunities

- **Phase 2**: T003 and T004 can run in parallel (different files, no dependencies)
- **Phase 3**: T006 and T007 can run in parallel (different page files)
- **After US1**: US2, US3, and US4 can theoretically start in parallel (different concerns), though US2+US3 both modify `form-page.tsx` so should be sequenced
- **US4**: T011 and T012 modify the same file and should be done together

---

## Parallel Example: Foundational Phase

```bash
# These can run in parallel (different files):
Task T003: "Create ResetConfirmDialog in src/components/reset-confirm-dialog.tsx"
Task T004: "Add resetRatings method to useRatings in src/hooks/use-ratings.ts"
```

## Parallel Example: User Story 1

```bash
# After T005 (App.tsx), these can run in parallel (different page files):
Task T006: "Add AppHeader to src/pages/form-page.tsx"
Task T007: "Add AppHeader to src/pages/dashboard-page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Install AlertDialog
2. Complete Phase 2: Create AppHeader, ResetConfirmDialog, resetRatings hook
3. Complete Phase 3: US1 — header on every page with theme toggle
4. **STOP and VALIDATE**: Header visible, theme toggle works from header, floating toggle gone
5. Continue to US2/US3/US4

### Incremental Delivery

1. Phase 1+2 → Foundation ready (components + hook)
2. US1 → Header everywhere with theme toggle (MVP!)
3. US2 → Reset button on form (core functionality)
4. US3 → Dashboard nav on form (core functionality)
5. US4 → Context-aware dashboard header (enhancement)
6. Polish → Type check, lint, full validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 and US3 both modify `form-page.tsx` — sequence them (US2 first, then US3 adds alongside)
- US4 T011 and T012 both modify `dashboard-page.tsx` — do them in one pass
- No backend changes needed — `DELETE /api/ratings/:slug` already exists
- Commit after each completed user story phase

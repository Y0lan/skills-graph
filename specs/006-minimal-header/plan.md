# Implementation Plan: Minimal Header Bar

**Branch**: `006-minimal-header` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-minimal-header/spec.md`

## Summary

Add a sticky, minimal header bar to every page containing the theme toggle (relocated from floating position) and context-aware action buttons. On the form page: a Reset button (with confirmation dialog, calls `DELETE /api/ratings/:slug` to clear all data including submittedAt) and a Dashboard navigation button. On the dashboard page with a member slug: a link back to the member's form. The header uses a render-prop pattern for page-specific actions, shadcn/ui AlertDialog for reset confirmation, and translucent styling with no borders/shadows.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend + backend)
**Primary Dependencies**: React 19, Vite 7, shadcn/ui (Radix UI), Tailwind CSS, Lucide icons, next-themes, React Router DOM, React Hook Form
**Storage**: SQLite (better-sqlite3) — existing `evaluations` table, existing `DELETE /api/ratings/:slug` endpoint
**Testing**: Manual testing (no automated test framework in project)
**Target Platform**: Desktop web browser (internal tool)
**Project Type**: Web application (Vite SPA + Express 5 backend)
**Performance Goals**: 60 FPS animations, header renders instantly (no data fetching)
**Constraints**: Desktop-first, AA+ accessibility, header ≤48px height, shadcn/ui components only, Lucide icons only
**Scale/Scope**: Internal team tool (~10 members), 2 pages (form + dashboard)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. UX & Modernité | ✅ PASS | Desktop-first, minimal/invisible design, micro-interactions on buttons |
| II. Design System | ✅ PASS | shadcn/ui Button + AlertDialog, Lucide icons (RotateCcw, LayoutDashboard, ClipboardEdit), Tailwind utilities |
| III. Thème Light/Dark | ✅ PASS | ThemeToggle relocated to header, continues using next-themes with Sun/Moon transition |
| IV. Accessibilité (AA+) | ✅ PASS | AlertDialog handles focus trap + ARIA, header uses semantic `<header>` element, all buttons have aria-labels |
| V. Formulaires | ✅ PASS | Reset uses `form.reset()` from React Hook Form, returns to step 1 |
| VI. Wizard/Stepper | ✅ PASS | Reset returns wizard to step 0 (first category) |
| VII. Dashboard | ✅ N/A | No radar/chart changes |
| VIII. Code & Architecture | ✅ PASS | Single-responsibility: AppHeader (layout), ResetConfirmDialog (confirmation), each page owns its actions |
| IX. Qualité & Robustesse | ✅ PASS | No React warnings, transitions 200–300ms, backdrop-blur for premium feel |

**Post-Phase 1 re-check**: All gates still pass. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/006-minimal-header/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── ui-contracts.md  # Component interfaces
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── app-header.tsx              # NEW — sticky header with action slot
│   ├── reset-confirm-dialog.tsx    # NEW — AlertDialog for reset confirmation
│   └── theme-toggle.tsx            # EXISTING — moved into header
├── hooks/
│   └── use-ratings.ts              # MODIFIED — add resetRatings method
├── pages/
│   ├── form-page.tsx               # MODIFIED — pass header actions
│   └── dashboard-page.tsx          # MODIFIED — pass header actions, remove inline button
└── App.tsx                         # MODIFIED — replace floating toggle with AppHeader
```

**Structure Decision**: Existing flat `src/components/` structure. Two new component files added at root component level (not in a subdirectory) since they're app-level components, not form- or dashboard-specific.

## Implementation Steps

### Step 1 — Install AlertDialog + Create AppHeader Component

Install shadcn/ui AlertDialog: `npx shadcn@latest add alert-dialog`

Create `src/components/app-header.tsx`:
- Fixed header at viewport top, full width, h-12, z-50
- Translucent background: `bg-background/80 backdrop-blur-sm`
- No borders, no shadows
- Accepts `headerActions?: ReactNode` prop for page-specific buttons (left side)
- Always renders `ThemeToggle` on the right side
- Semantic `<header>` element

### Step 2 — Create ResetConfirmDialog Component

Create `src/components/reset-confirm-dialog.tsx`:
- Uses shadcn/ui `AlertDialog` primitives
- French labels: "Réinitialiser le formulaire ?", "Annuler", "Réinitialiser"
- Destructive action styling on confirm button
- Props: `open`, `onOpenChange`, `onConfirm`, `loading?`

### Step 3 — Add resetRatings to useRatings Hook

Modify `src/hooks/use-ratings.ts`:
- Add `resetRatings(slug: string): Promise<boolean>` to `useRatings()`
- Calls `DELETE /api/ratings/${slug}`
- On success: sets `data` to null, returns `true`
- On error: sets `error`, returns `false`
- Update `UseRatingsReturn` interface

### Step 4 — Update App.tsx

Modify `src/App.tsx`:
- Remove the floating `<div className="fixed top-4 right-4 z-50">` + `<ThemeToggle />` div
- Remove `ThemeToggle` import (it will be imported by `AppHeader`)
- No AppHeader added at App level — each page renders its own AppHeader with page-specific actions

### Step 5 — Update FormPage with Header Actions

Modify `src/pages/form-page.tsx`:
- Import `AppHeader`, `ResetConfirmDialog`
- Add `resetRatings` from `useRatings()`
- Add reset state: dialog open state, reset handler
- Reset handler: calls `resetRatings(slug)`, then resets form to blank state + step 1
- Render `<AppHeader>` with Reset button (RotateCcw icon) + Dashboard link (LayoutDashboard icon)
- Pass `onReset` callback to `SkillFormWizard` or handle reset externally
- Add `pt-12` to page content to offset fixed header

### Step 6 — Expose Form Reset on SkillFormWizard

Modify `src/components/form/skill-form-wizard.tsx`:
- Accept `onReset?: () => void` callback or expose an imperative handle
- When parent calls reset: `form.reset()` to defaults, `setCurrentStep(0)`, clear skipped state
- Alternative: pass a `resetKey` prop that triggers form re-initialization when changed

### Step 7 — Update DashboardPage with Header Actions

Modify `src/pages/dashboard-page.tsx`:
- Import `AppHeader`
- Render `<AppHeader>` with: form link button when `slug` present (ClipboardEdit icon + "Modifier"), no actions when no slug
- Remove the existing inline "Modifier" `<Button>` from the dashboard header section
- Add `pt-12` to page content to offset fixed header

## Files Summary

| New files | Purpose |
|-----------|---------|
| `src/components/app-header.tsx` | Sticky header with theme toggle + action slot |
| `src/components/reset-confirm-dialog.tsx` | AlertDialog for reset confirmation |

| Modified files | Change |
|----------------|--------|
| `src/App.tsx` | Remove floating ThemeToggle div |
| `src/hooks/use-ratings.ts` | Add `resetRatings` method |
| `src/pages/form-page.tsx` | Add header with Reset + Dashboard buttons, handle reset flow |
| `src/pages/dashboard-page.tsx` | Add header with Form link, remove inline Modifier button |
| `src/components/form/skill-form-wizard.tsx` | Support external reset (form.reset + step 0) |

| Installed components |
|---------------------|
| `shadcn/ui alert-dialog` |

## Verification

1. `npx tsc --noEmit` — no type errors
2. `npm run lint` — clean (no new warnings)
3. Navigate to `/form/:slug` — header visible with Reset + Dashboard + ThemeToggle
4. Navigate to `/dashboard/:slug` — header shows ThemeToggle + Modifier link
5. Navigate to `/dashboard` — header shows ThemeToggle only
6. Click Reset → dialog appears → confirm → form clears to step 1, server data deleted
7. Click Reset → cancel → no data change
8. Scroll on any page → header stays fixed at viewport top
9. Toggle theme from header → works on all pages
10. Page content not hidden behind header (proper top padding offset)
11. Header height ≤48px, no borders/shadows, translucent background

## Complexity Tracking

> No constitution violations. No complexity justifications needed.

# Research: Minimal Header Bar

**Feature**: 006-minimal-header | **Date**: 2026-03-11

## R1: Sticky Header Approach in React SPA

**Decision**: Use a `<header>` element with `fixed top-0` Tailwind classes, `z-50`, and transparent/translucent background. Add `pt-12` (or similar) to page content to offset the header height.

**Rationale**: The app already uses a `fixed top-4 right-4 z-50` div for the ThemeToggle in `App.tsx`. Replacing it with a full-width fixed header follows the same pattern. Using Tailwind's utility classes keeps it consistent with the rest of the codebase. No additional library needed.

**Alternatives considered**:
- `sticky` positioning: Would require the header to be inside the scrollable container. Since pages have their own scroll containers (`min-h-screen` divs), `fixed` is simpler and guarantees viewport-top behavior.
- CSS `position: sticky` on a layout wrapper: More complex for no benefit in this single-page app context.

## R2: Context-Aware Header Content via React Router

**Decision**: Use `useLocation()` from react-router-dom to determine the current page context, and render different button sets accordingly. The header component receives optional render props or children for page-specific actions.

**Rationale**: The app already uses react-router-dom with `useParams`. Using `useLocation()` or pattern matching on the pathname is the idiomatic way to conditionally render in a route-aware component. A render-prop approach (`headerActions` prop) is cleaner — each page declares its own header actions.

**Alternatives considered**:
- Separate header components per page: Violates DRY; the theme toggle and layout would be duplicated.
- React Context for header actions: Over-engineered for 2 pages with 2-3 buttons each.
- Render props on `AppHeader`: Simple, explicit, no extra state management. **Selected.**

## R3: Form Reset Backend + Frontend Flow

**Decision**: Call `DELETE /api/ratings/:slug` (already exists) to clear server data, then reset the React Hook Form state and navigate to step 1.

**Rationale**: The backend `deleteEvaluation(slug)` removes the evaluation row entirely from SQLite, which clears ratings, experience, skippedCategories, and submittedAt in one operation. The frontend needs to: (1) call the API, (2) reset the form via `form.reset()`, (3) set `currentStep` to 0, (4) clear autosave state.

**Alternatives considered**:
- PUT with empty data: Would still leave a row with `submittedAt: null`. DELETE is cleaner — the GET endpoint already returns a default empty object when no row exists.
- Client-only reset without API call: Would cause stale data on page refresh. Server-side reset is required per spec.

## R4: Confirmation Dialog Component

**Decision**: Use shadcn/ui `AlertDialog` component for the reset confirmation.

**Rationale**: shadcn/ui provides `AlertDialog` (built on Radix UI) which handles focus trapping, keyboard navigation, and ARIA attributes out of the box. It's already part of the design system and matches the constitution's requirement for shadcn/ui components and AA+ accessibility.

**Alternatives considered**:
- Native `window.confirm()`: Blocks the main thread, not styleable, inconsistent cross-browser. Does not meet the "premium" quality bar.
- Custom modal: Unnecessary when AlertDialog exists in the design system.

## R5: Header Height and Visual Design

**Decision**: Header height of 48px (`h-12`), using `bg-background/80 backdrop-blur-sm` for a subtle translucent effect. No borders or shadows. Horizontal padding matching page content.

**Rationale**: The spec requires ≤48px height, "no heavy borders, drop shadows, or opaque backgrounds." A translucent background with backdrop blur provides visual separation while remaining "invisible" — content shows through subtly. This matches the kibo-ui aesthetic referenced in the constitution.

**Alternatives considered**:
- Fully transparent background: Content underneath becomes unreadable when overlapping buttons.
- Solid opaque background: Violates the "invisible/minimal" spec requirement.
- Border-bottom only: Adds visual weight that contradicts "no heavy borders."

# Quickstart: Minimal Header Bar

**Feature**: 006-minimal-header | **Date**: 2026-03-11

## What This Feature Does

Adds a sticky, minimal header bar to every page. The header contains the theme toggle (moved from its current floating position) and context-aware action buttons:
- **Form page**: Reset button (clears all data) + Dashboard navigation button
- **Dashboard page** (with member): Link back to that member's form
- **Dashboard page** (team view): Theme toggle only

## Prerequisites

- Existing codebase on branch `006-minimal-header`
- shadcn/ui AlertDialog component installed (`npx shadcn@latest add alert-dialog`)
- Running backend server with `DELETE /api/ratings/:slug` endpoint (already exists)

## Key Files to Create

| File | Purpose |
|------|---------|
| `src/components/app-header.tsx` | Sticky header with ThemeToggle + action slot |
| `src/components/reset-confirm-dialog.tsx` | AlertDialog for reset confirmation |

## Key Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Remove floating ThemeToggle div, add AppHeader |
| `src/pages/form-page.tsx` | Pass header actions (Reset + Dashboard link) to AppHeader |
| `src/pages/dashboard-page.tsx` | Pass header actions (Form link when slug present) to AppHeader, remove inline "Modifier" button |
| `src/hooks/use-ratings.ts` | Add `resetRatings` method |
| `src/components/form/skill-form-wizard.tsx` | Expose `onReset` callback to clear form state + return to step 1 |

## Architecture Decisions

1. **Render-prop pattern** for header actions — each page declares its own buttons, no routing logic inside the header
2. **Existing DELETE endpoint** reused for reset — no backend changes needed
3. **AlertDialog from shadcn/ui** for confirmation — consistent with design system, handles accessibility
4. **48px fixed header** with translucent background — matches spec's "invisible" requirement while remaining functional

## Verification Steps

1. Navigate to `/form/:slug` — header visible with Reset + Dashboard buttons + theme toggle
2. Navigate to `/dashboard/:slug` — header shows theme toggle + "Modifier" link to form
3. Navigate to `/dashboard` — header shows theme toggle only
4. Click Reset on form → confirmation dialog appears → confirm → form clears to step 1
5. Click Reset → cancel → no data change
6. Scroll on any page → header stays fixed at top
7. Toggle theme from header → works on all pages
8. Page content not hidden behind header (proper top padding)

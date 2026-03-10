# Implementation Plan: Minimal Header Bar

**Branch**: `006-minimal-header` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-minimal-header/spec.md`
**Status**: ✅ Complete — all tasks implemented and committed

## Summary

Add a minimal, sticky, translucent header bar to every page of the application. The header hosts the theme toggle (relocated from its floating position), page-specific action buttons (Reset + Dashboard on the form page, Modifier on the personal dashboard), and wizard navigation buttons (Retour/Suivant/Soumettre). Uses shadcn/ui AlertDialog for reset confirmation, `key={resetKey}` pattern for form remount, and render-prop pattern for context-aware header content.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React 19, shadcn/ui (Radix UI AlertDialog), Tailwind CSS, Lucide icons, react-router-dom
**Storage**: N/A (uses existing `DELETE /api/ratings/:slug` endpoint)
**Testing**: Manual verification
**Target Platform**: Desktop web (Vite 7 dev server)
**Project Type**: Web application (SPA)
**Performance Goals**: 60 FPS, header ≤48px height
**Constraints**: No new dependencies beyond shadcn/ui AlertDialog
**Scale/Scope**: 2 pages (form + dashboard), 1 shared header component

## Constitution Check

*GATE: All gates passed.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. UX & Modernité | ✅ | Translucent header, smooth transitions, minimal friction |
| II. Design System | ✅ | shadcn/ui Button, AlertDialog; Lucide icons exclusively |
| III. Thème Light/Dark | ✅ | Theme toggle in header, bg adapts via CSS variables |
| IV. Accessibilité (AA+) | ✅ | ARIA labels, keyboard-navigable AlertDialog, focus trapping |
| V. Formulaires | ✅ | Reset clears React Hook Form state properly |
| VI. Wizard / Stepper | ✅ | Navigation lifted to header via WizardNavigation callback |
| VII. Dashboard | N/A | No dashboard chart changes |
| VIII. Code & Architecture | ✅ | Clean imports, single-responsibility components |
| IX. Qualité & Robustesse | ✅ | No warnings, tsc clean, lint clean |

## Project Structure

### Documentation (this feature)

```text
specs/006-minimal-header/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — no new entities
├── quickstart.md        # Phase 1 — verification scenarios
├── contracts/           # Phase 1 — UI contracts
│   └── ui-contracts.md
├── checklists/          # Quality checklists
│   └── requirements.md
└── tasks.md             # Phase 2 — 15 tasks, all complete
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── app-header.tsx              # NEW — shared sticky header (headerActions + headerNav slots)
│   ├── reset-confirm-dialog.tsx    # NEW — shadcn/ui AlertDialog for form reset
│   ├── theme-toggle.tsx            # EXISTING — moved into header
│   └── form/
│       ├── calibration-prompt.tsx  # MODIFIED — removed duplicate title + emoji
│       ├── category-step.tsx       # MODIFIED — updated calibration prop type
│       ├── progress-bar.tsx        # MODIFIED — flex-wrap pills with short labels
│       └── skill-form-wizard.tsx   # MODIFIED — WizardNavigation callback, removed bottom nav
├── hooks/
│   └── use-ratings.ts             # MODIFIED — added resetRatings method
├── pages/
│   ├── form-page.tsx              # MODIFIED — header + nav buttons + reset + dashboard link
│   └── dashboard-page.tsx         # MODIFIED — header + context-aware "Modifier" link
└── App.tsx                         # MODIFIED — removed floating ThemeToggle

server/
├── lib/
│   └── seed-catalog.ts            # MODIFIED — French calibration prompts
└── routes/
    ├── ratings.ts                 # MODIFIED — French error messages
    └── aggregates.ts              # MODIFIED — French error messages
```

**Structure Decision**: Existing web application structure preserved. New components added to `src/components/`, existing files modified in place.

## Research Decisions

See [research.md](./research.md) for full details:

- **R1**: Fixed header with `bg-background/80 backdrop-blur-sm` (vs sticky, vs solid bg)
- **R2**: Render-prop pattern (`headerActions` + `headerNav`) for context-aware content (vs separate headers, vs React Context)
- **R3**: `DELETE /api/ratings/:slug` for server reset + `key={resetKey}` for form remount (vs PUT empty, vs client-only)
- **R4**: shadcn/ui AlertDialog for confirmation (vs window.confirm, vs custom modal)
- **R5**: 48px height, no borders/shadows, translucent background (vs transparent, vs opaque)

## Complexity Tracking

No violations — all choices align with constitution principles.

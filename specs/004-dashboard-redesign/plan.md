# Implementation Plan: Dashboard Redesign & Expert Finder

**Branch**: `004-dashboard-redesign` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-dashboard-redesign/spec.md`

## Summary

Redesign the team dashboard with tabbed navigation (Personal / Team / Expert Finder), add an Expert Finder feature for searching who's best at specific skill combinations, and enhance data display with visual progress bars and severity indicators. Requires extending the team aggregate API to include per-skill ratings and category targets, adding the shadcn `command` component for the skill picker, and restructuring `dashboard-page.tsx` around shadcn `Tabs`.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend + backend)
**Primary Dependencies**: Vite 7.3, React 19.2, shadcn/ui 4.0, Recharts 2.15, Express 5.2, cmdk (to add via shadcn command component)
**Storage**: SQLite via better-sqlite3 (`server/data/ratings.db`)
**Testing**: Manual browser testing (per constitution)
**Target Platform**: Desktop browsers (Chrome, Firefox, Safari)
**Project Type**: Web application (SPA + Express API)
**Performance Goals**: 60 FPS UI, <2s dashboard load, <500ms Expert Finder results
**Constraints**: No authentication, desktop-first, 5–20 members
**Scale/Scope**: 12 team members, ~65 skills, 9 categories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | UX & Modernité | ✅ | ✅ | Tabbed layout reduces scroll, Expert Finder is actionable |
| II | Design System | ✅ | ✅ | shadcn Tabs, Command, Badge, Progress — all from design system |
| III | Thème Light/Dark | ✅ | ✅ | All new components use shadcn tokens, auto-adapt |
| IV | Accessibilité AA+ | ✅ | ✅ | Tabs + Command have built-in keyboard nav + ARIA |
| V | Formulaires | N/A | N/A | No new forms in this feature |
| VI | Wizard/Stepper | N/A | N/A | No wizard changes |
| VII | Dashboard Radiant/Radar | ✅ | ✅ | Existing radar charts preserved, layout improved |
| VIII | Code & Architecture | ✅ | ✅ | New components follow single-responsibility, composable pattern |
| IX | Qualité & Robustesse | ✅ | ✅ | 60 FPS target, client-side computation for instant results |

**Gate result**: ALL PASS — no violations

## Project Structure

### Documentation (this feature)

```text
specs/004-dashboard-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API changes)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── ui/
│   │   └── command.tsx          # NEW: shadcn command (cmdk-based combobox)
│   ├── dashboard/
│   │   ├── personal-overview.tsx    # Existing (minor: move into tab)
│   │   ├── team-overview.tsx        # Existing (minor: move into tab)
│   │   ├── category-summary-cards.tsx  # MODIFY: add target bar
│   │   ├── category-deep-dive.tsx   # Existing (unchanged)
│   │   ├── skills-gap-table.tsx     # MODIFY: add visual bar indicators
│   │   ├── team-members-grid.tsx    # MODIFY: add top strengths
│   │   └── expert-finder.tsx        # NEW: Expert Finder component
│   ├── radar-chart.tsx              # Existing (unchanged)
│   └── theme-toggle.tsx             # Existing (unchanged)
├── lib/
│   ├── types.ts                     # MODIFY: extend aggregate types
│   └── expert-finder.ts            # NEW: client-side ranking logic
├── pages/
│   └── dashboard-page.tsx          # MODIFY: wrap in Tabs
└── data/
    └── skill-catalog.ts            # Existing (read-only)

server/
├── lib/
│   └── aggregates.ts               # MODIFY: add skillRatings + categoryTargets
└── routes/
    └── aggregates.ts               # Existing (unchanged — data comes from lib)
```

**Structure Decision**: Same monorepo structure. New files: `expert-finder.tsx` (component), `expert-finder.ts` (logic), `command.tsx` (shadcn). Modifications to 6 existing files.

## Complexity Tracking

> No violations to justify — all gates pass.

# Implementation Plan: Skill Radar v2

**Branch**: `003-skill-radar-v2` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-skill-radar-v2/spec.md`

## Summary

Full rebuild of the team skill radar application: a multi-step wizard
for self-evaluating ~65 skills across 9 categories, individual and
team dashboards with radar charts, gap analysis, premium dark/light
theming, and a REST/JSON backend. The existing v1 codebase provides a
solid foundation — the v2 plan focuses on adding React Hook Form + Zod
for validated wizard forms, structured API endpoints for all entities,
gap analysis computation, chart export, and replacing the custom theme
hook with `next-themes` for constitution compliance.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend + backend)
**Primary Dependencies**: Vite 7.3, React 19.2, shadcn/ui 4.0,
  Recharts 2.15, Express 5.2, React Hook Form (to add), Zod (to add),
  next-themes (to add), Lucide React 0.577
**Storage**: Local JSON file on disk (`server/data/ratings.json`)
**Testing**: Manual browser testing (per constitution — automated
  tests optional)
**Target Platform**: Desktop browsers (Chrome, Firefox, Safari)
**Project Type**: Web application (SPA + Express API server)
**Performance Goals**: 60 FPS UI, <2s dashboard load, <350ms theme
  transitions
**Constraints**: No authentication, no database server, 5–20 members
**Scale/Scope**: 11 team members, ~65 skills, 9 categories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | UX & Modernité | ✅ | ✅ | Desktop-first, micro-interactions, clear hierarchy |
| II | Design System | ✅ | ✅ | shadcn/ui + Form + Select + RadioGroup + Popover components |
| III | Thème Light/Dark | ⚠ | ✅ | Resolved: next-themes replaces custom hook (see R1) |
| IV | Accessibilité AA+ | ✅ | ✅ | skip-to-error via RHF setFocus + scrollIntoView |
| V | Formulaires | ⚠ | ✅ | Resolved: RHF + Zod + shadcn Form (see R2) |
| VI | Wizard/Stepper | ✅ | ✅ | One useForm per step, Zod schema per category |
| VII | Dashboard Radiant/Radar | ✅ | ✅ | SVG export + Canvas PNG export designed (see R3) |
| VIII | Code & Architecture | ✅ | ✅ | Provider pattern, single-purpose files, no dead code |
| IX | Qualité & Robustesse | ✅ | ✅ | 60 FPS, manual test checklist in quickstart.md |

**Gate result**: ALL PASS — no outstanding violations

## Project Structure

### Documentation (this feature)

```text
specs/003-skill-radar-v2/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── ui/              # shadcn/ui primitives (button, card, badge,
│   │                    #   table, tooltip, form, dialog, popover…)
│   ├── form/            # Wizard form components
│   │   ├── skill-form-wizard.tsx
│   │   ├── category-step.tsx
│   │   ├── skill-rating-row.tsx
│   │   ├── rating-legend.tsx
│   │   ├── progress-bar.tsx
│   │   ├── calibration-prompt.tsx
│   │   ├── experience-selector.tsx
│   │   └── skip-category-button.tsx
│   ├── dashboard/       # Dashboard components
│   │   ├── personal-overview.tsx
│   │   ├── team-overview.tsx
│   │   ├── team-members-grid.tsx
│   │   ├── category-summary-cards.tsx
│   │   ├── skills-gap-table.tsx
│   │   └── category-deep-dive.tsx
│   ├── radar-chart.tsx
│   ├── member-card.tsx
│   └── theme-toggle.tsx
├── data/                # Static reference data
│   ├── skill-catalog.ts     # 9 categories, ~65 skills
│   ├── rating-scale.ts      # 6 levels (0–5)
│   ├── experience-scale.ts  # Experience duration scale
│   ├── calibration-prompts.ts
│   └── team-roster.ts       # 11 members
├── hooks/
│   └── use-ratings.ts
├── lib/
│   ├── utils.ts
│   └── ratings.ts
├── pages/
│   ├── form-page.tsx
│   └── dashboard-page.tsx
├── styles/
│   └── globals.css
├── App.tsx
└── main.tsx

server/
├── data/
│   └── ratings.json     # Persistent storage
├── routes/
│   └── ratings.ts       # Existing: GET/PUT /:slug
├── index.ts             # Express entry point
└── (new routes to add)
```

**Structure Decision**: Monorepo with co-located `src/` (frontend SPA)
and `server/` (Express API). This matches the existing v1 structure.
No restructuring needed — only additions and modifications.

## Complexity Tracking

> No violations to justify — all gates pass.

# Implementation Plan: Team Skill Radar

**Branch**: `001-team-skill-radar` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-team-skill-radar/spec.md`

## Summary

Build a local web application where 11 predefined team members
rate their proficiency across ~65 skills in 9 categories via
personal links. A dashboard displays radar charts per category
(team averages) and per individual, with the viewer's chart
pinned at top. Dark/light mode supported. Data persisted in a
local JSON file.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend + backend)
**Primary Dependencies**: React 19, shadcn/ui (Radix UI),
Tailwind CSS 4, Recharts, Express.js (minimal API server)
**Storage**: Local JSON file on disk (`data/ratings.json`)
**Testing**: Manual browser testing (per constitution)
**Target Platform**: Local network, modern browsers (Chrome/Firefox/Edge)
**Project Type**: Web application (SPA + thin API server)
**Performance Goals**: Dashboard renders <2s on local network
**Constraints**: No external services, no database, no auth
**Scale/Scope**: 11 users, ~65 skills, 9 categories, 2 pages
(form + dashboard)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Modern & Beautiful UI | PASS | shadcn/ui for all components, Tailwind CSS theming, dark/light mode, Recharts radar charts as visual centerpiece |
| II. Clean & Optimized Code | PASS | Single-responsibility file structure, Prettier + ESLint configured, Recharts lazy-loaded |
| III. Simplicity First | PASS | Local JSON file storage, no auth, no external services, hardcoded roster, minimal scope |
| Tech: React + TypeScript | PASS | Vite + React + TypeScript |
| Tech: shadcn/ui | PASS | All interactive components use shadcn/ui |
| Tech: Recharts | PASS | Radar charts via Recharts |
| Tech: Tailwind CSS | PASS | shadcn/ui default styling system |
| Tech: Vite | PASS | Build tool |
| Tech: Local JSON storage | PASS | `data/ratings.json` |

All gates pass. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-team-skill-radar/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── skill-descriptors.md # Phase 1 output (~65 skills × 6 levels)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── index.ts             # Express server entry point
├── routes/
│   └── ratings.ts       # GET/PUT /api/ratings/:slug
└── data/
    └── ratings.json     # Persisted ratings (gitignored)

src/
├── main.tsx             # React entry point
├── App.tsx              # Router setup
├── data/
│   ├── team-roster.ts   # Hardcoded 11 members + roles + slugs
│   ├── skill-catalog.ts # 9 categories, ~65 skills + descriptors
│   ├── rating-scale.ts  # Anchored scale labels + descriptions
│   ├── experience-scale.ts   # Experience duration scale (0-4)
│   └── calibration-prompts.ts # Per-category scenario prompts
├── lib/
│   ├── utils.ts         # shadcn/ui cn() helper
│   └── ratings.ts       # Average calculation, gap analysis helpers
├── hooks/
│   ├── use-ratings.ts   # Fetch/submit ratings API calls
│   └── use-theme.ts     # Dark/light mode toggle + persistence
├── components/
│   ├── ui/              # shadcn/ui generated components
│   ├── radar-chart.tsx  # Recharts radar wrapper component
│   ├── form/
│   │   ├── skill-form-wizard.tsx  # Multi-step wizard container
│   │   ├── category-step.tsx      # Single category step
│   │   ├── skill-rating-row.tsx   # Button row (? 1 2 3 4 5)
│   │   ├── rating-legend.tsx      # Always-visible scale legend
│   │   ├── progress-bar.tsx       # Step progress indicator
│   │   ├── experience-selector.tsx # Duration picker per skill
│   │   ├── skip-category-button.tsx # Skip entire category
│   │   └── calibration-prompt.tsx  # Displays scenario before ratings
│   ├── dashboard/
│   │   ├── personal-overview.tsx  # 9-axis personal radar (pinned)
│   │   ├── team-overview.tsx      # 9-axis team avg + viewer overlay
│   │   ├── category-summary-cards.tsx  # 9 metric cards
│   │   ├── category-deep-dive.tsx # Per-category skill-level radars
│   │   ├── skills-gap-table.tsx   # Sortable table + risk colors
│   │   └── team-members-grid.tsx  # Mini radar cards per member
│   ├── member-card.tsx  # Individual member radar + info
│   └── theme-toggle.tsx # Dark/light switcher
├── pages/
│   ├── form-page.tsx    # /form/:slug — skill assessment wizard
│   └── dashboard-page.tsx # /dashboard/:slug? — full dashboard
└── styles/
    └── globals.css      # Tailwind directives + shadcn/ui theme

public/
└── (Vite static assets)

tailwind.config.ts
vite.config.ts
tsconfig.json
package.json
.prettierrc
eslint.config.js
```

**Structure Decision**: Single project with a thin Express
backend (`server/`) serving both the API and the Vite-built
SPA (`src/`). This is the simplest architecture that satisfies
the requirement for JSON file persistence while keeping
everything in one `npm run dev` command.

## Complexity Tracking

> No violations. Table intentionally left empty.

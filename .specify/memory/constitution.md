<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified sections:
  - Tech Constraints: pinned React + shadcn/ui + Recharts stack
  - I. Modern & Beautiful UI: added shadcn/ui component rules
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no update needed (generic)
  - .specify/templates/spec-template.md ✅ no update needed (generic)
  - .specify/templates/tasks-template.md ✅ no update needed (generic)
- Follow-up TODOs: none
-->

# Radiant Graph Constitution

## Core Principles

### I. Modern & Beautiful UI

All user-facing pages MUST follow modern web design standards:

- Dark mode and light mode MUST both be supported with a
  user-togglable theme switcher
- Layout MUST be responsive and work on desktop screens
  (mobile is not a priority but layout MUST NOT break)
- Visual hierarchy MUST be clear: typography, spacing, and
  color contrast MUST meet WCAG AA at minimum
- The radar/radiant chart MUST be the visual centerpiece of
  the application
- Prefer subtle animations and transitions over static UI
  where they add clarity
- All interactive components (buttons, inputs, cards,
  dialogs, etc.) MUST use shadcn/ui — no custom components
  when a shadcn/ui primitive exists

### II. Clean & Optimized Code

Code MUST be concise, readable, and free of dead code:

- No unused imports, variables, or commented-out blocks
- Functions MUST do one thing; files MUST have a single
  clear responsibility
- Avoid premature abstraction — inline is fine until
  duplication actually occurs
- Bundle size and runtime performance MUST be considered:
  lazy-load heavy dependencies (e.g., chart library)
- Consistent formatting enforced via tooling (Prettier,
  ESLint or equivalent)

### III. Simplicity First

This is a quick internal tool, not a product. Scope MUST
stay minimal:

- Local-first: no external database or cloud service
  required to run
- Data persistence via flat file (JSON) is acceptable
- No authentication required — this runs on a trusted
  local network
- Features MUST directly serve the goal: collect skill
  ratings via a form and display them as a radar graph
- If a feature does not help visualize team skills, it is
  out of scope

## Tech Constraints

- **Runtime**: Node.js (LTS)
- **Frontend**: React + TypeScript
- **UI components**: shadcn/ui (built on Radix UI primitives)
- **Styling**: Tailwind CSS — shadcn/ui's default styling
  system; use its theming for dark/light mode
- **Charting**: Recharts (radar/spider chart) — already a
  shadcn/ui-compatible React charting library
- **Storage**: Local JSON file on disk — no database server
- **Build tool**: Vite
- **Package manager**: npm, pnpm, or bun

## Development Workflow

- Commit often with clear messages
- Keep PRs small and focused on a single concern
- Lint and format before every commit
- Manual browser testing is sufficient — automated tests
  are optional given the project scope
- Ship working increments: form first, then chart, then
  polish

## Governance

This constitution is lightweight by design. It captures the
project's quality bar without ceremony:

- Amendments are made by editing this file directly
- No formal approval process — the project owner decides
- Any change to principles MUST be reflected in active
  specs and plans
- Version follows semver: MAJOR for principle
  removals/redefinitions, MINOR for additions, PATCH for
  wording fixes

**Version**: 1.1.0 | **Ratified**: 2026-03-09 | **Last Amended**: 2026-03-09

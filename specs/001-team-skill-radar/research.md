# Research: Team Skill Radar

**Phase 0 output** | **Date**: 2026-03-09

## R1: React + Express single-project setup with Vite

**Decision**: Use Vite for the React SPA with a separate
Express server in `server/`. In development, Vite dev server
proxies API calls to Express. In production, Express serves
the built `dist/` folder.

**Rationale**: Vite's proxy config makes this seamless. No
need for a monorepo tool. A single `package.json` keeps
dependencies unified. Express is the lightest option for
serving a JSON file API.

**Alternatives considered**:
- Next.js: Overkill for a local tool, adds SSR complexity.
- Hono/Fastify: Viable but Express has the largest ecosystem
  and the API is trivial (2 endpoints).
- Static SPA only (no server): Cannot write to disk from
  browser — a server is required for JSON persistence.

## R2: Recharts radar chart configuration

**Decision**: Use `<RadarChart>` from Recharts with
`<PolarGrid>`, `<PolarAngleAxis>`, `<PolarRadiusAxis>`, and
multiple `<Radar>` layers for overlaying individual vs team
average.

**Rationale**: Recharts is React-native, tree-shakeable, and
its radar chart supports multiple data series overlay natively.
shadcn/ui has chart components built on Recharts.

**Alternatives considered**:
- Chart.js (react-chartjs-2): Requires canvas, less React-
  idiomatic, harder to style with Tailwind.
- D3 directly: Too low-level for this scope.
- Apache ECharts: Heavy bundle, overkill.

## R3: Dark/light mode with shadcn/ui + Tailwind

**Decision**: Use shadcn/ui's built-in theme system based on
CSS variables + Tailwind's `dark:` variant. Store preference
in `localStorage`. Apply `class="dark"` on `<html>` element.

**Rationale**: This is shadcn/ui's recommended approach. No
extra library needed. The `next-themes` pattern works in
plain React by toggling the class manually.

**Alternatives considered**:
- next-themes: Designed for Next.js, unnecessary dependency.
- CSS media query only: Doesn't allow user toggle.

## R4: JSON file storage strategy

**Decision**: Store all ratings in a single `data/ratings.json`
file. Structure as `{ [slug]: { ratings: {...}, updatedAt } }`.
Use `fs.readFileSync`/`fs.writeFileSync` with a simple
read-modify-write pattern.

**Rationale**: With 11 users and no concurrent writes expected,
file locking is unnecessary. The file is small (<10KB). Atomic
writes can be achieved by writing to a temp file then renaming.

**Alternatives considered**:
- SQLite: Adds a dependency for trivial data.
- One file per user: Complicates aggregation queries.
- localStorage only: Cannot share data across browsers/users.

## R5: Routing strategy (SPA)

**Decision**: Use React Router v7 with two routes:
- `/form/:slug` — skill assessment form
- `/dashboard/:slug?` — radar dashboard (slug optional)

The Express server serves the API under `/api/*` and falls
back to `index.html` for all other routes (SPA routing).

**Rationale**: React Router is the standard for React SPAs.
Two routes keep navigation simple. Optional slug parameter
on dashboard handles both personal and generic views.

**Alternatives considered**:
- TanStack Router: More type-safe but heavier learning curve
  for a 2-route app.
- No router (conditional render): Loses URL shareability.

## Summary

All technical decisions resolved. No NEEDS CLARIFICATION
items remain. Stack is fully defined:

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS 4 |
| Charts | Recharts (RadarChart) |
| Routing | React Router v7 |
| Backend | Express.js (TypeScript) |
| Storage | Local JSON file |
| Theme | CSS variables + dark class toggle |

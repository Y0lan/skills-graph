# Quickstart: Skill Radar v2

## Prerequisites

- Node.js 22+ (LTS)
- npm (or pnpm/bun)

## Setup

```bash
# Install dependencies (includes new: react-hook-form, zod,
# @hookform/resolvers, next-themes)
npm install

# Start dev server (frontend + backend concurrently)
npm run dev
```

This starts:
- **Vite** dev server on `http://localhost:5173` (frontend)
- **Express** API on `http://localhost:3001` (backend)
- Vite proxies `/api` requests to Express

## Routes

| Route | Description |
|-------|-------------|
| `/form/:slug` | Evaluation wizard for a member |
| `/dashboard/:slug` | Individual member dashboard |
| `/dashboard` | Team dashboard (no slug) |

Example: `http://localhost:5173/form/yolan-maldonado`

## Data

- **Skill catalog**: `src/data/skill-catalog.ts` (9 categories, ~65 skills)
- **Team roster**: `src/data/team-roster.ts` (11 members)
- **Rating scale**: `src/data/rating-scale.ts` (6 levels, 0–5)
- **Target scores**: `server/data/targets.json` (per role × category)
- **Ratings storage**: `server/data/ratings.json` (auto-created)

## API

Base: `http://localhost:3001/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | Skill catalog |
| GET | `/api/members` | Team members |
| GET | `/api/ratings/:slug` | Member's ratings |
| PUT | `/api/ratings/:slug` | Save ratings (autosave) |
| POST | `/api/ratings/:slug/submit` | Finalize submission |
| GET | `/api/aggregates/:slug` | Member dashboard data |
| GET | `/api/aggregates` | Team dashboard data |

## Verification Checklist

1. **Wizard**: Open `/form/yolan-maldonado` → rate skills → next step
   → verify autosave (check `server/data/ratings.json`)
2. **Resume**: Reload the page → verify progress restored
3. **Submit**: Complete all steps → Review & Confirm → Submit
4. **Dashboard**: Open `/dashboard/yolan-maldonado` → radar chart
   visible with 9 axes
5. **Team overlay**: Toggle "Moyenne équipe" → second series appears
6. **Theme**: Click theme toggle → verify instant switch, no flash
7. **Reload theme**: Reload page → theme persists
8. **Gap analysis**: Open `/dashboard` → verify gap table shows
   top 3 gaps per member
9. **Export**: Click export button → PNG/SVG downloads correctly
10. **Accessibility**: Tab through form controls → focus visible,
    ARIA labels present

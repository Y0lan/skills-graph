# my-project Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-09

## Active Technologies
- TypeScript 5.x + React 19, shadcn/ui, Recharts (unchanged) (002-french-translation)
- Local JSON file (unchanged — keys remain English) (002-french-translation)
- TypeScript 5.9 (frontend + backend) + Vite 7.3, React 19.2, shadcn/ui 4.0, (003-skill-radar-v2)
- Local JSON file on disk (`server/data/ratings.json`) (003-skill-radar-v2)
- TypeScript 5.x + React 19 + shadcn/ui (Radix UI), Tailwind CSS, Lucide icons (005-fix-form-layout)
- N/A (no data changes) (005-fix-form-layout)
- TypeScript 5.x (frontend + backend) + React 19, Vite 7, shadcn/ui (Radix UI), Tailwind CSS, Lucide icons, next-themes, React Router DOM, React Hook Form (006-minimal-header)
- SQLite (better-sqlite3) — existing `evaluations` table, existing `DELETE /api/ratings/:slug` endpoint (006-minimal-header)
- TypeScript 5.x + React 19, shadcn/ui (Radix UI AlertDialog), Tailwind CSS, Lucide icons, react-router-dom (006-minimal-header)
- N/A (uses existing `DELETE /api/ratings/:slug` endpoint) (006-minimal-header)
- TypeScript 5.9 (frontend + backend) + @azure/msal-browser ^5.4.0, @azure/msal-react ^5.0.6 (frontend); jose ^6.2.1 (backend) (008-microsoft-auth)
- SQLite (better-sqlite3) — new `users` table, existing `evaluations` table unchanged (008-microsoft-auth)

- TypeScript 5.x (frontend + backend) + React 19, shadcn/ui (Radix UI), (001-team-skill-radar)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (frontend + backend): Follow standard conventions

## Recent Changes
- 008-microsoft-auth: Added TypeScript 5.9 (frontend + backend) + @azure/msal-browser ^5.4.0, @azure/msal-react ^5.0.6 (frontend); jose ^6.2.1 (backend)
- 006-minimal-header: Added TypeScript 5.x + React 19, shadcn/ui (Radix UI AlertDialog), Tailwind CSS, Lucide icons, react-router-dom
- 006-minimal-header: Added TypeScript 5.x (frontend + backend) + React 19, Vite 7, shadcn/ui (Radix UI), Tailwind CSS, Lucide icons, next-themes, React Router DOM, React Hook Form


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

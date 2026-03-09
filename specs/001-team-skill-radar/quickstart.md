# Quickstart: Team Skill Radar

## Prerequisites

- Node.js 20+ (LTS)
- npm, pnpm, or bun

## Setup

```bash
# Clone and enter the project
cd my-project

# Install dependencies
npm install

# Start development (frontend + backend concurrently)
npm run dev
```

This starts:
- **Vite dev server** on `http://localhost:5173` (frontend
  with HMR)
- **Express API server** on `http://localhost:3001` (backend)
- Vite proxies `/api/*` requests to the Express server

## Usage

### 1. Send personal form links to team members

Each member has a unique form URL:

| Member | Form URL |
|--------|----------|
| Yolan MALDONADO | `http://localhost:5173/form/yolan-maldonado` |
| Alexandre THOMAS | `http://localhost:5173/form/alexandre-thomas` |
| Alan HUITEL | `http://localhost:5173/form/alan-huitel` |
| Pierre-Mathieu BARRAS | `http://localhost:5173/form/pierre-mathieu-barras` |
| Andy MALO | `http://localhost:5173/form/andy-malo` |
| Steven NGUYEN | `http://localhost:5173/form/steven-nguyen` |
| Matthieu ALCIME | `http://localhost:5173/form/matthieu-alcime` |
| Martin VALLET | `http://localhost:5173/form/martin-vallet` |
| Nicole NGUON | `http://localhost:5173/form/nicole-nguon` |
| Bethlehem MENGISTU | `http://localhost:5173/form/bethlehem-mengistu` |
| Pierre ROSSATO | `http://localhost:5173/form/pierre-rossato` |

### 2. View the dashboard

- **Generic dashboard** (no pinning):
  `http://localhost:5173/dashboard`
- **Personal dashboard** (your chart pinned at top):
  `http://localhost:5173/dashboard/yolan-maldonado`

### 3. Toggle dark/light mode

Click the theme toggle button in the top-right corner of
any page.

## Production build

```bash
# Build the frontend
npm run build

# Start the production server
npm start
```

The Express server serves the built SPA from `dist/` and
the API from `/api/*`. Access at `http://localhost:3001`.

## Data

Ratings are stored in `server/data/ratings.json`. This file
is created automatically on first submission. To reset all
data, delete this file and restart the server.

## Verification checklist

- [ ] Open a form link → name and role are pre-filled
- [ ] Rate skills and submit → confirmation shown
- [ ] Reopen same link → previous ratings pre-filled
- [ ] Open dashboard → radar charts render per category
- [ ] Open personal dashboard → your chart at the top
- [ ] Toggle dark/light mode → theme switches and persists
- [ ] Restart server → all data still present

# Quickstart: Dashboard Redesign & Expert Finder

## Prerequisites

- Node.js 22+ (LTS)
- Existing data: at least 2 members with submitted evaluations in the database

## Setup

```bash
# Install new dependency (cmdk for combobox)
npm install

# Start dev server
npm run dev
```

## Routes (unchanged)

| Route | Description |
|-------|-------------|
| `/dashboard` | Team dashboard (default tab: Équipe) |
| `/dashboard/:slug` | Member dashboard (default tab: Mon profil) |

## New UI Sections

The dashboard now has 3 tabs:

| Tab | Content |
|-----|---------|
| Mon profil | Personal radar chart, individual gaps (only when slug present) |
| Équipe | Team overview, category cards, deep-dive, gap table, member grid |
| Expert Finder | Skill search combobox, ranked member results |

## Verification Checklist

1. **Tab navigation**: Open `/dashboard/yolan-maldonado` → 3 tabs visible → click each → content switches instantly
2. **Default tabs**: `/dashboard/:slug` defaults to "Mon profil" tab; `/dashboard` defaults to "Équipe" tab
3. **Expert Finder**: Switch to Expert Finder tab → select "Java" → see ranked members → add "SQL" → ranking updates
4. **Category filter**: In Expert Finder, filter by category → skill list narrows → select skill → results show
5. **Empty state**: Select a skill nobody rated → "Aucun membre" message shown
6. **Category cards**: Check team intelligence tab → cards show bar with target marker
7. **Gap table**: Verify visual bar indicators alongside severity badges
8. **Member strengths**: Member grid cards show top strengths + top gaps
9. **Theme**: Toggle dark/light → all new UI elements adapt correctly
10. **Keyboard**: Tab through skill picker, tab navigation, results — all focusable

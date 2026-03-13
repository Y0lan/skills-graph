# Quickstart: French-Only Translation

## What this feature does

Replaces all English user-facing text with French. No new files, no new dependencies, no architecture changes.

## Files to modify (in order)

1. `src/data/rating-scale.ts` — 6 level names + descriptions
2. `src/data/calibration-prompts.ts` — 9 scenario paragraphs
3. `src/data/skill-catalog.ts` — ~390 descriptor strings (bulk of work)
4. `src/components/form/*.tsx` — UI labels (legend, progress, buttons, skip)
5. `src/components/dashboard/*.tsx` — card titles, table headers, badges
6. `src/components/radar-chart.tsx` — legend names
7. `src/components/theme-toggle.tsx` — aria-labels
8. `src/pages/form-page.tsx` — messages, links, date locale
9. `src/pages/dashboard-page.tsx` — title, status messages
10. `src/App.tsx` — loading fallback

## Verification

```bash
npx tsc -b          # Type check
npx eslint src/     # Lint
npx vite build      # Build
```

Then manual browser check: navigate form and dashboard, verify all text is French.

## Key rules

- Technical terms (Java, Docker, OAuth2, etc.) stay in English
- Skill labels that are product names stay unchanged
- Use `'fr-FR'` locale for date formatting
- No i18n framework — hardcode French directly

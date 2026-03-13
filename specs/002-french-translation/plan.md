# Implementation Plan: French-Only Translation

**Branch**: `002-french-translation` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-french-translation/spec.md`

## Summary

Translate all user-facing strings in the app from English to French. This is a content-only change — no architecture, dependencies, or data model modifications. Strings are hardcoded directly in source files (no i18n framework). The ~550 translatable strings span data files (rating scale, skill catalog, calibration prompts), form components, and dashboard components.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React 19, shadcn/ui, Recharts (unchanged)
**Storage**: Local JSON file (unchanged — keys remain English)
**Testing**: Manual browser verification + ESLint + tsc
**Target Platform**: Web (Vite dev server)
**Project Type**: Web application (internal tool)
**Performance Goals**: N/A (no performance impact)
**Constraints**: N/A
**Scale/Scope**: ~550 translatable strings across ~15 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Modern & Beautiful UI | PASS | No UI structure changes — only text content |
| II. Clean & Optimized Code | PASS | No new abstractions — inline string replacement |
| III. Simplicity First | PASS | Hardcoded French, no i18n framework overhead |
| Tech Constraints | PASS | No new dependencies or tech changes |

All gates pass. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-french-translation/
├── plan.md              # This file
├── research.md          # Phase 0: translation reference
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Quality checklist
```

### Source Code (files to modify)

```text
src/
├── data/
│   ├── rating-scale.ts          # 6 level names + descriptions
│   ├── calibration-prompts.ts   # 9 category prompts
│   └── skill-catalog.ts         # ~65 skills × 6 descriptors = ~390 strings
├── components/
│   ├── form/
│   │   ├── rating-legend.tsx    # Legend instruction text
│   │   ├── progress-bar.tsx     # "Step X/Y" label
│   │   ├── calibration-prompt.tsx  # "Before you rate:" label
│   │   ├── category-step.tsx    # Skipped category message
│   │   ├── skill-form-wizard.tsx   # Button labels
│   │   └── skip-category-button.tsx  # Skip/undo labels
│   ├── dashboard/
│   │   ├── category-summary-cards.tsx  # Card labels
│   │   ├── skills-gap-table.tsx        # Table headers, risk badges
│   │   ├── team-members-grid.tsx       # Section title
│   │   ├── team-overview.tsx           # Section title
│   │   └── personal-overview.tsx       # Section title
│   ├── radar-chart.tsx          # Legend names
│   ├── member-card.tsx          # (no text changes needed)
│   └── theme-toggle.tsx         # aria-labels
├── pages/
│   ├── form-page.tsx            # All messages, labels, links
│   └── dashboard-page.tsx       # Title, status messages
└── App.tsx                      # Loading fallback
```

**Structure Decision**: No new files or directories — all changes are in-place string replacements in existing files.

## Translation Strategy

### Approach: Direct in-file replacement

Since FR-009 mandates no i18n framework, all translations are applied by editing strings directly in source files. This keeps the codebase simple and avoids unnecessary abstraction for a single-language app.

### File grouping by effort

1. **High effort** (~390 strings): `skill-catalog.ts` — bulk of the work, 65 skills with 6 descriptors each
2. **Medium effort** (~20 strings): `rating-scale.ts`, `calibration-prompts.ts` — longer text blocks
3. **Low effort** (~50 strings): All component files — short UI labels, messages, button text
4. **Date formatting** (1 location): `form-page.tsx` — switch `toLocaleString()` to use `'fr-FR'` locale

### Translation guidelines

- Technical terms (Java, Docker, Kubernetes, OAuth2, etc.) remain in English
- Skill labels that are product names remain unchanged
- Category labels use natural French with proper accents
- Rating level names: Inconnu, Notions, Guidé, Autonome, Avancé, Expert
- Tone: professional but approachable, matching the existing calibration prompt style
- Domain knowledge category is already mostly in French — verify and polish only

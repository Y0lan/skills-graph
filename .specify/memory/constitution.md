<!--
Sync Impact Report
- Version change: 2.0.0 → 3.0.0
- Product renamed: Radiant Graph → Radar des Compétences d'Équipe
- Modified principles:
  - I. UX & Modernité → redefined (desktop-first, gestures,
    focus states, messages actionnables)
  - II. Design System → redefined (Lucide icons, own-the-code,
    grille/radius/ombres specifics)
  - III. Thème Light/Dark d'Exception → redefined (specific
    next-themes config attributes, 200–350 ms timings)
  - IV. Accessibilité → redefined as AA+ (skip-to-error,
    chart keyboard/screen-reader a11y)
- Added principles:
  - V. Formulaires (React Hook Form + Zod, validation
    progressive, scroll-to-error)
  - VI. Wizard/Stepper (états done/active/locked, reprise
    reload, review & confirm)
  - VII. Dashboard Radiant/Radar (RadarChart 5–9 axes,
    overlay multi-profils, export PNG/SVG)
- Merged principles:
  - old VI. Fiabilité + old VII. Ambition Qualité
    → IX. Qualité & Robustesse (adds 60 FPS target)
- Kept (renumbered):
  - old V. Code & Architecture → VIII. Code & Architecture
- Added sections:
  - Aide IA (Claude) — shadcn/ui skill activation
- Tech Constraints: major update (Vite 7, Express 5 backend,
  React Hook Form + Zod, Lucide icons)
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no update needed
  - .specify/templates/spec-template.md ✅ no update needed
  - .specify/templates/tasks-template.md ✅ no update needed
  - No command files exist
- Follow-up TODOs: none
-->

# Radar des Compétences d'Équipe — Constitution

App web interne pour évaluer et visualiser les compétences
techniques d'une équipe.

## Core Principles

### I. UX & Modernité

L'expérience DOIT être fluide, élégante et instantanée :

- Desktop-first — aucun support mobile requis ; le layout
  NE DOIT PAS casser sur écrans larges
- Priorité absolue à la lisibilité, à l'intention claire
  et à l'absence de friction
- Micro-interactions subtiles : hover, transitions douces,
  feedback visuel clair
- Focus states évidents, messages concis et actionnables
- Minimalisme, cohérence et hiérarchie visuelle maîtrisée —
  éviter toute surcharge
- Vue « vraiment utile et actionnable » des compétences
  à l'échelle individu + équipe

### II. Design System

Tout composant UI DOIT s'inscrire dans le design system :

- Base : shadcn/ui (tokens, composants, layout, typographie)
  — on « own le code » et on l'adapte si besoin, sans
  abstractions inutiles
- Inspiration visuelle & qualité d'animation : kibo-ui.com
  → transitions modernes, composants polis, esthétique
  « premium »
- Tokens couleur : OKLCH, CSS variables organisées par rôle
  (bg, fg, border, accent)
- Icônes : Lucide exclusivement
- Espacements, grille et typographie DOIVENT être
  systématisés ; radius cohérents, ombres subtiles

### III. Thème Light/Dark d'Exception

Le theming DOIT être irréprochable :

- `next-themes` avec `attribute="class"`,
  `defaultTheme="system"`, `enableSystem`,
  `disableTransitionOnChange`,
  `suppressHydrationWarning` sur `<html>`
- Provider au plus haut niveau (layout) pour éviter tout
  FOUC / hydration mismatch
- Gestion du mode « system » et persistance locale
- Switch icon-only premium (Sun ↔ Moon) avec
  micro-rotation / fade / scale inspiré kibo-ui
- Transitions globales 200–350 ms `ease-out`
- Charts DOIVENT s'adapter automatiquement au thème
  via tokens shadcn

### IV. Accessibilité (AA+)

L'accessibilité DOIT être respectée à tout moment :

- Contraste AA minimum garanti en clair comme en sombre
- Ordre tab logique ; interactions clavier 100 % supportées
- ARIA correct pour états et erreurs ; feedback visuel
  au focus
- « skip-to-error » sur les formulaires
- Tooltips et légendes des charts DOIVENT être lisibles
  clavier + screen-reader

### V. Formulaires

Les formulaires DOIVENT suivre un standard strict :

- **React Hook Form + Zod** : schémas typés, validation
  côté client
- Erreurs in-line + résumé global, `scroll-to-error`
- Hints / descriptions sur les champs
- Gestion des états : idle / submitting / success
- Validation progressive (onBlur / onChange selon champ)
- Messages courts « problème → solution »

### VI. Wizard / Stepper

Les parcours multi-étapes DOIVENT être guidés :

- États explicites : done / active / locked
- Validation par étape avant passage à la suivante
- Reprise de progression si reload (persistance locale)
- Étape finale « Review & Confirm » claire
- Transitions entre étapes : 200–300 ms

### VII. Dashboard Radiant / Radar

Le dashboard DOIT être la pièce maîtresse de l'application :

- Visualisation principale : **RadarChart** Recharts
  (5–9 axes ; par défaut 9 catégories)
- Overlay multi-profils, tooltips riches, légende toggle
- Tokens shadcn → couleurs lisibles en light / dark
- Export PNG / SVG
- Responsive sur écrans desktop

### VIII. Code & Architecture

Le code DOIT être lisible, typé, simple et composable :

- Composants UI strictement dérivés de shadcn/ui — pas de
  duplication inutile
- Structure claire : `providers.tsx`, `layout.tsx`,
  `components/ui`
- Pas de logique dispersée : regroupement du theming dans
  un provider unique
- Fonctions à responsabilité unique, fichiers à rôle clair
- Aucun import, variable ou bloc de code mort

### IX. Qualité & Robustesse

Le code et l'interface DOIVENT atteindre un niveau premium :

- Aucun warning React, SSR ou hydration mismatch
- Strict mode compatible
- 60 FPS visé ; composants isolables
- Animations micro-polies, états actifs/hover précis,
  arrondis cohérents, ombres subtiles
- Référence visuelle : kibo-ui.com — chaque détail DOIT
  être intentionnel et soigné
- Tests manuels systématiques : persistance préférences,
  validation étape, theming charts, accessibilité

## Tech Constraints

- **Runtime**: Node.js (LTS)
- **Frontend**: Vite 7 + React 19 + TypeScript 5.x
- **UI components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS — OKLCH tokens via CSS variables
- **Theming**: `next-themes` + `.dark` class strategy
- **Icons**: Lucide
- **Charts**: shadcn Charts (Recharts) avec adaptation
  automatique au thème via tokens
- **Forms**: React Hook Form + Zod
- **Design reference**: kibo-ui.com
- **Backend**: Express 5 — REST/JSON, endpoints CRUD
  (membres, compétences, évaluations)
- **Storage**: Local JSON file on disk — no database server
- **Auth**: Interne uniquement (SSO hors scope)
- **Package manager**: npm, pnpm, or bun

## Aide IA (Claude)

- Activer la **Skill shadcn/ui** (détection de
  `components.json` + `shadcn info --json`) pour guider
  l'agent sur les bons API / patterns shadcn

## Development Workflow

- Commit often with clear messages
- Keep PRs small and focused on a single concern
- Lint and format before every commit
- Tests manuels systématiques : persistance thème,
  mode system, transitions, validation formulaires,
  accessibilité, absence de warnings React
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

**Version**: 3.0.0 | **Ratified**: 2026-03-09 | **Last Amended**: 2026-03-10

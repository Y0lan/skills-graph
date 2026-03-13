# Research: Skill Radar v2

## R1. Theme Management — next-themes vs alternatives for Vite

**Decision**: Use `next-themes` if it works cleanly with Vite 7 +
React 19. If compatibility issues arise during implementation, fall
back to `better-themes` (explicitly designed for Vite) or enhance
the existing custom `use-theme.ts` hook.

**Rationale**: Constitution Principle III mandates `next-themes`.
Research confirms `next-themes` is technically framework-agnostic
(zero dependencies, works outside Next.js). However, it was designed
with Next.js SSR in mind and has no official Vite documentation.
The package `better-themes` (npm) is a modern alternative explicitly
supporting Vite, Remix, and TanStack Start with the same API:
`attribute="class"`, `defaultTheme="system"`, `enableSystem`,
`disableTransitionOnChange`.

**FOUC prevention in Vite SPA**: Add an inline `<script>` in
`index.html` `<head>` before any other scripts:

```html
<script>
  (() => {
    const theme = localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  })();
</script>
```

The `suppressHydrationWarning` on `<html>` prevents React warnings
about the pre-applied class.

**Alternatives considered**:
- `better-themes`: Best Vite-native option if `next-themes` has issues.
- Keep custom `use-theme.ts`: Already works but lacks
  `disableTransitionOnChange` and constitution compliance.
- `theme-change` / `usehooks-ts`: Less mature.

## R2. Form Management — React Hook Form + Zod + shadcn/ui

**Decision**: Add `react-hook-form`, `zod`, `@hookform/resolvers`.
Use shadcn/ui `Form` component (which wraps React Hook Form).

**Rationale**: Constitution Principle V mandates React Hook Form + Zod.
shadcn/ui provides a `Form` component that integrates seamlessly:
`<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`,
`<FormControl>`, `<FormMessage>`.

**Wizard pattern**: Use a **single `useForm()`** for the entire wizard
(all ~65 skills). The form state persists across steps — only the
visible step changes. Each step validates its category's fields via
`form.trigger(['ratings.java', 'ratings.python', ...])` before
unlocking the next step.

**Why single form over per-step forms**: Per-step forms require
merging state across steps, make "go back and edit" harder, and
risk data loss. A single form with `z.record(z.string(),
z.number().min(0).max(5))` handles the dynamic ~65 skill IDs
cleanly without per-skill schema definitions.

**Autosave pattern**: Use `useWatch({ control })` with a debounced
callback (800ms). On each debounced change, PUT to
`/api/ratings/:slug`. Gate on `form.formState.isDirty` to avoid
unnecessary saves.

**Scroll-to-error**: Use `form.trigger(fieldsInCurrentStep)` on
step transition. On failure, find the first errored field via
`form.formState.errors`, query `[data-skill="<skillId>"]`, and
call `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`.

**New shadcn components to add**: `form`, `select`, `radio-group`,
`popover`, `dialog`, `separator`, `progress`, `tabs`.

**Alternatives considered**:
- Formik + Yup: Heavier, less TypeScript integration.
- Tanstack Form: Newer but less shadcn/ui integration.
- Per-step `useForm()`: More complex state management, risk of
  data loss on navigation.
- No form library (current approach): Lacks validation, error
  handling, and doesn't satisfy constitution.

## R3. Radar Chart Export — PNG/SVG

**Decision**: Use `recharts-to-png` for PNG export (wraps html2canvas,
purpose-built for Recharts). Use direct SVG serialization for SVG
export.

**Rationale**: Recharts has **no built-in export API**. The chart
renders as SVG, but tooltips and legends are HTML elements rendered
via React portals outside the SVG container.

**PNG export** (`recharts-to-png`):
- Provides a `useCurrentPng` hook that returns a download promise
- Captures both SVG chart and HTML legends/tooltips
- Compatible with Recharts 2.15.4 (our version)
- Fallback: use `html2canvas` directly if compatibility issues arise

**SVG export** (direct serialization):
1. Get the `<svg>` element via a ref on the chart container
2. Serialize with `new XMLSerializer().serializeToString(svgElement)`
3. Trigger download as `.svg` file
4. Note: this captures only the SVG — legends/tooltips are excluded

**Key gotchas from research**:
- `ResponsiveContainer` uses percentage widths — wrap in a
  fixed-dimension container (e.g., 800×600) during export
- CSS variables (`var(--chart-1)`) must be computed/resolved
  before canvas conversion — test both themes
- Tooltips are HTML portals, not part of the SVG tree
- The overlay radar (member + team) exports correctly since both
  are SVG `<Polygon>` elements in the same container

**Alternatives considered**:
- `html2canvas` directly: Works but more verbose, no Recharts-
  specific optimizations.
- `dom-to-image`: Known issues with CSS variables.
- `html-to-image`: Less community support for Recharts.

## R4. Aggregate Computation

**Decision**: Compute aggregates on the server side in the
`GET /api/aggregates` endpoints. No separate storage.

**Rationale**: With 11 members and ~65 skills, computation is trivial
(<1ms). Pre-computing and storing aggregates would add complexity
(cache invalidation on rating changes) for no performance benefit.

**Algorithm**:
1. Load all ratings from `ratings.json`
2. Load targets from `targets.json`
3. For each member, for each category:
   - Filter skills in category
   - Compute average rank (exclude N/A / -2 values)
4. For team averages: mean of all submitted members' category averages
5. For gap: `targetRank - avgRank` per role × category
6. Sort gaps descending, take top 3

**Alternatives considered**:
- Client-side computation: Possible but puts logic in frontend,
  harder to maintain consistency.
- Pre-computed JSON file: Adds cache invalidation complexity.

## R5. Existing Code Compatibility

**Key observations from v1 codebase**:

1. **Rating labels mismatch**: Spec says "Débutant, Intermédiaire,
   Avancé, Confirmé" but existing code uses "Notions, Guidé,
   Autonome, Avancé". **Decision**: Keep the existing labels — they
   are more precise and already have calibrated descriptions per skill.

2. **Experience scale**: Existing code has a secondary "experience
   duration" dimension (0–4: Never → 5+ years) not mentioned in spec.
   **Decision**: Keep it — it adds value and is already implemented.

3. **Skipped categories**: Existing code supports skipping entire
   categories (`skippedCategories` array). This maps to the spec's
   N/A feature (FR-010). **Decision**: Keep and extend — N/A per
   skill maps to `ratings[skillId] = -2`.

4. **Member validation**: Server hardcodes `VALID_SLUGS` set.
   **Decision**: Replace with dynamic lookup from `team-roster.ts`
   data (imported at server startup).

5. **Routes**: Existing `/form/:slug` and `/dashboard/:slug?` match
   spec's `/rate/:memberId` and `/dashboard/:memberId`. **Decision**:
   Keep existing route paths (slug-based). The spec's `:memberId` is
   implemented as `:slug`.

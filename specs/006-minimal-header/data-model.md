# Data Model: Minimal Header Bar

**Feature**: 006-minimal-header | **Date**: 2026-03-11

## Entities

This feature introduces **no new data entities**. It operates on existing data through existing API endpoints.

### Existing Entities Used

#### Evaluation (existing — `evaluations` table in SQLite)

| Field | Type | Relevance |
|-------|------|-----------|
| `slug` | TEXT PK | Identifies the member whose form is being reset |
| `ratings` | TEXT (JSON) | Cleared on reset via `DELETE /api/ratings/:slug` |
| `experience` | TEXT (JSON) | Cleared on reset |
| `skippedCategories` | TEXT (JSON) | Cleared on reset |
| `submittedAt` | TEXT (ISO) | Cleared on reset — member becomes "pending" |

### State Transitions

```
Reset flow:
  [Form with data] → User clicks "Reset" → Confirmation dialog
    → Cancel: [No change]
    → Confirm: DELETE /api/ratings/:slug
      → Server: Row deleted from evaluations table
      → Client: form.reset(), currentStep = 0, autosave cleared
      → [Form blank, step 1]
      → Member excluded from team aggregates until re-submission
```

## Frontend State

### AppHeader Props

The header component uses a render-prop pattern — no internal state beyond what React Router provides.

```
AppHeader
├── Always: ThemeToggle
└── Slot: headerActions (ReactNode) — page-specific buttons
```

### Form Reset State Changes

| State | Before Reset | After Reset |
|-------|-------------|-------------|
| `form` (React Hook Form) | Populated ratings/experience | `form.reset()` to defaults |
| `currentStep` | Any step (0–N) | 0 (first category) |
| `skippedCategories` | May have entries | Empty array |
| `submitted` state | `false` | `false` |
| Autosave debounce | Active | Cleared/restarted |
| Server evaluation row | Exists with data | Deleted |

## API Interactions

No new endpoints. Existing endpoints used:

| Endpoint | Method | Usage |
|----------|--------|-------|
| `/api/ratings/:slug` | DELETE | Reset all member data (ratings, experience, skipped, submittedAt) |
| `/api/ratings/:slug` | GET | Re-fetch blank state after reset (returns defaults) |

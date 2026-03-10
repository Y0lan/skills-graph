# UI Contracts: Minimal Header Bar

**Feature**: 006-minimal-header | **Date**: 2026-03-11

## Component: AppHeader

### Interface

```typescript
interface AppHeaderProps {
  headerActions?: React.ReactNode
}
```

### Behavior

- Renders a `<header>` element fixed at viewport top, full-width, 48px height
- Always renders the `ThemeToggle` component on the right side
- Renders `headerActions` slot on the left/center for page-specific buttons
- Visual: transparent/translucent background, no borders, no shadows
- Accessible: `role="banner"`, semantic `<header>` element

### Usage by Page

**Form page** (`/form/:slug`):
```tsx
<AppHeader headerActions={
  <>
    <ResetButton onReset={handleReset} />
    <Link to={`/dashboard/${slug}`}>Dashboard</Link>
  </>
} />
```

**Dashboard page** (`/dashboard/:slug`):
```tsx
<AppHeader headerActions={
  slug ? <Link to={`/form/${slug}`}>Modifier</Link> : undefined
} />
```

**Dashboard page** (`/dashboard` — no slug):
```tsx
<AppHeader /> {/* No actions, only ThemeToggle */}
```

## Component: ResetConfirmDialog

### Interface

```typescript
interface ResetConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  loading?: boolean
}
```

### Behavior

- Uses shadcn/ui `AlertDialog` primitives
- Title: "Réinitialiser le formulaire ?"
- Description: warns that all ratings, experience, and progress will be erased
- Actions: "Annuler" (cancel) + "Réinitialiser" (destructive confirm)
- On confirm: calls `onConfirm()`, dialog closes
- On cancel: closes dialog, no side effects
- Focus trapped inside dialog, Escape key closes

## Hook Extension: useRatings

### New Method

```typescript
resetRatings: (slug: string) => Promise<boolean>
```

- Calls `DELETE /api/ratings/${slug}`
- On success: sets `data` to null, returns `true`
- On error: sets `error`, returns `false`
- Manages `loading` state during the call

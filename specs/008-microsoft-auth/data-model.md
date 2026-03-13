# Data Model: Authentification Microsoft 365

**Feature**: 008-microsoft-auth | **Date**: 2026-03-12

## New Entity: `users`

Stores linked Microsoft Entra ID accounts for team members.

### Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  microsoft_oid TEXT PRIMARY KEY,           -- Azure AD object ID (GUID), immutable
  slug TEXT UNIQUE                          -- link to roster member
    REFERENCES evaluations(slug) ON DELETE SET NULL,
  email TEXT NOT NULL,                      -- Microsoft email (@sinapse.nc)
  display_name TEXT NOT NULL,               -- cached from MS Graph
  avatar BLOB,                             -- cached profile photo (JPEG, ~5-20KB)
  avatar_etag TEXT,                         -- ETag from Graph API for cache invalidation
  role TEXT NOT NULL DEFAULT 'member'       -- 'admin' | 'member'
    CHECK(role IN ('admin', 'member')),
  last_login_at TEXT,                       -- ISO 8601 timestamp
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_slug ON users(slug);
```

### Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `microsoft_oid` | TEXT (PK) | No | Azure AD object ID — stable, never reassigned |
| `slug` | TEXT (UNIQUE, FK) | Yes | Link to `evaluations.slug`. Null if user not in roster |
| `email` | TEXT | No | Microsoft email, used for initial roster matching |
| `display_name` | TEXT | No | Cached name from MS Graph, updated on each login |
| `avatar` | BLOB | Yes | Cached profile photo JPEG binary (~5-20KB) |
| `avatar_etag` | TEXT | Yes | Graph API ETag for conditional photo refresh |
| `role` | TEXT | No | `member` (default) or `admin`. CHECK constraint |
| `last_login_at` | TEXT | Yes | ISO 8601 timestamp of last login |
| `created_at` | TEXT | No | Auto-set on row creation |

### Relationships

```
users.slug ──(0..1)──> evaluations.slug
```

- One user maps to zero or one evaluation (nullable FK)
- One evaluation belongs to zero or one user (UNIQUE constraint on slug)
- `ON DELETE SET NULL`: if evaluation deleted, user record stays but slug cleared
- FK is optional: evaluation can exist before user links account, user can exist without evaluation

### State Transitions

```
[First Login] → upsert by microsoft_oid
  ├── email matches KNOWN_MAPPINGS → slug set, role='member'
  └── email not in KNOWN_MAPPINGS → slug=NULL, role='member'

[Subsequent Login] → update display_name, email, last_login_at

[Avatar Fetch] → update avatar BLOB + avatar_etag (after login, async)

[Evaluation Deleted] → slug set to NULL (ON DELETE SET NULL)
```

### Validation Rules

- `microsoft_oid`: Must be a valid GUID from JWT `oid` claim
- `email`: Must be a valid email, typically `@sinapse.nc`
- `role`: Constrained to `admin` | `member` by CHECK
- `avatar`: JPEG binary, max ~50KB (Graph API photos are small)
- `slug`: If set, must exist in `evaluations` table

## Existing Entity Changes

### `evaluations` (unchanged)

No schema changes. The `slug` column remains the primary key. The `users.slug` FK references it.

### Team Roster (`src/data/team-roster.ts`)

No schema changes. Add `email` field to `TeamMember` interface:

```typescript
interface TeamMember {
  slug: string
  name: string
  role: string
  team: string
  email: string      // NEW: Microsoft email for account linking
}
```

## Known Email-to-Slug Mappings

Pre-configured in server code (not in DB — the `oid` is only known after first login):

```typescript
const KNOWN_MAPPINGS: Record<string, string> = {
  'pierre.rossato@sinapse.nc': 'pierre-rossato',
  'andy.malo@sinapse.nc': 'andy-malo',
  'martin.vallet@sinapse.nc': 'martin-vallet',
  'pierre-mathieu.barras@sinapse.nc': 'pierre-mathieu-barras',
  'nicole.nguon@sinapse.nc': 'nicole-nguon',
  'alan.huitel@sinapse.nc': 'alan-huitel',
  'bethlehem.mengistu@sinapse.nc': 'bethlehem-mengistu',
  'alexandre.thomas@sinapse.nc': 'alexandre-thomas',
  'matthieu.alcime@sinapse.nc': 'matthieu-alcime',
  'steven.nguyen@sinapse.nc': 'steven-nguyen',
}
```

## Migration

Added via `PRAGMA user_version` in `initDatabase()`:

```typescript
const currentVersion = db.pragma('user_version', { simple: true }) as number

if (currentVersion < 1) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (...);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_slug ON users(slug);
    PRAGMA user_version = 1;
  `)
}
```

Also enable foreign keys (currently missing): `db.pragma('foreign_keys = ON')`

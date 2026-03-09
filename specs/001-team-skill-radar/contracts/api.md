# API Contracts: Team Skill Radar

**Phase 1 output** | **Date**: 2026-03-09

Base URL: `http://localhost:3001/api`

## GET /api/ratings

Returns all submitted ratings for all members.

**Response** `200 OK`:

```json
{
  "yolan-maldonado": {
    "ratings": {
      "java": 4,
      "typescript": 5,
      "spring-boot": 3
    },
    "experience": {
      "java": 4,
      "typescript": 3,
      "spring-boot": 2
    },
    "skippedCategories": ["domain-knowledge"],
    "submittedAt": "2026-03-09T14:30:00Z"
  },
  "alan-huitel": {
    "ratings": {
      "docker-podman": 5,
      "kubernetes": 5
    },
    "experience": {
      "docker-podman": 4,
      "kubernetes": 3
    },
    "skippedCategories": [],
    "submittedAt": "2026-03-09T15:00:00Z"
  }
}
```

**Notes**: Returns `{}` if no data exists. Keys are member
slugs matching `TeamMember.slug`.

---

## GET /api/ratings/:slug

Returns ratings for a single member.

**Parameters**:
- `slug` (path) — Member slug (e.g., `yolan-maldonado`)

**Response** `200 OK` (member has submitted):

```json
{
  "ratings": {
    "java": 4,
    "typescript": 5,
    "spring-boot": 3
  },
  "experience": {
    "java": 4,
    "typescript": 3,
    "spring-boot": 2
  },
  "skippedCategories": ["domain-knowledge"],
  "submittedAt": "2026-03-09T14:30:00Z"
}
```

**Response** `200 OK` (member has not submitted):

```json
{
  "ratings": {},
  "experience": {},
  "skippedCategories": [],
  "submittedAt": null
}
```

**Response** `404 Not Found` (slug not in roster):

```json
{
  "error": "Member not found"
}
```

---

## PUT /api/ratings/:slug

Submit or update ratings for a member.

**Parameters**:
- `slug` (path) — Member slug

**Request body** `application/json`:

```json
{
  "ratings": {
    "java": 4,
    "typescript": 5,
    "angular": 0,
    "spring-boot": 3
  },
  "experience": {
    "java": 4,
    "typescript": 3,
    "angular": 0,
    "spring-boot": 2
  },
  "skippedCategories": ["domain-knowledge"]
}
```

**Validation rules**:
- `slug` MUST match a known member in the roster → `404`
- `ratings` MUST be an object → `400`
- `experience` MUST be an object (optional, defaults to `{}`) → `400` if not object
- `skippedCategories` MUST be an array of valid category IDs (optional, defaults to `[]`) → `400` if not array
- Each ratings key MUST be a valid skill ID → invalid keys ignored
- Each ratings value MUST be an integer 0-5 → `400` if not
- Each experience key MUST be a valid skill ID → invalid keys ignored
- Each experience value MUST be an integer 0-4 → `400` if not
- Server sets `submittedAt` to current ISO timestamp

**Response** `200 OK`:

```json
{
  "ratings": {
    "java": 4,
    "typescript": 5,
    "angular": 0,
    "spring-boot": 3
  },
  "experience": {
    "java": 4,
    "typescript": 3,
    "angular": 0,
    "spring-boot": 2
  },
  "skippedCategories": ["domain-knowledge"],
  "submittedAt": "2026-03-09T14:30:00Z"
}
```

**Response** `400 Bad Request`:

```json
{
  "error": "Invalid ratings: values must be integers 0-5"
}
```

**Response** `404 Not Found`:

```json
{
  "error": "Member not found"
}
```

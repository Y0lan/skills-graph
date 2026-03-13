# API Contracts: Skill Radar v2

Base URL: `http://localhost:3001/api`

All responses are `Content-Type: application/json`.

## GET /api/categories

Returns the skill catalog — all categories with their skills and
level descriptors.

**Response** `200`:

```json
[
  {
    "id": "core-engineering",
    "label": "Socle Technique",
    "emoji": "🔥",
    "order": 1,
    "skills": [
      {
        "id": "java",
        "label": "Java",
        "categoryId": "core-engineering",
        "descriptors": [
          { "level": 0, "label": "Inconnu", "description": "..." },
          { "level": 1, "label": "Notions", "description": "..." },
          { "level": 2, "label": "Guidé", "description": "..." },
          { "level": 3, "label": "Autonome", "description": "..." },
          { "level": 4, "label": "Avancé", "description": "..." },
          { "level": 5, "label": "Expert", "description": "..." }
        ]
      }
    ]
  }
]
```

**Notes**: Static data from `skill-catalog.ts`. Served from server
to keep frontend decoupled from data source.

---

## GET /api/members

Returns all team members.

**Response** `200`:

```json
[
  {
    "slug": "yolan-maldonado",
    "name": "Yolan MALDONADO",
    "role": "Architecte Technique Logiciel",
    "team": "Ingénierie Technique"
  }
]
```

**Notes**: Static data from `team-roster.ts`.

---

## GET /api/ratings/:slug

Returns a single member's ratings and submission status.

**Path params**: `slug` — member slug (e.g. `yolan-maldonado`)

**Response** `200`:

```json
{
  "ratings": { "java": 4, "docker": 3, "react": 5 },
  "experience": { "java": 3, "docker": 2 },
  "skippedCategories": [],
  "submittedAt": "2026-03-10T14:30:00.000Z"
}
```

**Response** `200` (no data yet):

```json
{
  "ratings": {},
  "experience": {},
  "skippedCategories": [],
  "submittedAt": null
}
```

**Response** `404`: `{ "error": "Member not found" }`

---

## PUT /api/ratings/:slug

Upsert all ratings for a member (full replacement).

**Path params**: `slug` — member slug

**Request body**:

```json
{
  "ratings": { "java": 4, "docker": 3 },
  "experience": { "java": 3 },
  "skippedCategories": ["security-compliance"]
}
```

**Validation**:
- `ratings` MUST be an object with integer values 0–5
- `experience` MUST be an object with integer values 0–4
- `skippedCategories` MUST be an array of strings

**Response** `200`: Returns the saved member data (same shape as GET).

**Response** `400`: `{ "error": "Invalid ratings: ..." }`
**Response** `404`: `{ "error": "Member not found" }`

---

## POST /api/ratings/:slug/submit

Finalizes the evaluation — sets `submittedAt` timestamp.
Called when the user clicks "Submit" on the Review & Confirm step.

**Path params**: `slug` — member slug

**Request body**: (empty or `{}`)

**Response** `200`:

```json
{
  "ratings": { ... },
  "experience": { ... },
  "skippedCategories": [...],
  "submittedAt": "2026-03-10T14:30:00.000Z"
}
```

**Response** `400`: `{ "error": "No ratings to submit" }`
**Response** `404`: `{ "error": "Member not found" }`

---

## GET /api/aggregates/:slug

Returns pre-computed aggregates for a member's dashboard.

**Path params**: `slug` — member slug

**Response** `200`:

```json
{
  "memberId": "yolan-maldonado",
  "memberName": "Yolan MALDONADO",
  "role": "Architecte Technique Logiciel",
  "submittedAt": "2026-03-10T14:30:00.000Z",
  "categories": [
    {
      "categoryId": "core-engineering",
      "categoryLabel": "Socle Technique",
      "avgRank": 3.8,
      "teamAvgRank": 2.9,
      "targetRank": 4,
      "gap": 0.2,
      "ratedCount": 8,
      "totalCount": 10
    }
  ],
  "topGaps": [
    {
      "categoryId": "security-compliance",
      "categoryLabel": "Sécurité",
      "gap": 1.5,
      "avgRank": 1.5,
      "targetRank": 3
    }
  ]
}
```

**Notes**:
- `avgRank` excludes N/A (skipped) skills
- `teamAvgRank` is the mean of all submitted members' averages
- `gap` = `targetRank` − `avgRank` (positive means below target)
- `topGaps` = top 3 categories sorted by gap descending (only
  categories with gap > 0)

**Response** `404`: `{ "error": "Member not found" }`

---

## GET /api/aggregates

Returns team-level aggregates for the team dashboard.

**Response** `200`:

```json
{
  "teamSize": 11,
  "submittedCount": 8,
  "categories": [
    {
      "categoryId": "core-engineering",
      "categoryLabel": "Socle Technique",
      "teamAvgRank": 2.9,
      "minRank": 1.2,
      "maxRank": 4.5
    }
  ],
  "members": [
    {
      "slug": "yolan-maldonado",
      "name": "Yolan MALDONADO",
      "role": "Architecte Technique Logiciel",
      "team": "Ingénierie Technique",
      "submittedAt": "2026-03-10T14:30:00.000Z",
      "categoryAverages": {
        "core-engineering": 3.8,
        "backend-integration": 4.2
      },
      "topGaps": [
        { "categoryId": "security-compliance", "gap": 1.5 }
      ]
    }
  ]
}
```

# API Contract Changes: Dashboard Redesign

## Modified Endpoint: GET /api/aggregates (Team)

### Response Changes

**Added fields** to existing `TeamAggregateResponse`:

```json
{
  "teamSize": 12,
  "submittedCount": 5,
  "categoryTargets": {
    "core-engineering": 3.6,
    "backend-integration": 3.2,
    "frontend-ui": 2.8
  },
  "categories": [ /* unchanged */ ],
  "members": [
    {
      "slug": "yolan-maldonado",
      "name": "Yolan Maldonado",
      "role": "Architecte Technique Logiciel",
      "team": "Ingénierie Technique",
      "submittedAt": "2026-03-10T10:00:00.000Z",
      "categoryAverages": { "core-engineering": 3.5 },
      "topGaps": [{ "categoryId": "security-compliance", "gap": 1.5 }],
      "skillRatings": {
        "java": 4,
        "typescript": 5,
        "python": 3,
        "sql": 4
      },
      "topStrengths": [
        { "categoryId": "core-engineering", "avg": 4.2 },
        { "categoryId": "architecture-governance", "avg": 4.0 }
      ]
    }
  ]
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `categoryTargets` | `Record<string, number>` | Weighted average target per category across all submitted members' roles |
| `members[].skillRatings` | `Record<string, number>` | Individual skill ratings (0–5). Only includes skills the member actually rated. Excludes N/A (-2) and unrated skills. Empty object for unsubmitted members. |
| `members[].topStrengths` | `{ categoryId: string; avg: number }[]` | Top 3 highest-rated categories for this member, sorted descending by average |

### Backward Compatibility

All existing fields remain unchanged. New fields are additive — existing frontend code continues to work without modification.

## No Other Endpoint Changes

The Expert Finder is computed client-side from the extended team aggregate data. No new endpoints required.

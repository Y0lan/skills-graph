# Data Model: Dashboard Redesign & Expert Finder

## New/Extended Entities

### SkillQuery (client-side only, not persisted)

A user's selection of skills to search for experts.

| Field | Type | Constraints |
|-------|------|-------------|
| selectedSkillIds | string[] | 1+ skill IDs from catalog |
| categoryFilter | string \| null | Optional category ID to filter skill picker |

**Lifecycle**: Created when user selects first skill, updated on each add/remove, cleared on tab switch or explicit reset.

### ExpertResult (computed client-side, not persisted)

A ranked member entry for the Expert Finder results.

| Field | Type | Description |
|-------|------|-------------|
| slug | string | Member slug |
| name | string | Display name |
| role | string | Job title |
| team | string | Team grouping |
| averageScore | number | Mean of rated selected skills (0–5) |
| skillScores | Record<string, number \| null> | Score per selected skill (null = not rated) |
| matchCount | number | How many selected skills this member has rated |
| totalSelected | number | Total skills selected by the user |

**Computation**:
1. For each selected skill, look up member's rating from `skillRatings`
2. Exclude null/missing ratings from average (don't penalize with 0)
3. Sort by `averageScore` descending, then by `matchCount` descending

## Extended Existing Entities

### TeamMemberAggregateResponse (API extension)

Add to existing response:

| Field | Type | Description |
|-------|------|-------------|
| skillRatings | Record<string, number> | Per-skill ratings (skill ID → 0–5). Only includes rated skills (excludes N/A, unrated). Only for submitted members. |
| topStrengths | { categoryId: string; avg: number }[] | Top 3 highest-rated categories |

### TeamAggregateResponse (API extension)

Add to existing response:

| Field | Type | Description |
|-------|------|-------------|
| categoryTargets | Record<string, number> | Weighted team target per category (average of role targets across submitted members) |

## Relationships

```
SkillQuery *──* Skill          (user selects skills from catalog)
SkillQuery ──> ExpertResult[]  (query produces ranked results)
ExpertResult ──> Member        (each result references a member)
```

## State Transitions

### Expert Finder

```
[no selection] ──select skill──> [has results]
[has results] ──add/remove skill──> [updated results]
[has results] ──clear all──> [no selection]
[has results] ──switch tab──> [preserved selection] (selection persists across tab switches)
```

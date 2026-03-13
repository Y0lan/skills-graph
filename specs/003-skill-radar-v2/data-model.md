# Data Model: Skill Radar v2

## Entities

### Category

A skill grouping. 9 categories, system-defined, immutable.

| Field | Type | Constraints |
|-------|------|-------------|
| id | string | PK, kebab-case (e.g. `core-engineering`) |
| label | string | Display name (e.g. "Socle Technique") |
| emoji | string | Category icon (e.g. "🔥") |
| order | number | Sort order (1–9) |

**Existing source**: `src/data/skill-catalog.ts` → `SkillCategory`

### Skill

A specific competency belonging to one category.
~65 skills total across 9 categories.

| Field | Type | Constraints |
|-------|------|-------------|
| id | string | PK, kebab-case (e.g. `java`, `docker`) |
| label | string | Display name (e.g. "Java") |
| categoryId | string | FK → Category.id |
| descriptors | LevelDescriptor[] | Exactly 6 entries (ranks 0–5) |

**LevelDescriptor**:

| Field | Type | Constraints |
|-------|------|-------------|
| level | number | 0–5 (Inconnu → Expert) |
| label | string | Level name |
| description | string | Calibrated description for this skill at this level |

**Existing source**: `src/data/skill-catalog.ts` → `Skill`

### Member

A team member who can be evaluated.

| Field | Type | Constraints |
|-------|------|-------------|
| slug | string | PK, URL-safe (e.g. `yolan-maldonado`) |
| name | string | Display name |
| role | string | Job title |
| team | string | Team grouping |

**Existing source**: `src/data/team-roster.ts` → `TeamMember`

### Rating (persisted)

A member's self-assessment on a single skill.

| Field | Type | Constraints |
|-------|------|-------------|
| memberId | string | FK → Member.slug |
| skillId | string | FK → Skill.id |
| rank | number | 0–5 (valid rating) or -2 (skipped/N/A) |

**Storage format** (in `ratings.json`):

```json
{
  "<member-slug>": {
    "ratings": { "<skill-id>": <rank>, ... },
    "experience": { "<skill-id>": <0-4>, ... },
    "skippedCategories": ["<category-id>", ...],
    "submittedAt": "<ISO-8601>" | null
  }
}
```

**Lifecycle**:
- Created on first autosave (draft state: `submittedAt = null`)
- Updated on each autosave
- Finalized on wizard submit (`submittedAt` set)
- Can be reopened and overwritten at any time (no version history)

**Existing source**: `server/data/ratings.json` + `server/routes/ratings.ts`

### RatingScale (reference)

The global 6-level rating scale.

| Rank | Label | ShortLabel | Description |
|------|-------|------------|-------------|
| 0 | Inconnu | ? | Jamais utilisé / ne connais pas |
| 1 | Notions | 1 | Je sais ce que c'est, j'ai lu à ce sujet |
| 2 | Guidé | 2 | Je peux travailler dessus avec de l'aide |
| 3 | Autonome | 3 | Je peux livrer de façon autonome |
| 4 | Avancé | 4 | Je conçois des solutions et accompagne les autres |
| 5 | Expert | 5 | Référent de l'équipe, définit les standards |

Special values: `-1` = not submitted, `-2` = skipped (N/A)

**Existing source**: `src/data/rating-scale.ts`

### Target (configuration — new)

Expected skill level per role and category for gap analysis.

| Field | Type | Constraints |
|-------|------|-------------|
| role | string | FK → matches Member.role values |
| categoryId | string | FK → Category.id |
| targetRank | number | 0–5 |

**Storage**: New JSON config file `server/data/targets.json`.
Manually maintained by team lead (editing UI out of scope v1).

```json
{
  "Architecte Technique Logiciel": {
    "core-engineering": 4,
    "backend-integration": 4,
    "frontend-ui": 3,
    "platform-engineering": 3,
    "observability-reliability": 3,
    "security-compliance": 3,
    "architecture-governance": 5,
    "soft-skills": 3,
    "domain-knowledge": 4
  }
}
```

### Aggregate (computed — not persisted)

Computed on read for dashboard consumption.

| Field | Type | Description |
|-------|------|-------------|
| memberId | string | FK → Member.slug |
| categoryId | string | FK → Category.id |
| avgRank | number | Member's average rank in this category (0–5, excludes N/A) |
| teamAvgRank | number | Team average rank in this category |
| targetRank | number | Target for member's role |
| gap | number | targetRank − avgRank (positive = below target) |
| ratedCount | number | Number of skills rated in category |
| totalCount | number | Total skills in category |

## Relationships

```
Category 1──* Skill        (category has many skills)
Member   1──* Rating       (member rates many skills)
Skill    1──* Rating       (skill rated by many members)
Role     1──* Target       (role has targets per category)
Member   *──1 Role         (member has one role → targets)
```

## State Transitions

### Rating Lifecycle

```
[no data] ──autosave──> Draft (submittedAt=null)
  Draft ──autosave──> Draft (updated)
  Draft ──submit──> Submitted (submittedAt=ISO)
  Submitted ──reopen──> Draft (submittedAt reset to null)
  Draft ──submit──> Submitted (new submittedAt)
```

### Wizard Step State

```
[locked] ──previous step done──> [active]
[active] ──all skills rated + "Next"──> [done]
[done] ──user clicks back──> [active] (previous step)
```

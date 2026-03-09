# Data Model: Team Skill Radar

**Phase 1 output** | **Date**: 2026-03-09

## Entities

### TeamMember (hardcoded)

| Field    | Type   | Description                          |
|----------|--------|--------------------------------------|
| slug     | string | URL-safe identifier (e.g., `yolan-maldonado`) — primary key |
| name     | string | Display name (e.g., `Yolan MALDONADO`) |
| role     | string | Job title (e.g., `Architecte Technique Logiciel`) |
| team     | string | Sub-team name (e.g., `Ingénierie Technique`) |

**Source**: Hardcoded in `src/data/team-roster.ts`.
11 members across 4 sub-teams.

### SkillCategory (hardcoded)

| Field  | Type     | Description                    |
|--------|----------|--------------------------------|
| id     | string   | Kebab-case key (e.g., `core-engineering`) |
| label  | string   | Display name (e.g., `Core Engineering`) |
| emoji  | string   | Category icon (e.g., `🔥`)     |
| skills | Skill[]  | Ordered list of skills         |

**Source**: Hardcoded in `src/data/skill-catalog.ts`.
9 categories.

### Skill (hardcoded)

| Field        | Type              | Description                          |
|--------------|-------------------|--------------------------------------|
| id           | string            | Kebab-case key (e.g., `spring-boot`) |
| label        | string            | Display name (e.g., `Spring Boot (REST, Validation, Scheduling)`) |
| categoryId   | string            | FK to SkillCategory.id               |
| descriptors  | LevelDescriptor[] | Array of 6 anchored descriptions (levels 0-5) |

**Source**: Nested within SkillCategory in
`src/data/skill-catalog.ts`. ~65 skills total.
Descriptors sourced from `skill-descriptors.md`.

### LevelDescriptor (hardcoded, nested in Skill)

| Field       | Type   | Description                          |
|-------------|--------|--------------------------------------|
| level       | number | 0-5                                  |
| label       | string | e.g., "Unknown", "Awareness", "Guided", "Autonomous", "Advanced", "Expert" |
| description | string | Technology-specific description for this level |

**Source**: Embedded in each Skill in `src/data/skill-catalog.ts`.

### SkillRating (persisted)

| Field     | Type   | Description                          |
|-----------|--------|--------------------------------------|
| skillId   | string | FK to Skill.id                       |
| value     | number | -2 (skipped category), -1 (no reply), 0 (unknown/never used), 1 (awareness), 2 (guided), 3 (autonomous), 4 (advanced), 5 (expert) |

**Source**: Stored per member in `data/ratings.json`.

### ExperienceDuration (persisted alongside SkillRating)

| Field     | Type   | Description |
|-----------|--------|-------------|
| skillId   | string | FK to Skill.id |
| value     | number | 0=Never, 1=<6 months, 2=6m–2y, 3=2–5y, 4=5+ years |

## Storage Schema (`data/ratings.json`)

```json
{
  "yolan-maldonado": {
    "ratings": {
      "java": 4,
      "typescript": 5,
      "spring-boot": 3,
      "angular": 0
    },
    "experience": {
      "java": 4,
      "typescript": 3,
      "spring-boot": 2,
      "angular": 0
    },
    "skippedCategories": ["domain-knowledge"],
    "submittedAt": "2026-03-09T14:30:00Z"
  }
}
```

**Rules**:
- Top-level keys are member slugs (from TeamMember.slug).
- `ratings` maps skill IDs to numeric values (0-5).
- `experience` maps skill IDs to duration codes (0-4).
- `skippedCategories` is an array of category IDs where user clicked "Skip".
- Skills in skipped categories have rating -2 (derived, not stored individually).
- Skills not present in `ratings` are treated as -1 (no reply).
- `submittedAt` is ISO 8601 timestamp of last submission.
- File is created empty (`{}`) on first server start if missing.

## Derived Data (computed at read time)

### Team Average per Skill

```
For each skill S in a category:
  values = all ratings[S] where value > 0 (exclude 0 and -1)
  average = sum(values) / count(values)
  If no values: average = 0 (displayed as "No data")
```

### Individual Radar Data

```
For a given member M and category C:
  For each skill S in C:
    if M has not submitted → skip entirely (not on chart)
    if M.ratings[S] exists and > 0 → use value
    if M.ratings[S] == 0 → plot as 0 on chart
    if M.ratings[S] missing → treat as -1, not on chart
```

### Category Summary (per category)

```
For each category C:
  avgStrength = mean of all team averages for skills in C
  coverage = count of members who have at least one skill
             in C rated >= 3
  topSkill = skill with highest team average in C
  weakestSkill = skill with lowest team average in C
```

### Skills Gap Table (per skill)

```
For each skill S:
  teamAvg = team average (see above)
  countAt3Plus = number of members who rated S >= 3
  highestRater = member slug with max rating for S
  lowestRater = member slug with min rating for S (among >0)
  riskColor:
    red    if countAt3Plus <= 1 (bus factor risk)
    yellow if countAt3Plus in [2, 3]
    green  if countAt3Plus >= 4
```

### Category Average (for overview radars)

```
For a given member M (or team):
  For each category C:
    values = all ratings for skills in C where value > 0
    categoryAvg = sum(values) / count(values)
    If no values: categoryAvg = 0
```

### Cross-referencing Experience x Proficiency

```
For staffing decisions, cross-reference:
  High proficiency + long experience = reliable pillar
  High proficiency + short experience = fast learner (verify)
  Low proficiency + long experience = possible stagnation
  Low proficiency + short experience = normal, needs training
```

## Relationships

```
TeamMember 1──* SkillRating (via ratings.json)
SkillCategory 1──* Skill (hardcoded)
Skill 1──* SkillRating (via skillId)
```

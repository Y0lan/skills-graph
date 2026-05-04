# Team Skill Radar Scope

## Goal

The team Skill Radar must collect enough answers to make role-based analysis reliable without hiding the rest of the catalog.

Each team member has two coverage levels:

- **Required scope**: the minimum set of categories needed for their role. Completing this scope makes the evaluation submittable.
- **Full radar scope**: every catalog skill. Answers outside the required scope are optional, saved, and used everywhere the team skills map is computed.

This keeps the form humane while preserving the full "who knows what" map.

## Required Category Resolution

The server is the source of truth.

For a member, required categories are resolved in this order:

1. Role targets from `server/data/targets.json`.
2. The member's pole categories from the `pole_categories` table.
3. The full catalog, only if no role or pole scope exists.

The implementation lives in `server/lib/member-form-scope.ts`.

## Form Contract

`GET /api/members/:slug/form-config` returns:

- `requiredCategoryIds`: categories that must be answered before submit.
- `optionalGroups`: every non-required category grouped for discovery.
- `requiredQuestionCount`: required skill rows.
- `optionalQuestionCount`: optional skill rows.
- `catalogQuestionCount`: complete catalog skill rows.

The team form renders required categories first. Optional categories remain accessible from the discovery step and can be answered at any time before final submit.

## Completion Rules

Submission status is based on required coverage only:

- `none`: no required answer.
- `draft`: at least one required answer but required scope incomplete.
- `submitted`: required scope fully covered.

Catalog coverage is exposed separately as `catalogAnsweredCount`, `catalogCoveredCount`, and `catalogTotalCount` on aggregate responses.

## Scoring And Analysis

All saved ratings are still used:

- team average categories,
- individual profiles,
- heatmaps,
- expert finder,
- member comparisons,
- candidate team compatibility baseline.

The required scope only controls submission gating. It does not filter or discard optional ratings.

## Candidate Forms

Candidate forms are unchanged. They still use recruitment role categories from `role_categories` and keep their optional discovery step.

Candidates may see score changes after team members submit because the team baseline becomes more complete. That is expected.

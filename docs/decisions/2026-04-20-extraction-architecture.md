# ADR — Extraction architecture for CV + ABORO data

**Date:** 2026-04-20
**Status:** Accepted (design only, no code shipped)
**Related:** Items 2, 10, 11, 12 of the 2026-04-17 UX batch
**Depends on:** `2026-04-20-data-retention-and-erasure.md`

## Why a spike before code

Codex's plan-challenge surfaced that jumping into Item 2 implementation (CV
extraction expansion) without first locking down the shared schema for runs,
source anchors, locks, merge strategies, and the ABORO adapter creates
churn. Items 10/11/12 will change Item 2's contract if we ship them late.
This ADR locks the contract.

## Schema

```sql
-- Run history per candidate. Both CV and ABORO write here.
CREATE TABLE candidate_extractions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('cv', 'aboro')),
  run_id TEXT NOT NULL,                      -- groups one logical extraction (1 prompt call)
  prompt_version INTEGER NOT NULL,           -- code-side constant; bump when prompt changes
  model_version TEXT NOT NULL,               -- e.g. 'claude-haiku-4-5-20251001'
  input_hash TEXT NOT NULL,                  -- SHA-256 of source content; lets us skip re-runs
  raw_output TEXT NOT NULL,                  -- LLM JSON before validation
  parsed_output TEXT NOT NULL,               -- post-schema-validation JSON
  merge_strategy TEXT NOT NULL DEFAULT 'additive'
    CHECK(merge_strategy IN ('additive', 'recruiter-curated', 'replace')),
  cost_eur REAL,                             -- nullable for back-compat
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_by TEXT NOT NULL,                  -- user slug or 'drupal-webhook'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_candidate_extractions_candidate ON candidate_extractions(candidate_id, type, created_at DESC);

-- Per-field locks. When recruiter approves a value, it sticks across re-runs.
CREATE TABLE candidate_field_overrides (
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,                  -- e.g. 'phone', 'highest_degree'
  value TEXT NOT NULL,                       -- JSON-stringified value
  source TEXT NOT NULL CHECK(source IN ('recruiter', 'extraction')),
  locked_by TEXT,                            -- user slug; NULL when source='extraction'
  locked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (candidate_id, field_name)
);

-- Daily rate limit so recruiters don't burn $$ on accidental re-runs.
CREATE TABLE extraction_usage (
  user_slug TEXT NOT NULL,
  day TEXT NOT NULL,                          -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  tokens_spent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_slug, day)
);
```

All cascade-deleted on candidate delete (per retention ADR).

## Source-anchor model

Different per type — codex correctly flagged that "identical to item 10" is
wrong for ABORO.

### CV (item 10)

Per-field span-grounded output:

```json
{
  "phone": { "value": "+687 12 34 56", "confidence": 0.95, "source_span": [142, 156] }
}
```

`source_span` is `[start, end]` byte offset into `candidates.cv_text`. UI
highlights the substring on hover.

### ABORO (item 11)

Profile blobs aren't span-grounded — ABORO PDFs have a fixed report
structure. Anchor at the **paragraph index** instead:

```json
{
  "trait_consultation": { "value": 7, "source_paragraph": 12 }
}
```

Frontend renders the paragraph from the ABORO PDF text store (already
extracted) when the recruiter clicks a trait.

## Merge strategies

```ts
type MergeStrategy = 'additive' | 'recruiter-curated' | 'replace'
```

- **additive** — new run merges into existing fields; never overwrites a
  non-null field. Locked fields are also untouched. Default for automatic
  re-runs (e.g., when CV is re-uploaded).
- **recruiter-curated** — backend returns a diff; UI shows accept/reject
  per field; recruiter applies selectively. Default for explicit "Re-run"
  button.
- **replace** — wipe and replace. Confirmation-gated. Mostly for fixing a
  bad earlier run.

Locked fields are NEVER overwritten regardless of strategy. The merge
function is pure and lives in `server/lib/extraction-merge.ts` with unit
tests covering every (strategy × lock state) combination.

## Cost accounting

- Each `candidate_extractions` row stores `input_tokens`, `output_tokens`,
  and `cost_eur` (computed at insert time using the current Anthropic
  pricing constants).
- A `cv_extraction_cost_eur_total` Prometheus-style counter exposed via the
  observability work (deferred — measure first, instrument later).
- Daily cap per recruiter: 50 runs. 429 + clear error message on cap.

## Rate limit + budget guard

```ts
async function chargeExtractionRun(userSlug: string, costEur: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const row = db.prepare('SELECT count FROM extraction_usage WHERE user_slug = ? AND day = ?')
    .get(userSlug, today) as { count: number } | undefined
  if (row && row.count >= 50) {
    throw new ExtractionBudgetExhausted('50 extractions par jour atteintes')
  }
  db.prepare(`
    INSERT INTO extraction_usage (user_slug, day, count, tokens_spent)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_slug, day) DO UPDATE SET count = count + 1, tokens_spent = tokens_spent + excluded.tokens_spent
  `).run(userSlug, today, /* tokens */)
}
```

## Privacy

Per the data-retention ADR:

- `candidate_extractions.raw_output` may contain personal info from the
  source CV. Cascade-delete on candidate delete (handled by FK).
- NO face/photo extraction.
- NO training pipeline on `parsed_output` or recruiter overrides.
- `cv_text` is NOT duplicated in `parsed_output` (already in
  `candidates.cv_text`).

## Per-field schema (Item 2 expansion fields)

Locked here so the UI in Item 10 doesn't have to guess at field names.

```ts
type CandidateExtractedFields = {
  // Identity
  full_name: ExtractedField<string>
  date_of_birth: ExtractedField<string>           // ISO date
  // Contact
  phone: ExtractedField<string>
  email: ExtractedField<string>
  city: ExtractedField<string>
  country: ExtractedField<string>
  linkedin_url: ExtractedField<string>
  github_url: ExtractedField<string>
  portfolio_url: ExtractedField<string>
  // Education
  highest_degree: ExtractedField<string>
  school: ExtractedField<string>
  field_of_study: ExtractedField<string>
  graduation_year: ExtractedField<number>
  certifications: ExtractedField<Array<{ title: string; issuer: string; year?: number; expiry?: string }>>
  // Experience
  total_years_experience: ExtractedField<number>
  current_role: ExtractedField<string>
  current_employer: ExtractedField<string>
  previous_roles: ExtractedField<Array<{ title: string; company: string; start: string; end?: string; bullets?: string[] }>>
  industries: ExtractedField<string[]>
  // Skills
  technical_skills: ExtractedField<string[]>
  soft_skills: ExtractedField<string[]>
  languages_spoken: ExtractedField<Array<{ language: string; cefr: 'A1'|'A2'|'B1'|'B2'|'C1'|'C2'|'native' }>>
  // Context
  availability_date: ExtractedField<string>
  notice_period_months: ExtractedField<number>
  salary_expectation_range: ExtractedField<string>
  work_preference: ExtractedField<'remote'|'hybrid'|'onsite'|'flexible'>
  // Signals (computed from above by the LLM)
  inferred_seniority: ExtractedField<'junior'|'mid'|'senior'|'staff'|'principal'>
  international_experience: ExtractedField<boolean>
}

interface ExtractedField<T> {
  value: T | null
  confidence: number               // 0..1
  source_span?: [number, number]   // CV only
  source_paragraph?: number        // ABORO only
}
```

**Out of scope explicitly:**

- Profile photo / face extraction (codex flag, privacy)
- Gender / nationality / age (stored — age is derived in UI from DOB only)
- Right-to-work flags (only if the role explicitly requires verification)

## ABORO adapter

```ts
type AboroExtractedFields = {
  // 20 traits across 5 axes — match aboro-extraction.ts AboroProfile shape
  traits: Record<string, ExtractedField<number>>     // 1-10 scale
  talent_cloud: Record<string, ExtractedField<string>>   // distinctive/avere/mobilisable/...
  matrices: ExtractedField<Array<{ dimension: string; naturel: string; mobilisable: string }>>
}
```

ABORO `source_paragraph` points at the page+paragraph index inside the
extracted PDF text (already stored on `aboro_profiles.profile_json` raw
output).

## Implementation plan (3 commits)

1. **Schema migration + helpers.** No behaviour change.
   `extraction-merge.ts` pure functions + tests. `extraction-budget.ts`.
2. **Extractor refactor.** Update `cv-extraction.ts` to return the new
   `CandidateExtractedFields` shape with span-grounded confidence per
   field. Persists into `candidate_extractions`. NO UI yet.
3. **UI panel** on `candidate-detail-page` showing the extracted fields
   with confidence pills + lock toggles. Cost counter visible to admins.

Items 10, 11, 12 ride on top of (3).

## Out of scope today

- Real-time cost dashboard (deferred)
- LLM-powered field disambiguation ("did you mean X?")
- Cross-candidate field deduplication (e.g., same phone number on two candidates)

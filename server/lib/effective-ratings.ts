import { getDb } from './db.js'
import { safeJsonParse } from './types.js'

/**
 * Effective Ratings Module — the ONE true seam for the
 * `{ ai, roleAware, manual }` merge.
 *
 * Why this Module exists
 * ----------------------
 * The merge was inlined at 4 sites in recruitment.ts with three
 * different shapes: a 2-source spread, a roleAware-or-baseline
 * either/or, and an inconsistent precedence rule. Each site drifted
 * from the others. The compat-breakdown drawer and the top-candidates
 * list returned different ratings for the same candidature (the pill
 * said 18%, the modal said 19%). This module owns the precedence
 * rule and the source bookkeeping so callers learn one fact:
 *
 *   manual > role-aware > AI baseline
 *
 * Two modes the call sites actually need:
 *
 *   - **`current-poste`** — the ratings that score this candidature
 *     against ITS poste. Includes all 3 sources. Use everywhere
 *     except cross-poste comparison.
 *   - **`cross-poste-baseline`** — the ratings that score this
 *     candidature against a DIFFERENT poste (the cross-poste
 *     comparison report). Excludes role-aware because it was
 *     calibrated against the candidature\'s OWN poste, not the
 *     target. Manual + AI baseline only.
 *
 * Two seams (codex post-plan P2 #5/#6):
 *
 *   - **`availableSources`** — what was non-empty in the DB row.
 *   - **`mergedSources`** — what actually contributed to the merged
 *     output. With `cross-poste-baseline`,
 *     `mergedSources.roleAware === false` even when role-aware was
 *     non-empty in the DB.
 *
 * Two adapters at the seam (codex post-plan P1 #1):
 *
 *   - **DB-backed** — given a candidatureId, query the three columns
 *     and merge. Used by handlers that already have the id (compat
 *     breakdown, single-candidature score).
 *   - **In-memory** — given the three raw JSON strings (or already-
 *     parsed records) and a mode, return the same shape. Used by
 *     hot loops that batch-query 50 candidatures with a JOIN — the
 *     DB-backed variant would do 50 extra round-trips.
 *
 * Two adapters means a real seam, per the LANGUAGE.md principle.
 */

export type EffectiveRatingsMode = 'current-poste' | 'cross-poste-baseline'

export interface EffectiveRatingsSources {
  ai: boolean
  roleAware: boolean
  manual: boolean
}

export interface EffectiveRatings {
  ratings: Record<string, number>
  /** What was non-empty in the underlying row, regardless of mode.
   *  Reading "did this candidate self-evaluate?" → check
   *  `availableSources.manual`. */
  availableSources: EffectiveRatingsSources
  /** What actually contributed to the merged ratings. With
   *  `cross-poste-baseline`, `mergedSources.roleAware === false`
   *  even when `availableSources.roleAware === true`. Reading
   *  "is this score role-calibrated?" → check
   *  `mergedSources.roleAware`. */
  mergedSources: EffectiveRatingsSources
}

/** Raw column values, either as JSON strings (typical DB shape) or
 *  pre-parsed records. Pre-parsing is supported for the hot-loop
 *  case where the caller already parsed once for other UI fields. */
export interface RawRatingColumns {
  ai: string | Record<string, number> | null
  roleAware: string | Record<string, number> | null
  manual: string | Record<string, number> | null
}

function parseColumn(v: string | Record<string, number> | null): Record<string, number> {
  if (v == null) return {}
  if (typeof v === 'string') return safeJsonParse<Record<string, number>>(v, {})
  return v
}

/**
 * In-memory variant — given pre-loaded raw column values + a mode,
 * return the merged ratings + source bookkeeping. Pure; no DB I/O.
 *
 * Use when batch-loading many candidatures in one query (top-
 * candidates list, cross-poste comparison) so each row doesn\'t
 * trigger an extra round-trip.
 */
export function mergeEffectiveRatings(
  raw: RawRatingColumns,
  mode: EffectiveRatingsMode = 'current-poste',
): EffectiveRatings {
  const ai = parseColumn(raw.ai)
  const roleAware = parseColumn(raw.roleAware)
  const manual = parseColumn(raw.manual)

  const availableSources: EffectiveRatingsSources = {
    ai: Object.keys(ai).length > 0,
    roleAware: Object.keys(roleAware).length > 0,
    manual: Object.keys(manual).length > 0,
  }

  // Precedence: manual > role-aware > ai. In `cross-poste-baseline`
  // mode, role-aware is excluded entirely (it was calibrated to a
  // different poste than the comparison target).
  const ratings = mode === 'cross-poste-baseline'
    ? { ...ai, ...manual }
    : { ...ai, ...roleAware, ...manual }

  const mergedSources: EffectiveRatingsSources = {
    ai: availableSources.ai,
    // In cross-poste-baseline mode, role-aware never contributes,
    // even when present in the DB. Callers checking
    // `mergedSources.roleAware` see the truth of what was scored
    // against, not what was available.
    roleAware: mode === 'cross-poste-baseline' ? false : availableSources.roleAware,
    manual: availableSources.manual,
  }

  return { ratings, availableSources, mergedSources }
}

/**
 * DB-backed variant — given a candidatureId, query the three columns
 * and merge. Returns empty ratings + all-false sources for unknown
 * candidatures (callers that care about the missing-row case can
 * read `availableSources.manual === false && availableSources.ai === false`
 * to detect it).
 */
export function loadEffectiveRatings(
  candidatureId: string,
  mode: EffectiveRatingsMode = 'current-poste',
): EffectiveRatings {
  const row = getDb().prepare(`
    SELECT
      cand.ratings AS manual,
      cand.ai_suggestions AS ai,
      c.role_aware_suggestions AS role_aware
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    WHERE c.id = ?
  `).get(candidatureId) as {
    manual: string | null
    ai: string | null
    role_aware: string | null
  } | undefined

  if (!row) {
    const empty: EffectiveRatingsSources = { ai: false, roleAware: false, manual: false }
    return { ratings: {}, availableSources: empty, mergedSources: empty }
  }

  return mergeEffectiveRatings(
    { ai: row.ai, roleAware: row.role_aware, manual: row.manual },
    mode,
  )
}

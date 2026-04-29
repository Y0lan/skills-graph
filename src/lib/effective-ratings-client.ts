/**
 * Frontend mirror of the server\'s Effective Ratings precedence rule
 * (server/lib/effective-ratings.ts). Same contract:
 *
 *   manual > role-aware > AI baseline
 *
 * Used where the frontend needs to display merged ratings without
 * round-tripping to the server. Two scopes:
 *
 * - **Candidate-level** — `manual + ai`. No role-aware, because
 *   role-aware lives on the candidature, not the candidate. Used by
 *   the "top 5 skills overall" display on the candidate detail page.
 * - **Candidature-level** — `manual + role-aware + ai`. Identical
 *   to the server\'s `current-poste` mode. The server already
 *   returns this shape on every candidature row in the comparison /
 *   shortlist / detail endpoints, so the frontend rarely needs to
 *   re-derive — but when it does (e.g. a presentational component
 *   that gets only the raw three columns), this helper is the seam.
 *
 * Codex post-plan P3 #11 was about catching frontend re-derivation
 * drift after the backend Module landed. This file is the answer.
 */

export interface CandidateScopeInputs {
  ai?: Record<string, number> | null
  manual?: Record<string, number> | null
}

export interface CandidatureScopeInputs extends CandidateScopeInputs {
  roleAware?: Record<string, number> | null
}

/** Merge candidate-level ratings (manual overrides AI baseline). */
export function mergeCandidateRatings(input: CandidateScopeInputs): Record<string, number> {
  return { ...(input.ai ?? {}), ...(input.manual ?? {}) }
}

/** Merge candidature-level ratings (manual > role-aware > AI baseline).
 *  Mirrors `mergeEffectiveRatings({ ... }, 'current-poste')` on the
 *  server. */
export function mergeCandidatureRatings(input: CandidatureScopeInputs): Record<string, number> {
  return {
    ...(input.ai ?? {}),
    ...(input.roleAware ?? {}),
    ...(input.manual ?? {}),
  }
}

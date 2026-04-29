import { getDb } from './db.js'
import {
  calculatePosteCompatibility,
  calculateEquipeCompatibility,
  calculateGlobalScore,
} from './compatibility.js'
import { loadEffectiveRatings } from './effective-ratings.js'

// Re-exported so existing callers can keep importing from this module
// during the transition. The canonical home is now ./effective-ratings.
export { loadEffectiveRatings, mergeEffectiveRatings } from './effective-ratings.js'
export type {
  EffectiveRatings,
  EffectiveRatingsMode,
  EffectiveRatingsSources,
  RawRatingColumns,
} from './effective-ratings.js'

/** Load the softSkills score currently stored on this candidature (or
 *  the candidate's first stored value if this candidature doesn't have
 *  its own yet — soft skills are candidate-level, not poste-level). */
function loadSoftScore(candidatureId: string): number | null {
  const own = getDb().prepare(
    'SELECT taux_soft_skills FROM candidatures WHERE id = ?',
  ).get(candidatureId) as { taux_soft_skills: number | null } | undefined
  if (own?.taux_soft_skills != null) return own.taux_soft_skills

  const fallback = getDb().prepare(`
    SELECT c2.taux_soft_skills
    FROM candidatures c1
    JOIN candidatures c2 ON c2.candidate_id = c1.candidate_id
    WHERE c1.id = ? AND c2.taux_soft_skills IS NOT NULL
    ORDER BY c2.created_at ASC LIMIT 1
  `).get(candidatureId) as { taux_soft_skills: number | null } | undefined
  return fallback?.taux_soft_skills ?? null
}

/**
 * Recompute the three compat scores + global for one candidature using
 * the merged effective ratings, then UPDATE the row. Idempotent. Safe to
 * call after: CV extraction, form submission, requirements change,
 * manual /recalculate hit, intake of a new candidature.
 *
 * Returns the computed scores so callers that just need the numbers
 * (rather than the side effect) can use this as the single scoring API.
 */
export interface RescoreResult {
  candidatureId: string
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
  tauxGlobal: number | null
  source: 'rescore'
}

export function rescoreCandidature(candidatureId: string): RescoreResult {
  const row = getDb().prepare(`
    SELECT c.poste_id, p.role_id
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    WHERE c.id = ?
  `).get(candidatureId) as { poste_id: string; role_id: string } | undefined

  if (!row) {
    throw new Error(`[scoring] candidature ${candidatureId} not found`)
  }

  const { ratings } = loadEffectiveRatings(candidatureId)
  const tauxPoste = calculatePosteCompatibility(ratings, row.poste_id)
  const tauxEquipe = calculateEquipeCompatibility(ratings, row.role_id)
  const tauxSoft = loadSoftScore(candidatureId)
  const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, tauxSoft)

  getDb().prepare(`
    UPDATE candidatures
    SET taux_compatibilite_poste = ?,
        taux_compatibilite_equipe = ?,
        taux_soft_skills = ?,
        taux_global = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(tauxPoste, tauxEquipe, tauxSoft, tauxGlobal, candidatureId)

  return {
    candidatureId,
    tauxPoste,
    tauxEquipe,
    tauxSoft,
    tauxGlobal,
    source: 'rescore',
  }
}

/** Rescore every candidature attached to a poste. Used by the requirements
 *  change handler — new weighted requirements → every existing candidature
 *  on that poste has a stale taux_compatibilite_poste. Sync is fine at
 *  current volumes (max ~20 candidatures per poste). */
export function rescorePoste(posteId: string): RescoreResult[] {
  const rows = getDb().prepare(
    'SELECT id FROM candidatures WHERE poste_id = ?',
  ).all(posteId) as { id: string }[]
  return rows.map(r => rescoreCandidature(r.id))
}

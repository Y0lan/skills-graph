import { getDb } from './db.js'
import { extractCvText, extractSkillsFromCv, PROMPT_VERSION, type PosteContext } from './cv-extraction.js'
import { getSkillCategories } from './catalog.js'
import {
  calculatePosteCompatibility,
  calculateEquipeCompatibility,
  calculateGlobalScore,
} from './compatibility.js'
import type { ExtractionStatus } from './types.js'

export type CvPipelineSource = 'direct-upload' | 'drupal' | 'reextract'

export interface CvPipelineResult {
  candidateId: string
  status: ExtractionStatus | 'skipped'
  suggestionsCount: number
  failedCategories: string[]
  failedCandidatures: string[]
  error?: string
}

/**
 * The ONE true CV → scoring path. All CV upload flows (direct admin upload,
 * Drupal webhook intake, Drupal retry, admin re-extract in Phase 8) must route
 * through this function. Never duplicate this scoring loop in routes.
 *
 * Pipeline:
 *   1. CAS lock via `extraction_status = 'running'` — prevents concurrent runs.
 *   2. Extract CV text via `extractCvText` (PDF / DOCX).
 *   3. Run role-neutral skill extraction via `extractSkillsFromCv`
 *      (Phase 3 adds per-candidature role-aware delta; Phase 0 is baseline only).
 *   4. Persist `cv_text`, `ai_suggestions`, `ai_reasoning`, `ai_questions`.
 *   5. Load all candidatures for this candidate.
 *   6. For each candidature, compute `taux_compatibilite_poste/_equipe/_global`.
 *      If a candidature's scoring throws, mark it as failed but keep going —
 *      we never want one bad candidature to poison the whole run.
 *   7. Transition status:
 *      - `succeeded` — extraction ok AND every candidature got scored
 *      - `partial`   — extraction ok but ≥1 candidature scoring failed
 *      - `failed`    — extraction itself failed (no usable suggestions)
 *   8. Always increment attempts + stamp last_extraction_at; error only on failure/partial.
 */
export async function processCvForCandidate(
  candidateId: string,
  cvBuffer: Buffer,
  options: { source?: CvPipelineSource } = {},
): Promise<CvPipelineResult> {
  const db = getDb()
  const source = options.source ?? 'direct-upload'

  const locked = acquireExtractionLock(candidateId)
  if (!locked) {
    return {
      candidateId,
      status: 'skipped',
      suggestionsCount: 0,
      failedCategories: [],
      failedCandidatures: [],
    }
  }

  try {
    // 1. Extract text
    const cvText = await extractCvText(cvBuffer)

    // 2. Extract skills (role-neutral baseline; posteContext wired for Phase 3)
    const posteContext: PosteContext | null = null
    const catalog = getSkillCategories()
    const result = await extractSkillsFromCv(cvText, catalog, posteContext)

    if (!result) {
      markFailed(candidateId, 'CV trop court ou extraction impossible')
      return {
        candidateId,
        status: 'failed',
        suggestionsCount: 0,
        failedCategories: [],
        failedCandidatures: [],
        error: 'no-suggestions',
      }
    }

    // 3. Persist extraction output on the candidate row
    db.prepare(
      `UPDATE candidates
         SET cv_text = ?,
             ai_suggestions = ?,
             ai_reasoning = ?,
             ai_questions = ?,
             prompt_version = ?
       WHERE id = ?`,
    ).run(
      cvText,
      JSON.stringify(result.ratings),
      JSON.stringify(result.reasoning),
      JSON.stringify(result.questions),
      PROMPT_VERSION,
      candidateId,
    )

    // 4. Score every candidature
    const scoring = scoreAllCandidatures(candidateId, result.ratings)

    // 5. Determine status
    const extractionHadFailures = result.failedCategories.length > 0
    const scoringHadFailures = scoring.failedCandidatures.length > 0
    const status: ExtractionStatus =
      extractionHadFailures || scoringHadFailures ? 'partial' : 'succeeded'
    const error = scoringHadFailures
      ? `Scoring échoué pour ${scoring.failedCandidatures.length} candidature(s)`
      : extractionHadFailures
        ? `Extraction partielle : ${result.failedCategories.length} catégorie(s) ont échoué`
        : null

    db.prepare(
      `UPDATE candidates
         SET extraction_status = ?,
             extraction_attempts = extraction_attempts + 1,
             last_extraction_at = datetime('now'),
             last_extraction_error = ?
       WHERE id = ?`,
    ).run(status, error, candidateId)

    return {
      candidateId,
      status,
      suggestionsCount: Object.keys(result.ratings).length,
      failedCategories: result.failedCategories,
      failedCandidatures: scoring.failedCandidatures,
      error: error ?? undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cv-pipeline] candidate=${candidateId} source=${source}:`, err)
    markFailed(candidateId, message)
    return {
      candidateId,
      status: 'failed',
      suggestionsCount: 0,
      failedCategories: [],
      failedCandidatures: [],
      error: message,
    }
  }
}

/**
 * Compare-and-swap acquisition of the per-candidate extraction lock.
 * Returns true when the row transitioned from non-running to running.
 * Returns false when another caller already holds the lock.
 */
function acquireExtractionLock(candidateId: string): boolean {
  const result = getDb().prepare(
    `UPDATE candidates
       SET extraction_status = 'running'
     WHERE id = ?
       AND extraction_status <> 'running'`,
  ).run(candidateId)
  return result.changes === 1
}

function markFailed(candidateId: string, error: string): void {
  getDb().prepare(
    `UPDATE candidates
       SET extraction_status = 'failed',
           extraction_attempts = extraction_attempts + 1,
           last_extraction_at = datetime('now'),
           last_extraction_error = ?
     WHERE id = ?`,
  ).run(error, candidateId)
}

interface CandidatureScoringResult {
  scoredCandidatures: string[]
  failedCandidatures: string[]
}

/**
 * Score every candidature of a candidate given extracted ai_suggestions.
 * Each candidature is scored in its own try/catch so one poor poste config
 * doesn't abort the rest of the batch.
 */
function scoreAllCandidatures(
  candidateId: string,
  suggestions: Record<string, number>,
): CandidatureScoringResult {
  const db = getDb()
  const candidatures = db.prepare(
    `SELECT c.id, p.role_id
       FROM candidatures c
       JOIN postes p ON p.id = c.poste_id
      WHERE c.candidate_id = ?`,
  ).all(candidateId) as { id: string; role_id: string }[]

  const softRow = db.prepare(
    `SELECT taux_soft_skills
       FROM candidatures
      WHERE candidate_id = ? AND taux_soft_skills IS NOT NULL
      LIMIT 1`,
  ).get(candidateId) as { taux_soft_skills: number | null } | undefined
  const softScore = softRow?.taux_soft_skills ?? null

  const update = db.prepare(
    `UPDATE candidatures
        SET taux_compatibilite_poste = ?,
            taux_compatibilite_equipe = ?,
            taux_soft_skills = ?,
            taux_global = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
  )

  const scored: string[] = []
  const failed: string[] = []

  for (const c of candidatures) {
    try {
      const tauxPoste = calculatePosteCompatibility(suggestions, c.role_id)
      const tauxEquipe = calculateEquipeCompatibility(suggestions, c.role_id)
      const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, softScore)
      update.run(tauxPoste, tauxEquipe, softScore, tauxGlobal, c.id)
      scored.push(c.id)
    } catch (err) {
      console.error(`[cv-pipeline] Scoring failed for candidature ${c.id}:`, err)
      failed.push(c.id)
    }
  }

  return { scoredCandidatures: scored, failedCandidatures: failed }
}

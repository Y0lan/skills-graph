import { getDb } from './db.js'
import type { SkillCategory } from '../../src/data/skill-catalog.js'
import { extractCvText, extractSkillsFromCv, EXTRACTION_MODEL, PROMPT_VERSION, type PosteContext } from './cv-extraction.js'
import { getSkillCategories } from './catalog.js'
import {
  calculatePosteCompatibility,
  calculateEquipeCompatibility,
  calculateGlobalScore,
} from './compatibility.js'
import type { ExtractionStatus } from './types.js'
import { putAsset } from './asset-storage.js'
import { startRun, finishRun, type ExtractionRunStatus } from './extraction-runs.js'
import { pruneExtractionRuns } from './extraction-retention.js'

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

    // 2. Store raw PDF bytes so Phase 8 re-extract can reuse them without
    //    requiring a fresh upload. Dedupes by sha256 — re-running extraction
    //    on the same CV doesn't duplicate the blob.
    putAsset({
      candidateId,
      kind: 'raw_pdf',
      buffer: cvBuffer,
      mime: 'application/pdf',
    })

    // 3. Store CV text as a deduped asset + remember its id for the run record.
    const cvAsset = putAsset({
      candidateId,
      kind: 'cv_text',
      buffer: cvText,
      mime: 'text/plain; charset=utf-8',
    })

    // 4. Open a skills_baseline extraction run so we have a row to close on
    //    both success and failure. Phase 1 audit trail.
    const runId = startRun({
      candidateId,
      kind: 'skills_baseline',
      promptVersion: PROMPT_VERSION,
      model: EXTRACTION_MODEL,
      cvAssetId: cvAsset.id,
    })

    // 5. Extract skills (role-neutral baseline; posteContext wired for Phase 3)
    const posteContext: PosteContext | null = null
    const catalog = getSkillCategories()
    const result = await extractSkillsFromCv(cvText, catalog, posteContext)

    if (!result) {
      finishRun({
        runId,
        status: 'failed',
        error: 'no-suggestions (CV too short or all categories failed)',
      })
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

    // 6. Persist extraction output on the candidate row
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

    // 6b. For each candidature with a fiche de poste, run a role-aware
    //     extraction that calibrates against the target role. Persist
    //     per-candidature. `candidature-libre` (catch-all) and candidatures
    //     whose poste has no description skip this pass and fall back to
    //     the candidate-level baseline when scoring.
    const roleAwareFailures = await runRoleAwarePasses({
      candidateId,
      cvText,
      catalog,
      cvAssetId: cvAsset.id,
    })

    // 7. Score every candidature — scoring prefers role_aware_suggestions
    //    when present, otherwise falls back to the candidate-level baseline.
    const scoring = scoreAllCandidatures(candidateId, result.ratings)

    // 8. Determine status
    const extractionHadFailures = result.failedCategories.length > 0 || roleAwareFailures.length > 0
    const scoringHadFailures = scoring.failedCandidatures.length > 0
    const status: ExtractionStatus =
      extractionHadFailures || scoringHadFailures ? 'partial' : 'succeeded'
    const error = scoringHadFailures
      ? `Scoring échoué pour ${scoring.failedCandidatures.length} candidature(s)`
      : extractionHadFailures
        ? `Extraction partielle : ${result.failedCategories.length} catégorie(s) ont échoué`
        : null

    // 9. Close the run record with the full payload + retention sweep
    const runStatus: ExtractionRunStatus = status === 'succeeded' ? 'success' : 'partial'
    finishRun({
      runId,
      status: runStatus,
      payload: {
        ratings: result.ratings,
        reasoning: result.reasoning,
        questions: result.questions,
        failedCategories: result.failedCategories,
        failedCandidatures: scoring.failedCandidatures,
      },
      error,
    })
    try {
      pruneExtractionRuns()
    } catch (err) {
      console.warn('[cv-pipeline] retention pruning failed (non-fatal):', err)
    }

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
 * Run a role-aware extraction per candidature whose poste has a fiche.
 * Persists per-candidature ratings/reasoning/questions. Failures fall back
 * to the candidate-level baseline when scoring. Returns ids of candidatures
 * where the role-aware pass threw (for partial-status bookkeeping).
 */
async function runRoleAwarePasses(params: {
  candidateId: string
  cvText: string
  catalog: SkillCategory[]
  cvAssetId: string
}): Promise<string[]> {
  const db = getDb()
  const targets = db.prepare(
    `SELECT c.id AS candidature_id, p.id AS poste_id, p.titre, p.description
       FROM candidatures c
       JOIN postes p ON p.id = c.poste_id
      WHERE c.candidate_id = ?
        AND p.id != 'candidature-libre'
        AND p.description IS NOT NULL
        AND TRIM(p.description) != ''`,
  ).all(params.candidateId) as Array<{ candidature_id: string; poste_id: string; titre: string; description: string }>

  if (targets.length === 0) return []

  const failures: string[] = []
  const update = db.prepare(
    `UPDATE candidatures
        SET role_aware_suggestions = ?,
            role_aware_reasoning = ?,
            role_aware_questions = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
  )

  for (const t of targets) {
    const snapshot = { titre: t.titre, description: t.description }
    const runId = startRun({
      candidateId: params.candidateId,
      candidatureId: t.candidature_id,
      kind: 'skills_role_aware',
      posteId: t.poste_id,
      posteSnapshot: snapshot,
      promptVersion: PROMPT_VERSION,
      model: EXTRACTION_MODEL,
      cvAssetId: params.cvAssetId,
    })
    try {
      const roleAware = await extractSkillsFromCv(params.cvText, params.catalog, {
        posteId: t.poste_id,
        titre: t.titre,
        description: t.description,
      })
      if (!roleAware) {
        finishRun({ runId, status: 'failed', error: 'role-aware extraction returned null' })
        failures.push(t.candidature_id)
        continue
      }
      update.run(
        JSON.stringify(roleAware.ratings),
        JSON.stringify(roleAware.reasoning),
        JSON.stringify(roleAware.questions),
        t.candidature_id,
      )
      finishRun({
        runId,
        status: roleAware.failedCategories.length > 0 ? 'partial' : 'success',
        payload: {
          ratings: roleAware.ratings,
          reasoning: roleAware.reasoning,
          questions: roleAware.questions,
          failedCategories: roleAware.failedCategories,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cv-pipeline] role-aware failed for candidature ${t.candidature_id}:`, err)
      finishRun({ runId, status: 'failed', error: msg })
      failures.push(t.candidature_id)
    }
  }

  return failures
}

/**
 * Score every candidature of a candidate. Each candidature uses its own
 * role_aware_suggestions when populated (Phase 3 — role-aware pass succeeded
 * for that candidature), otherwise falls back to the candidate-level baseline
 * `suggestions`. One try/catch per candidature so one poor poste config doesn't
 * abort the batch.
 */
function scoreAllCandidatures(
  candidateId: string,
  suggestions: Record<string, number>,
): CandidatureScoringResult {
  const db = getDb()
  const candidatures = db.prepare(
    `SELECT c.id, p.role_id, c.role_aware_suggestions
       FROM candidatures c
       JOIN postes p ON p.id = c.poste_id
      WHERE c.candidate_id = ?`,
  ).all(candidateId) as { id: string; role_id: string; role_aware_suggestions: string | null }[]

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
      // Prefer per-candidature role-aware ratings when present; fall back to
      // candidate-level baseline. This is what makes multi-poste candidates
      // get distinct scores on each poste.
      let ratings = suggestions
      if (c.role_aware_suggestions) {
        try {
          const parsed = JSON.parse(c.role_aware_suggestions) as Record<string, number>
          if (parsed && typeof parsed === 'object') ratings = parsed
        } catch {
          // Malformed JSON — fall back to baseline
        }
      }
      const tauxPoste = calculatePosteCompatibility(ratings, c.role_id)
      const tauxEquipe = calculateEquipeCompatibility(ratings, c.role_id)
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

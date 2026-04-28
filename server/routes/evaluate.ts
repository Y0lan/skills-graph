import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getDb, getCategoriesForCandidate, getCategoryIdsByPole } from '../lib/db.js'
import { sendCandidateSubmitted } from '../lib/email.js'
import { validateRatings, filterValidRatings } from '../lib/validation.js'
import { safeJsonParse, getUser, type CandidateRow } from '../lib/types.js'
import { rescoreCandidature } from '../lib/scoring-helpers.js'
import { requireLead } from '../middleware/require-lead.js'
import { recruitmentBus } from '../lib/event-bus.js'

export const evaluateRouter = Router()

// Rate limit: 30 requests per minute per IP on all public endpoints
const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
})
evaluateRouter.use(publicRateLimit)

// Shared guard: check candidate exists, not expired, not submitted
function getCandidateGuard(id: string, res: import('express').Response, opts?: { allowSubmitted?: boolean }) {
  const row = getDb()
    .prepare('SELECT id, name, role, role_id, created_by, expires_at, submitted_at, ratings, ai_suggestions, version FROM candidates WHERE id = ?')
    .get(id) as CandidateRow | undefined

  if (!row) {
    res.status(404).json({ error: 'Lien invalide' })
    return null
  }

  if (new Date(row.expires_at) < new Date()) {
    res.status(410).json({ error: 'Ce lien a expiré. Contactez votre recruteur.', expired: true })
    return null
  }

  if (!opts?.allowSubmitted && row.submitted_at) {
    res.status(409).json({ error: 'Évaluation déjà soumise' })
    return null
  }

  return row
}

// validateRatings imported from server/lib/validation.ts

// Get candidate form data (public — no ratings, no report)
evaluateRouter.get('/:id/form', (req, res) => {
  const row = getCandidateGuard(req.params.id, res, { allowSubmitted: true })
  if (!row) return

  // Union of category IDs across all postes this candidate has applied to.
  // Empty array means "show ALL categories" (free candidature without a role).
  const candidateCategories = getCategoriesForCandidate(row.id)
  const candidatureRows = getDb().prepare(`
    SELECT p.titre AS poste_titre
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    WHERE c.candidate_id = ?
    ORDER BY c.created_at ASC
  `).all(row.id) as { poste_titre: string }[]

  const cvDerivedCategories = computeCvDerivedCategories(row.id, candidateCategories)

  // Read-time defensive filter: drop any non-catalog skill IDs from
  // ai_suggestions before sending to the form. Heals legacy rows where
  // multipass reconcile (pre-fix) wrote hallucinated keys like "oracle".
  // Without this, the candidate's form state seeds with unknown keys
  // that ride invisibly into the autosave/submit payload and get
  // rejected by validateRatings — leaving the candidate stuck with no
  // way to remove the offending key. See plan §Item 2.
  const rawSuggestions = safeJsonParse<Record<string, unknown> | null>(row.ai_suggestions, null)
  const aiSuggestions = rawSuggestions ? filterValidRatings(rawSuggestions) : null

  res.json({
    id: row.id,
    name: row.name,
    role: row.role,
    posteTitres: candidatureRows.map(r => r.poste_titre),
    submitted: !!row.submitted_at,
    aiSuggestions,
    roleCategories: candidateCategories.length > 0 ? candidateCategories : null,
    cvDerivedCategories,
    categoryIdsByPole: getCategoryIdsByPole(),
    version: row.version,
  })
})

/**
 * Compute which catalog categories should be appended to the candidate's
 * form because their CV revealed skills OUTSIDE the role's default set.
 *
 * Invariant: never invent categories. Every returned `categoryId` MUST
 * exist in the `categories` table — we derive it by looking up skill IDs
 * against `skills.category_id`. LLM returning a bogus skill id means that
 * skill gets silently dropped, the category never gets added.
 *
 * Population criteria (all required, AND):
 *   - Category is in the canonical catalog (skill → category join).
 *   - ≥1 skill in the category has ai_suggestions[skillId] ≥ 3 (Autonome+).
 *   - LLM provided an evidence snippet (ai_reasoning[skillId]) for at
 *     least one skill in that category.
 *   - Category is NOT already in the role's default set.
 *   - Top-5 cap, ranked by max rating across skills in the category.
 */
const PHASE_6_TOP_N = 5
const PHASE_6_RATING_FLOOR = 3

interface CvDerivedCategory {
  categoryId: string
  confidence: number
  evidenceSnippets: string[]
}

function computeCvDerivedCategories(
  candidateId: string,
  roleCategoryIds: string[],
): CvDerivedCategory[] {
  const row = getDb().prepare(
    'SELECT ai_suggestions, ai_reasoning FROM candidates WHERE id = ?',
  ).get(candidateId) as { ai_suggestions: string | null; ai_reasoning: string | null } | undefined
  if (!row?.ai_suggestions) return []

  const suggestions = safeJsonParse<Record<string, number>>(row.ai_suggestions, {})
  const reasoning = safeJsonParse<Record<string, string>>(row.ai_reasoning, {})
  const roleSet = new Set(roleCategoryIds)

  const skillRows = getDb().prepare('SELECT id, category_id FROM skills').all() as Array<{ id: string; category_id: string }>
  const catalogCategoryBySkill = new Map<string, string>()
  for (const s of skillRows) catalogCategoryBySkill.set(s.id, s.category_id)

  const byCategory = new Map<string, { maxRating: number; evidence: string[] }>()
  for (const [skillId, rating] of Object.entries(suggestions)) {
    if (typeof rating !== 'number' || rating < PHASE_6_RATING_FLOOR) continue
    const catId = catalogCategoryBySkill.get(skillId)
    if (!catId) continue // skill not in catalog — invariant: catalog authoritative
    if (roleSet.has(catId)) continue // already in role defaults
    const existing = byCategory.get(catId) ?? { maxRating: 0, evidence: [] }
    if (rating > existing.maxRating) existing.maxRating = rating
    const snippet = reasoning[skillId]
    if (snippet) existing.evidence.push(snippet)
    byCategory.set(catId, existing)
  }

  const candidates: CvDerivedCategory[] = []
  for (const [categoryId, data] of byCategory) {
    if (data.evidence.length === 0) continue // evidence gate
    candidates.push({
      categoryId,
      confidence: Math.min(1, data.maxRating / 5),
      evidenceSnippets: data.evidence.slice(0, 3),
    })
  }

  candidates.sort((a, b) => b.confidence - a.confidence || a.categoryId.localeCompare(b.categoryId))
  return candidates.slice(0, PHASE_6_TOP_N)
}

// Save candidate ratings (public — autosave)
evaluateRouter.put('/:id/ratings', (req, res) => {
  const row = getCandidateGuard(req.params.id, res)
  if (!row) return

  const { ratings, experience, skippedCategories, version } = req.body

  const ratingsError = validateRatings(ratings)
  if (ratingsError) {
    res.status(400).json({ error: ratingsError })
    return
  }

  const result = getDb().prepare(
    `UPDATE candidates SET ratings = ?, experience = ?, skipped_categories = ?, version = version + 1
     WHERE id = ? AND submitted_at IS NULL${version !== undefined ? ' AND version = ?' : ''}`
  ).run(
    JSON.stringify(ratings),
    JSON.stringify(experience ?? {}),
    JSON.stringify(Array.isArray(skippedCategories) ? skippedCategories : []),
    req.params.id,
    ...(version !== undefined ? [version] : []),
  )

  if (result.changes === 0) {
    res.status(409).json({ error: 'Version obsolète ou évaluation déjà soumise' })
    return
  }

  const updated = getDb().prepare('SELECT version FROM candidates WHERE id = ?').get(req.params.id) as { version: number }
  res.json({ ok: true, version: updated.version })
})

// Submit candidate evaluation (public — one-time, atomic with final ratings)
evaluateRouter.post('/:id/submit', (req, res) => {
  const row = getCandidateGuard(req.params.id, res)
  if (!row) return // checks: exists, not expired, not already submitted

  // Accept optional final ratings payload to prevent autosave race
  const { ratings, experience, skippedCategories } = req.body ?? {}

  // Validate ratings if provided (same validation as PUT /ratings)
  if (ratings) {
    const ratingsError = validateRatings(ratings)
    if (ratingsError) {
      res.status(400).json({ error: ratingsError })
      return
    }
  }

  const now = new Date().toISOString()
  const db = getDb()

  // Atomic: save final ratings + set submitted_at in one transaction
  const submitTransaction = db.transaction(() => {
    if (ratings && typeof ratings === 'object' && !Array.isArray(ratings)) {
      db.prepare(
        'UPDATE candidates SET ratings = ?, experience = ?, skipped_categories = ?, version = version + 1 WHERE id = ?'
      ).run(
        JSON.stringify(ratings),
        JSON.stringify(experience ?? {}),
        JSON.stringify(Array.isArray(skippedCategories) ? skippedCategories : []),
        req.params.id,
      )
    }
    const submitResult = db.prepare('UPDATE candidates SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL').run(now, req.params.id)
    if (submitResult.changes === 0) {
      throw new Error('ALREADY_SUBMITTED')
    }
  })

  try {
    submitTransaction()
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_SUBMITTED') {
      res.status(409).json({ error: 'Évaluation déjà soumise' })
      return
    }
    throw err
  }

  // Rescore every linked candidature via the shared helper. Same 3-way
  // merge (ai + role_aware + manual) everywhere — no more pill/modal drift.
  const linkedCandidatures = db.prepare(`
    SELECT id FROM candidatures WHERE candidate_id = ?
  `).all(req.params.id) as { id: string }[]

  for (const cand of linkedCandidatures) {
    rescoreCandidature(cand.id)

    // Auto-advance to skill_radar_complete if currently at skill_radar_envoye.
    // CAS UPDATE + audit event insert are wrapped together so we can never
    // land in a state where candidatures.statut advanced but the
    // candidature_events trail is missing its status_change row — that would
    // leave revert unable to roll back, and break the per-stage history. The
    // SSE publish is moved OUT of the transaction (publishing is a side
    // effect; if it threw, the tx would roll back and the status advance
    // would be lost).
    let advanced = false
    db.transaction(() => {
      const advanceResult = db.prepare('UPDATE candidatures SET statut = ?, updated_at = datetime(\'now\') WHERE id = ? AND statut = ?')
        .run('skill_radar_complete', cand.id, 'skill_radar_envoye')
      if (advanceResult.changes > 0) {
        db.prepare(`
          INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, notes, created_by)
          VALUES (?, 'status_change', 'skill_radar_envoye', 'skill_radar_complete', 'Auto: évaluation soumise par le candidat', 'system')
        `).run(cand.id)
        advanced = true
      }
    })()
    if (advanced) {
      // Broadcast after the transaction commits so any open SSE stream
      // (recruiter watching the candidate detail page or the pipeline)
      // updates without a manual reload.
      recruitmentBus.publish('status_changed', {
        candidatureId: cand.id,
        statutFrom: 'skill_radar_envoye',
        statutTo: 'skill_radar_complete',
        byUserSlug: 'system',
      })
    }
  }

  // Notify the lead who created this candidate (non-blocking)
  const baseUrl = process.env.BETTER_AUTH_URL || 'https://radar.sinapse.nc'
  const leadSlug = row.created_by
  if (leadSlug) {
    const leadEmail = leadSlug.replaceAll('-', '.') + '@sinapse.nc'
    sendCandidateSubmitted({
      to: leadEmail,
      candidateName: row.name,
      role: row.role,
      detailUrl: `${baseUrl}/recruit/${req.params.id}`,
    }).catch(() => {})
  }

  res.json({ ok: true, submittedAt: now })
})

// Reopen a submitted evaluation (lead only)
evaluateRouter.post('/:id/reopen', requireLead, (req, res) => {
  const db = getDb()
  const candidate = db.prepare('SELECT id, submitted_at, ratings FROM candidates WHERE id = ?')
    .get(req.params.id) as { id: string; submitted_at: string | null; ratings: string } | undefined

  if (!candidate) {
    res.status(404).json({ error: 'Candidat introuvable' })
    return
  }
  if (!candidate.submitted_at) {
    res.status(400).json({ error: 'Évaluation pas encore soumise' })
    return
  }

  // Snapshot current ratings before reopen
  const user = getUser(req)
  db.prepare(`INSERT INTO candidature_events (candidature_id, type, notes, created_by)
    SELECT c.id, 'evaluation_reopened', ?, ?
    FROM candidatures c WHERE c.candidate_id = ?`)
    .run(JSON.stringify({ ratings_snapshot: candidate.ratings, reopened_at: new Date().toISOString() }),
      user.slug ?? 'system', req.params.id)

  db.prepare('UPDATE candidates SET submitted_at = NULL WHERE id = ?').run(req.params.id)

  res.json({ ok: true })
})

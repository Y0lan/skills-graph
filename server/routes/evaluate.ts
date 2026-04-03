import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getDb, getRoleCategories } from '../lib/db.js'
import { sendCandidateSubmitted } from '../lib/email.js'
import { validateRatings } from '../lib/validation.js'
import { safeJsonParse, type CandidateRow } from '../lib/types.js'
import { calculatePosteCompatibility, calculateEquipeCompatibility, calculateGlobalScore } from '../lib/compatibility.js'

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
    .prepare('SELECT id, name, role, role_id, created_by, expires_at, submitted_at, ratings, ai_suggestions FROM candidates WHERE id = ?')
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

  res.json({
    id: row.id,
    name: row.name,
    role: row.role,
    submitted: !!row.submitted_at,
    aiSuggestions: safeJsonParse(row.ai_suggestions, null),
    roleCategories: row.role_id ? getRoleCategories(row.role_id) : null,
  })
})

// Save candidate ratings (public — autosave)
evaluateRouter.put('/:id/ratings', (req, res) => {
  const row = getCandidateGuard(req.params.id, res)
  if (!row) return

  const { ratings, experience, skippedCategories } = req.body

  const ratingsError = validateRatings(ratings)
  if (ratingsError) {
    res.status(400).json({ error: ratingsError })
    return
  }

  getDb().prepare(
    'UPDATE candidates SET ratings = ?, experience = ?, skipped_categories = ? WHERE id = ?'
  ).run(
    JSON.stringify(ratings),
    JSON.stringify(experience ?? {}),
    JSON.stringify(Array.isArray(skippedCategories) ? skippedCategories : []),
    req.params.id,
  )

  res.json({ ok: true })
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
        'UPDATE candidates SET ratings = ?, experience = ?, skipped_categories = ? WHERE id = ?'
      ).run(
        JSON.stringify(ratings),
        JSON.stringify(experience ?? {}),
        JSON.stringify(Array.isArray(skippedCategories) ? skippedCategories : []),
        req.params.id,
      )
    }
    db.prepare('UPDATE candidates SET submitted_at = ? WHERE id = ?').run(now, req.params.id)
  })

  submitTransaction()

  // Recalculate compatibility for any linked candidatures
  const candidateRatings = ratings ?? safeJsonParse<Record<string, number>>(row.ratings, {})
  const aiSuggestions = safeJsonParse<Record<string, number>>(row.ai_suggestions, {})
  const effectiveRatings = { ...aiSuggestions, ...candidateRatings }

  const linkedCandidatures = db.prepare(`
    SELECT c.id, c.poste_id, p.role_id
    FROM candidatures c JOIN postes p ON p.id = c.poste_id
    WHERE c.candidate_id = ?
  `).all(req.params.id) as { id: string; poste_id: string; role_id: string }[]

  for (const cand of linkedCandidatures) {
    const tauxPoste = calculatePosteCompatibility(effectiveRatings, cand.role_id)
    const tauxEquipe = calculateEquipeCompatibility(effectiveRatings, cand.role_id)

    // Read existing soft skill score (from Aboro, if available)
    const currentSoft = db.prepare(
      'SELECT taux_soft_skills FROM candidatures WHERE id = ?'
    ).get(cand.id) as { taux_soft_skills: number | null } | undefined
    const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, currentSoft?.taux_soft_skills ?? null)

    db.prepare(
      'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(tauxPoste, tauxEquipe, tauxGlobal, cand.id)

    // Auto-advance to skill_radar_complete if currently at skill_radar_envoye
    const currentStatut = db.prepare('SELECT statut FROM candidatures WHERE id = ?').get(cand.id) as { statut: string } | undefined
    if (currentStatut?.statut === 'skill_radar_envoye') {
      db.prepare('UPDATE candidatures SET statut = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run('skill_radar_complete', cand.id)
      db.prepare(`
        INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, notes, created_by)
        VALUES (?, 'status_change', 'skill_radar_envoye', 'skill_radar_complete', 'Auto: évaluation soumise par le candidat', 'system')
      `).run(cand.id)
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

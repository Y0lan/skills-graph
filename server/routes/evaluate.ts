import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getDb } from '../lib/db.js'
import { getSkillCategories } from '../lib/catalog.js'
import { sendCandidateSubmitted } from '../lib/email.js'

interface CandidateRow {
  id: string
  name: string
  role: string
  created_by: string
  expires_at: string
  ratings: string
  experience: string
  skipped_categories: string
  submitted_at: string | null
}

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
    .prepare('SELECT id, name, role, created_by, expires_at, submitted_at, ratings FROM candidates WHERE id = ?')
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

// Validate ratings: keys must be valid skill IDs, values must be integers 0-5
function validateRatings(ratings: unknown): string | null {
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
    return 'ratings doit être un objet'
  }
  const validSkillIds = new Set(
    getSkillCategories().flatMap(c => c.skills.map(s => s.id))
  )
  for (const [key, value] of Object.entries(ratings as Record<string, unknown>)) {
    if (!validSkillIds.has(key)) {
      return `Compétence inconnue: ${key}`
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) {
      return `Valeur invalide pour ${key}: doit être un entier entre 0 et 5`
    }
  }
  return null
}

// Get candidate form data (public — no ratings, no report)
evaluateRouter.get('/:id/form', (req, res) => {
  const row = getCandidateGuard(req.params.id, res, { allowSubmitted: true })
  if (!row) return

  res.json({
    id: row.id,
    name: row.name,
    role: row.role,
    submitted: !!row.submitted_at,
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

  // Notify the lead who created this candidate (non-blocking)
  const baseUrl = process.env.BETTER_AUTH_URL || 'https://radar.sinapse.nc'
  const leadSlug = row.created_by
  if (leadSlug) {
    // Derive lead email from slug (slug format: firstname-lastname → firstname.lastname@sinapse.nc)
    const leadEmail = leadSlug.replace('-', '.') + '@sinapse.nc'
    sendCandidateSubmitted({
      to: leadEmail,
      candidateName: row.name,
      role: row.role,
      detailUrl: `${baseUrl}/recruit/${req.params.id}`,
    }).catch(() => {})
  }

  res.json({ ok: true, submittedAt: now })
})

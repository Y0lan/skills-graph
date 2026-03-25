import { Router } from 'express'
import { getDb } from '../lib/db.js'

interface CandidateRow {
  id: string
  name: string
  role: string
  expires_at: string
  ratings: string
  experience: string
  skipped_categories: string
  submitted_at: string | null
}

export const evaluateRouter = Router()

// Get candidate form data (public — no ratings, no report)
evaluateRouter.get('/:id/form', (req, res) => {
  const row = getDb()
    .prepare('SELECT id, name, role, expires_at, submitted_at FROM candidates WHERE id = ?')
    .get(req.params.id) as Pick<CandidateRow, 'id' | 'name' | 'role' | 'expires_at' | 'submitted_at'> | undefined

  if (!row) {
    res.status(404).json({ error: 'Lien invalide' })
    return
  }

  if (new Date(row.expires_at) < new Date()) {
    res.status(410).json({ error: 'Ce lien a expiré. Contactez votre recruteur.', expired: true })
    return
  }

  res.json({
    id: row.id,
    name: row.name,
    role: row.role,
    submitted: !!row.submitted_at,
  })
})

// Save candidate ratings (public — autosave)
evaluateRouter.put('/:id/ratings', (req, res) => {
  const row = getDb()
    .prepare('SELECT id, expires_at, submitted_at FROM candidates WHERE id = ?')
    .get(req.params.id) as Pick<CandidateRow, 'id' | 'expires_at' | 'submitted_at'> | undefined

  if (!row) {
    res.status(404).json({ error: 'Candidat introuvable' })
    return
  }

  if (new Date(row.expires_at) < new Date()) {
    res.status(410).json({ error: 'Ce lien a expiré' })
    return
  }

  if (row.submitted_at) {
    res.status(409).json({ error: 'Évaluation déjà soumise' })
    return
  }

  const { ratings, experience, skippedCategories } = req.body
  if (!ratings || typeof ratings !== 'object') {
    res.status(400).json({ error: 'Format de données invalide' })
    return
  }

  getDb().prepare(
    'UPDATE candidates SET ratings = ?, experience = ?, skipped_categories = ? WHERE id = ?'
  ).run(
    JSON.stringify(ratings),
    JSON.stringify(experience ?? {}),
    JSON.stringify(skippedCategories ?? []),
    req.params.id,
  )

  res.json({ ok: true })
})

// Submit candidate evaluation (public — one-time)
evaluateRouter.post('/:id/submit', (req, res) => {
  const row = getDb()
    .prepare('SELECT id, expires_at, submitted_at, ratings FROM candidates WHERE id = ?')
    .get(req.params.id) as Pick<CandidateRow, 'id' | 'expires_at' | 'submitted_at' | 'ratings'> | undefined

  if (!row) {
    res.status(404).json({ error: 'Candidat introuvable' })
    return
  }

  if (row.submitted_at) {
    res.status(409).json({ error: 'Évaluation déjà soumise' })
    return
  }

  const now = new Date().toISOString()
  getDb().prepare('UPDATE candidates SET submitted_at = ? WHERE id = ?').run(now, req.params.id)

  res.json({ ok: true, submittedAt: now })
})

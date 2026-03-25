import { Router } from 'express'
import crypto from 'crypto'
import { getDb } from '../lib/db.js'
import { requireLead } from '../middleware/require-lead.js'
import { generateCandidateAnalysis } from '../lib/candidate-analysis.js'

interface AuthUser {
  id: string
  slug: string | null
  [key: string]: unknown
}

interface CandidateRow {
  id: string
  name: string
  role: string
  email: string | null
  created_by: string
  created_at: string
  expires_at: string
  ratings: string
  experience: string
  skipped_categories: string
  submitted_at: string | null
  ai_report: string | null
  notes: string | null
}

export const candidatesRouter = Router()

// All routes require auth + lead (applied in index.ts middleware chain)
candidatesRouter.use(requireLead)

// List all candidates
candidatesRouter.get('/', (_req, res) => {
  const rows = getDb()
    .prepare('SELECT id, name, role, email, created_by, created_at, expires_at, submitted_at, ai_report IS NOT NULL as has_report FROM candidates ORDER BY created_at DESC')
    .all() as (Pick<CandidateRow, 'id' | 'name' | 'role' | 'email' | 'created_by' | 'created_at' | 'expires_at' | 'submitted_at'> & { has_report: number })[]

  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    role: r.role,
    email: r.email,
    createdBy: r.created_by,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    submittedAt: r.submitted_at,
    hasReport: !!r.has_report,
  })))
})

// Create candidate
candidatesRouter.post('/', (req, res) => {
  const { name, role, email } = req.body
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Le nom est requis' })
    return
  }
  if (!role || typeof role !== 'string' || !role.trim()) {
    res.status(400).json({ error: 'Le poste est requis' })
    return
  }

  const user = (req as typeof req & { user: AuthUser }).user
  const id = crypto.randomUUID()

  getDb().prepare(
    'INSERT INTO candidates (id, name, role, email, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name.trim(), role.trim(), email?.trim() || null, user.slug)

  const candidate = getDb().prepare('SELECT * FROM candidates WHERE id = ?').get(id) as CandidateRow

  res.status(201).json({
    ...formatCandidate(candidate),
    evaluationLink: `/evaluate/${id}`,
  })
})

// Get candidate detail
candidatesRouter.get('/:id', (req, res) => {
  const candidate = getDb().prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id) as CandidateRow | undefined
  if (!candidate) {
    res.status(404).json({ error: 'Candidat introuvable' })
    return
  }
  res.json(formatCandidate(candidate))
})

// Update notes
candidatesRouter.patch('/:id/notes', (req, res) => {
  const { notes } = req.body
  const result = getDb().prepare('UPDATE candidates SET notes = ? WHERE id = ?').run(notes ?? null, req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Candidat introuvable' })
    return
  }
  res.json({ ok: true })
})

// Generate AI analysis
candidatesRouter.post('/:id/analyze', async (req, res) => {
  try {
    const report = await generateCandidateAnalysis(req.params.id)
    res.json({ report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'analyse'
    console.error('[AI] Candidate analysis error:', err)
    res.status(500).json({ error: message })
  }
})

// Delete candidate
candidatesRouter.delete('/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM candidates WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Candidat introuvable' })
    return
  }
  res.json({ ok: true })
})

function formatCandidate(row: CandidateRow) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ratings: JSON.parse(row.ratings),
    experience: JSON.parse(row.experience),
    skippedCategories: JSON.parse(row.skipped_categories),
    submittedAt: row.submitted_at,
    aiReport: row.ai_report,
    notes: row.notes,
  }
}

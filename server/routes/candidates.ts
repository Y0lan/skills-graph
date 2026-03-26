import { Router } from 'express'
import crypto from 'crypto'
import { Readable } from 'stream'
import busboy from 'busboy'
import rateLimit from 'express-rate-limit'
import { getDb, getRole } from '../lib/db.js'
import { requireLead } from '../middleware/require-lead.js'
import { generateCandidateAnalysis } from '../lib/candidate-analysis.js'
import { sendCandidateInvite } from '../lib/email.js'
import { extractCvText, extractSkillsFromCv } from '../lib/cv-extraction.js'
import { getSkillCategories } from '../lib/catalog.js'
import { safeJsonParse, type CandidateRow } from '../lib/types.js'

interface AuthUser {
  id: string
  slug: string | null
  [key: string]: unknown
}

interface ParsedUpload {
  fields: Record<string, string>
  file: { buffer: Buffer; mimetype: string } | null
}

function parsePdfUpload(req: import('express').Request): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    let file: { buffer: Buffer; mimetype: string } | null = null
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: 10 * 1024 * 1024, files: 1 }
    })
    bb.on('field', (name: string, val: string) => { fields[name] = val })
    bb.on('file', (_name: string, stream: Readable, info: { mimeType: string }) => {
      const allowedMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
      if (!allowedMimes.includes(info.mimeType)) {
        stream.resume() // drain
        return
      }
      const chunks: Buffer[] = []
      let truncated = false
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('limit', () => { truncated = true })
      stream.on('end', () => {
        if (!truncated) {
          file = { buffer: Buffer.concat(chunks), mimetype: info.mimeType }
        }
      })
    })
    bb.on('close', () => { clearTimeout(timer); resolve({ fields, file }) })
    bb.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
    const timer = setTimeout(() => { req.unpipe(bb); reject(new Error('Upload timeout')) }, 30000)
    req.pipe(bb)
  })
}

export const candidatesRouter = Router()

// All routes require auth + lead (applied in index.ts middleware chain)
candidatesRouter.use(requireLead)

// Rate limit candidate creation to prevent Claude API cost abuse (5 per minute per user)
const createRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de candidats créés. Réessayez dans une minute.' },
})

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
candidatesRouter.post('/', createRateLimit, async (req, res) => {
  let name: string | undefined
  let role: string | undefined
  let roleId: string | undefined
  let email: string | undefined
  let file: { buffer: Buffer; mimetype: string } | null = null

  const contentType = req.headers['content-type'] || ''
  if (contentType.startsWith('multipart/')) {
    try {
      const parsed = await parsePdfUpload(req)
      name = parsed.fields.name
      roleId = parsed.fields.roleId
      email = parsed.fields.email
      file = parsed.file
    } catch {
      res.status(400).json({ error: 'Erreur lors du téléchargement du fichier' })
      return
    }
  } else {
    name = req.body.name
    role = req.body.role
    roleId = req.body.roleId
    email = req.body.email
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Le nom est requis' })
    return
  }

  // Resolve role from roleId or free-text
  let resolvedRoleId: string | null = null
  if (roleId) {
    const roleRow = getRole(roleId)
    if (!roleRow) {
      res.status(400).json({ error: 'Rôle invalide' })
      return
    }
    role = roleRow.label
    resolvedRoleId = roleId
  } else if (!role || typeof role !== 'string' || !role.trim()) {
    res.status(400).json({ error: 'Le poste est requis' })
    return
  }

  const user = (req as typeof req & { user: AuthUser }).user
  const id = crypto.randomUUID()

  getDb().prepare(
    'INSERT INTO candidates (id, name, role, role_id, email, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name.trim(), role!.trim(), resolvedRoleId, email?.trim() || null, user.slug)

  // Process CV if uploaded
  let suggestionsCount = 0
  if (file) {
    try {
      const cvText = await extractCvText(file.buffer)
      const catalog = getSkillCategories()
      const suggestions = await extractSkillsFromCv(cvText, catalog)
      getDb().prepare('UPDATE candidates SET cv_text = ?, ai_suggestions = ? WHERE id = ?')
        .run(cvText, suggestions ? JSON.stringify(suggestions) : null, id)
      suggestionsCount = suggestions ? Object.keys(suggestions).length : 0
    } catch (err) {
      console.error('[CV] Error processing CV for candidate', id, err)
    }
  }

  // Re-fetch after CV processing for consistent response
  const candidate = getDb().prepare('SELECT * FROM candidates WHERE id = ?').get(id) as CandidateRow

  // Send invite email if candidate has an email address
  const baseUrl = process.env.BETTER_AUTH_URL || `${req.protocol}://${req.get('host')}`
  const evaluationUrl = `${baseUrl}/evaluate/${id}`

  if (email?.trim()) {
    sendCandidateInvite({
      to: email.trim(),
      candidateName: name.trim(),
      role: role!.trim(),
      evaluationUrl,
    }).catch(() => {}) // non-blocking
  }

  res.status(201).json({
    ...formatCandidate(candidate),
    evaluationLink: `/evaluate/${id}`,
    emailSent: !!email?.trim(),
    suggestionsCount,
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
    roleId: row.role_id,
    email: row.email,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ratings: safeJsonParse(row.ratings, {}),
    experience: safeJsonParse(row.experience, {}),
    skippedCategories: safeJsonParse(row.skipped_categories, []),
    submittedAt: row.submitted_at,
    aiReport: row.ai_report,
    aiSuggestions: safeJsonParse(row.ai_suggestions, null),
    notes: row.notes,
  }
}

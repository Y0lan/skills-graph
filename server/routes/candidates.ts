import { Router } from 'express'
import crypto from 'crypto'
import { Readable } from 'stream'
import busboy from 'busboy'
import rateLimit from 'express-rate-limit'
import { getDb, getRole } from '../lib/db.js'
import { requireLead } from '../middleware/require-lead.js'
import { generateCandidateAnalysis } from '../lib/candidate-analysis.js'
import { sendCandidateInvite } from '../lib/email.js'
import { processCvForCandidate } from '../lib/cv-pipeline.js'
import { setProfileFieldLock } from '../lib/profile-merge.js'
import { safeJsonParse, getUser, type CandidateRow } from '../lib/types.js'
import fs from 'fs'

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

// List all candidates (with most-advanced pipeline status across candidatures)
candidatesRouter.get('/', (_req, res) => {
  const rows = getDb()
    .prepare(`SELECT c.id, c.name, c.role, c.email, c.created_by, c.created_at, c.expires_at, c.submitted_at,
      c.ai_report IS NOT NULL as has_report,
      (SELECT statut FROM candidatures WHERE candidate_id = c.id
       ORDER BY CASE statut
         WHEN 'embauche' THEN 9 WHEN 'proposition' THEN 8
         WHEN 'entretien_2' THEN 7 WHEN 'aboro' THEN 6
         WHEN 'entretien_1' THEN 5 WHEN 'skill_radar_complete' THEN 4
         WHEN 'skill_radar_envoye' THEN 3 WHEN 'preselectionne' THEN 2
         WHEN 'postule' THEN 1 WHEN 'refuse' THEN 0 ELSE -1 END DESC
       LIMIT 1) as pipeline_status,
      (SELECT COUNT(*) FROM candidatures WHERE candidate_id = c.id) as candidature_count
    FROM candidates c ORDER BY c.created_at DESC`)
    .all() as (Pick<CandidateRow, 'id' | 'name' | 'role' | 'email' | 'created_by' | 'created_at' | 'expires_at' | 'submitted_at'> & { has_report: number; pipeline_status: string | null; candidature_count: number })[]

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
    pipelineStatus: r.pipeline_status,
    candidatureCount: r.candidature_count,
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

  const user = getUser(req)

  // Email-level dedup: if a candidate with this email already exists, refresh
  // their fields (last-write-wins on optional metadata, never on identity) and
  // return the existing id rather than creating a second row. Mirrors the
  // intake-service.ts behaviour so admin manual-create stays consistent with
  // Drupal webhook intake.
  let id: string
  const existing = email?.trim()
    ? getDb().prepare('SELECT id FROM candidates WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1').get(email.trim()) as { id: string } | undefined
    : undefined

  if (existing) {
    id = existing.id
    // Update name only if missing on existing (don't clobber a verified name).
    getDb().prepare(`
      UPDATE candidates SET
        name = COALESCE(NULLIF(name, ''), ?),
        role = COALESCE(NULLIF(role, ''), ?),
        role_id = COALESCE(role_id, ?)
      WHERE id = ?
    `).run(name.trim(), role!.trim(), resolvedRoleId, id)
  } else {
    id = crypto.randomUUID()
    getDb().prepare(
      'INSERT INTO candidates (id, name, role, role_id, email, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name.trim(), role!.trim(), resolvedRoleId, email?.trim() || null, user.slug)
  }

  // Auto-create candidature if roleId maps to open postes.
  // MUST happen BEFORE CV processing so the pipeline has candidatures to score.
  if (resolvedRoleId) {
    const openPostes = getDb().prepare(
      "SELECT id FROM postes WHERE role_id = ? AND statut = 'ouvert' ORDER BY created_at ASC"
    ).all(resolvedRoleId) as { id: string }[]

    for (const poste of openPostes) {
      const candidatureId = crypto.randomUUID()
      getDb().prepare(`INSERT OR IGNORE INTO candidatures (id, candidate_id, poste_id, statut, canal)
        VALUES (?, ?, ?, 'postule', 'candidature_directe')`)
        .run(candidatureId, id, poste.id)
      getDb().prepare(`INSERT INTO candidature_events (candidature_id, type, statut_to, notes, created_by)
        VALUES (?, 'status_change', 'postule', 'Création manuelle', ?)`)
        .run(candidatureId, user?.slug ?? 'system')
    }
  }

  // Process CV through the shared pipeline. Never duplicate this flow — see
  // server/lib/cv-pipeline.ts and the Phase 0 brief in the plan file.
  let suggestionsCount = 0
  let extractionStatus: string = 'idle'
  if (file) {
    const pipelineResult = await processCvForCandidate(id, file.buffer, { source: 'direct-upload' })
    suggestionsCount = pipelineResult.suggestionsCount
    extractionStatus = pipelineResult.status
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
    extractionStatus,
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

// Lock / unlock a single profile field (Phase 4).
// Body: { fieldPath: "contact.phone", locked: boolean }
// Locking a field prevents subsequent re-extractions from overwriting its value.
candidatesRouter.patch('/:id/profile-lock', (req, res) => {
  const { fieldPath, locked } = req.body ?? {}
  if (typeof fieldPath !== 'string' || fieldPath.length === 0) {
    res.status(400).json({ error: 'fieldPath requis' })
    return
  }
  if (typeof locked !== 'boolean') {
    res.status(400).json({ error: 'locked requis (boolean)' })
    return
  }
  const user = getUser(req)
  const result = setProfileFieldLock({
    candidateId: req.params.id,
    fieldPath,
    locked,
    userSlug: user?.slug ?? null,
  })
  if (result.notFound) { res.status(404).json({ error: 'Candidat introuvable' }); return }
  if (!result.ok) { res.status(400).json({ error: result.error ?? 'bad path' }); return }
  res.json({ ok: true, fieldPath, locked })
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

// Delete candidate (cascade deletes candidatures, events, documents, aboro profiles via DB schema)
candidatesRouter.delete('/:id', (req, res) => {
  try {
    const db = getDb()

    // Check candidate exists and count related records before deleting
    const candidate = db.prepare('SELECT id, name FROM candidates WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined
    if (!candidate) {
      res.status(404).json({ error: 'Candidat introuvable' })
      return
    }

    // Clean up document files from disk before DB cascade delete removes the references
    const docs = db.prepare(
      'SELECT cd.path FROM candidature_documents cd JOIN candidatures c ON c.id = cd.candidature_id WHERE c.candidate_id = ?'
    ).all(req.params.id) as { path: string }[]

    // Delete candidate (DB cascade handles candidatures, events, documents, aboro_profiles)
    db.prepare('DELETE FROM candidates WHERE id = ?').run(req.params.id)

    // Clean up orphaned files (non-blocking, best-effort)
    if (docs.length > 0) {
      for (const doc of docs) {
        try { fs.unlinkSync(doc.path) } catch { /* file may already be gone */ }
      }
    }

    console.log(`[DELETE] Candidate ${candidate.name} (${req.params.id}) deleted, ${docs.length} files cleaned`)
    res.json({ ok: true })
  } catch (err) {
    console.error('[DELETE] Error deleting candidate:', err)
    res.status(500).json({ error: 'Erreur lors de la suppression' })
  }
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
    aiReasoning: safeJsonParse<Record<string, string>>(row.ai_reasoning, {}),
    aiQuestions: safeJsonParse<Record<string, string>>(row.ai_questions, {}),
    aiProfile: row.ai_profile ? safeJsonParse<Record<string, unknown>>(row.ai_profile, {}) : null,
    extractionStatus: row.extraction_status,
    extractionAttempts: row.extraction_attempts,
    lastExtractionAt: row.last_extraction_at,
    lastExtractionError: row.last_extraction_error,
    promptVersion: row.prompt_version,
    notes: row.notes,
    telephone: row.telephone ?? null,
    pays: row.pays ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    githubUrl: row.github_url ?? null,
    canal: row.canal ?? null,
    hasCv: !!row.cv_text,
  }
}

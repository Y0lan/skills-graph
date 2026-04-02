import { Router } from 'express'
import crypto from 'crypto'
import { Readable } from 'stream'
import busboy from 'busboy'
import rateLimit from 'express-rate-limit'
import { getDb } from '../lib/db.js'
import { requireLead } from '../middleware/require-lead.js'
import { extractCvText, extractSkillsFromCv } from '../lib/cv-extraction.js'
import { getSkillCategories } from '../lib/catalog.js'
import { sendCandidateInvite } from '../lib/email.js'
import { calculatePosteCompatibility, calculateEquipeCompatibility, getGapAnalysis } from '../lib/compatibility.js'
import { extractAboroText, extractAboroProfile } from '../lib/aboro-extraction.js'
import { safeJsonParse, type PosteRow, type CandidatureRow, type CandidatureEventRow } from '../lib/types.js'

interface AuthUser {
  id: string
  slug: string | null
  [key: string]: unknown
}

function getUser(req: import('express').Request): AuthUser {
  return (req as typeof req & { user: AuthUser }).user
}

interface ParsedIntake {
  fields: Record<string, string>
  files: Map<string, { buffer: Buffer; mimetype: string; filename: string }>
}

function parseMultipartIntake(req: import('express').Request): Promise<ParsedIntake> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    const files = new Map<string, { buffer: Buffer; mimetype: string; filename: string }>()
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: 10 * 1024 * 1024, files: 2 }
    })
    bb.on('field', (name: string, val: string) => { fields[name] = val })
    const allowedMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
    bb.on('file', (name: string, stream: Readable, info: { filename: string; mimeType: string }) => {
      if (!allowedMimes.includes(info.mimeType)) {
        stream.resume() // drain non-allowed file
        return
      }
      const chunks: Buffer[] = []
      let truncated = false
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('limit', () => { truncated = true })
      stream.on('end', () => {
        if (!truncated) {
          files.set(name, { buffer: Buffer.concat(chunks), mimetype: info.mimeType, filename: info.filename })
        }
      })
    })
    bb.on('close', () => { clearTimeout(timer); resolve({ fields, files }) })
    bb.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
    const timer = setTimeout(() => { req.unpipe(bb); reject(new Error('Upload timeout')) }, 30000)
    req.pipe(bb)
  })
}

export const recruitmentRouter = Router()

// ─── Public intake endpoint (from Drupal webhook) ──────────────────
const intakeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de candidatures. Réessayez dans une minute.' },
})

const WEBHOOK_SECRET = process.env.DRUPAL_WEBHOOK_SECRET

recruitmentRouter.post('/intake', intakeRateLimit, async (req, res) => {
  // Validate webhook secret if configured
  if (WEBHOOK_SECRET) {
    const provided = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '')
    if (!provided || provided !== WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Webhook secret invalide' })
      return
    }
  }

  try {
    let fields: Record<string, string>
    let cvFile: { buffer: Buffer; mimetype: string } | null = null

    const contentType = req.headers['content-type'] || ''
    if (contentType.startsWith('multipart/')) {
      const parsed = await parseMultipartIntake(req)
      fields = parsed.fields
      const cv = parsed.files.get('cv')
      if (cv) cvFile = { buffer: cv.buffer, mimetype: cv.mimetype }
    } else {
      fields = req.body
    }

    const { nom, prenom, email, telephone, pays, poste_vise, linkedin, github, message, canal } = fields

    if (!nom || !email || !poste_vise) {
      res.status(400).json({ error: 'nom, email, et poste_vise sont requis' })
      return
    }

    // Validate poste exists
    const poste = getDb().prepare('SELECT * FROM postes WHERE id = ?').get(poste_vise) as PosteRow | undefined
    if (!poste) {
      res.status(400).json({ error: `Poste invalide: ${poste_vise}` })
      return
    }

    // Check idempotence: same email + same poste = update existing
    const existingCandidature = getDb().prepare(`
      SELECT c.id as candidature_id, c.candidate_id
      FROM candidatures c
      JOIN candidates cand ON cand.id = c.candidate_id
      WHERE cand.email = ? AND c.poste_id = ?
    `).get(email.trim(), poste_vise) as { candidature_id: string; candidate_id: string } | undefined

    if (existingCandidature) {
      res.json({ ok: true, candidatureId: existingCandidature.candidature_id, updated: true })
      return
    }

    const fullName = prenom ? `${prenom.trim()} ${nom.trim()}` : nom.trim()
    const candidateId = crypto.randomUUID()
    const candidatureId = crypto.randomUUID()
    const resolvedCanal = canal?.trim() || 'site'

    // Atomic creation: candidate + candidature + event
    const createIntake = getDb().transaction(() => {
      getDb().prepare(`
        INSERT INTO candidates (id, name, role, role_id, email, created_by, telephone, pays, linkedin_url, github_url, canal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidateId, fullName, poste.titre, poste.role_id, email.trim(),
        'drupal-webhook', telephone?.trim() || null, pays?.trim() || null,
        linkedin?.trim() || null, github?.trim() || null, resolvedCanal,
      )

      getDb().prepare(`
        INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal)
        VALUES (?, ?, ?, 'postule', ?)
      `).run(candidatureId, candidateId, poste_vise, resolvedCanal)

      getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, statut_to, notes, created_by)
        VALUES (?, 'status_change', 'postule', ?, 'drupal-webhook')
      `).run(candidatureId, message?.trim() || null)
    })
    createIntake()

    // Process CV asynchronously (outside transaction — external API call)
    if (cvFile) {
      try {
        const cvText = await extractCvText(cvFile.buffer)
        const catalog = getSkillCategories()
        const result = await extractSkillsFromCv(cvText, catalog)
        const suggestions = result?.ratings ?? null
        getDb().prepare('UPDATE candidates SET cv_text = ?, ai_suggestions = ? WHERE id = ?')
          .run(cvText, suggestions ? JSON.stringify(suggestions) : null, candidateId)

        // Update compatibility scores after CV extraction
        if (suggestions && Object.keys(suggestions).length > 0) {
          const tauxPoste = calculatePosteCompatibility(suggestions, poste.role_id)
          const tauxEquipe = calculateEquipeCompatibility(suggestions, poste.role_id)
          getDb().prepare(
            'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, updated_at = datetime(\'now\') WHERE id = ?'
          ).run(tauxPoste, tauxEquipe, candidatureId)
        }
      } catch (err) {
        console.error('[Intake] CV processing error:', err)
      }
    }

    // TODO: Send notification email to Guillaume

    res.status(201).json({ ok: true, candidatureId, candidateId, updated: false })
  } catch (err) {
    console.error('[Intake] Error:', err)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── Protected routes (require lead) ────────────────────────────────
const protectedRouter = Router()
protectedRouter.use(requireLead)

// List all postes with candidate counts
protectedRouter.get('/postes', (_req, res) => {
  const postes = getDb().prepare(`
    SELECT p.*,
      r.label as role_label,
      (SELECT COUNT(*) FROM candidatures c WHERE c.poste_id = p.id) as candidate_count,
      (SELECT COUNT(*) FROM candidatures c WHERE c.poste_id = p.id AND c.statut NOT IN ('refuse', 'embauche')) as active_count
    FROM postes p
    JOIN roles r ON r.id = p.role_id
    ORDER BY p.pole, p.titre
  `).all() as (PosteRow & { role_label: string; candidate_count: number; active_count: number })[]

  res.json(postes.map(p => ({
    id: p.id,
    roleId: p.role_id,
    titre: p.titre,
    pole: p.pole,
    headcount: p.headcount,
    headcountFlexible: !!p.headcount_flexible,
    experienceMin: p.experience_min,
    cigref: p.cigref,
    contrat: p.contrat,
    statut: p.statut,
    candidateCount: p.candidate_count,
    activeCount: p.active_count,
  })))
})

// List candidatures with filters
protectedRouter.get('/candidatures', (req, res) => {
  const { poste, pole, statut } = req.query
  let sql = `
    SELECT c.*, cand.name, cand.email, cand.cv_text IS NOT NULL as has_cv,
      cand.ai_suggestions, cand.submitted_at as evaluation_submitted,
      p.titre as poste_titre, p.pole as poste_pole,
      (SELECT MAX(ce.created_at) FROM candidature_events ce WHERE ce.candidature_id = c.id) as last_event_at
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    JOIN postes p ON p.id = c.poste_id
    WHERE 1=1
  `
  const params: string[] = []

  if (poste && typeof poste === 'string') {
    sql += ' AND c.poste_id = ?'
    params.push(poste)
  }
  if (pole && typeof pole === 'string') {
    sql += ' AND p.pole = ?'
    params.push(pole)
  }
  if (statut && typeof statut === 'string') {
    sql += ' AND c.statut = ?'
    params.push(statut)
  }

  sql += ' ORDER BY c.taux_compatibilite_poste DESC NULLS LAST, c.created_at DESC'

  const rows = getDb().prepare(sql).all(...params) as (CandidatureRow & {
    name: string; email: string | null; has_cv: number;
    ai_suggestions: string | null; evaluation_submitted: string | null;
    poste_titre: string; poste_pole: string
  })[]

  res.json(rows.map(r => ({
    id: r.id,
    candidateId: r.candidate_id,
    posteId: r.poste_id,
    posteTitre: r.poste_titre,
    postePole: r.poste_pole,
    statut: r.statut,
    canal: r.canal,
    candidateName: r.name,
    candidateEmail: r.email,
    hasCv: !!r.has_cv,
    evaluationSubmitted: !!r.evaluation_submitted,
    tauxPoste: r.taux_compatibilite_poste,
    tauxEquipe: r.taux_compatibilite_equipe,
    notesDirecteur: r.notes_directeur,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastEventAt: (r as Record<string, unknown>).last_event_at as string | null,
  })))
})

// Get candidature detail
protectedRouter.get('/candidatures/:id', (req, res) => {
  const row = getDb().prepare(`
    SELECT
      c.id AS candidature_id, c.candidate_id, c.poste_id, c.statut AS candidature_statut,
      c.canal AS candidature_canal, c.notes_directeur, c.taux_compatibilite_poste,
      c.taux_compatibilite_equipe, c.created_at AS candidature_created_at,
      cand.name, cand.email, cand.telephone, cand.pays, cand.linkedin_url, cand.github_url,
      cand.ratings, cand.ai_suggestions, cand.submitted_at, cand.ai_report, cand.cv_text,
      p.titre AS poste_titre, p.pole AS poste_pole, p.role_id AS poste_role_id
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    JOIN postes p ON p.id = c.poste_id
    WHERE c.id = ?
  `).get(req.params.id) as Record<string, unknown> | undefined

  if (!row) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  // Get events
  const events = getDb().prepare(
    'SELECT * FROM candidature_events WHERE candidature_id = ? ORDER BY created_at ASC'
  ).all(req.params.id) as CandidatureEventRow[]

  // Get gap analysis
  const candidateRatings = safeJsonParse<Record<string, number>>(row.ratings as string, {})
  const aiSuggestions = safeJsonParse<Record<string, number>>(row.ai_suggestions as string, {})
  const effectiveRatings = { ...aiSuggestions, ...candidateRatings }
  const gaps = Object.keys(effectiveRatings).length > 0
    ? getGapAnalysis(effectiveRatings, row.poste_role_id as string)
    : []

  res.json({
    candidature: {
      id: row.candidature_id,
      posteId: row.poste_id,
      posteTitre: row.poste_titre,
      postePole: row.poste_pole,
      statut: row.candidature_statut,
      canal: row.candidature_canal,
      tauxPoste: row.taux_compatibilite_poste,
      tauxEquipe: row.taux_compatibilite_equipe,
      notesDirecteur: row.notes_directeur,
      createdAt: row.candidature_created_at,
    },
    candidate: {
      id: row.candidate_id,
      name: row.name,
      email: row.email,
      telephone: row.telephone ?? null,
      pays: row.pays ?? null,
      linkedinUrl: row.linkedin_url ?? null,
      githubUrl: row.github_url ?? null,
      ratings: candidateRatings,
      aiSuggestions,
      submittedAt: row.submitted_at,
      aiReport: row.ai_report,
      hasCv: !!row.cv_text,
    },
    events: events.map(e => ({
      id: e.id,
      type: e.type,
      statutFrom: e.statut_from,
      statutTo: e.statut_to,
      notes: e.notes,
      createdBy: e.created_by,
      createdAt: e.created_at,
    })),
    gaps,
  })
})

// ─── State machine ──────────────────────────────────────────────────
const TRANSITION_MAP: Record<string, string[]> = {
  postule: ['preselectionne', 'refuse'],
  preselectionne: ['skill_radar_envoye', 'entretien_1', 'refuse'],
  skill_radar_envoye: ['skill_radar_complete', 'refuse'],
  skill_radar_complete: ['entretien_1', 'refuse'],
  entretien_1: ['aboro', 'entretien_2', 'refuse'],
  aboro: ['entretien_2', 'refuse'],
  entretien_2: ['proposition', 'refuse'],
  proposition: ['embauche', 'refuse'],
  embauche: [],
  refuse: [],
}

// Steps that can be skipped (with a logged reason)
const SKIPPABLE_STEPS = new Set(['aboro', 'entretien_2', 'skill_radar_envoye'])

// Notes required for these transitions
const NOTES_REQUIRED = new Set(['refuse', 'embauche'])

function getAllowedTransitions(currentStatut: string): string[] {
  return TRANSITION_MAP[currentStatut] ?? []
}

function isSkipTransition(from: string, to: string): boolean {
  const directAllowed = TRANSITION_MAP[from] ?? []
  if (directAllowed.includes(to)) return false
  // Check if we're skipping intermediate steps
  const allStatuts = Object.keys(TRANSITION_MAP)
  const fromIdx = allStatuts.indexOf(from)
  const toIdx = allStatuts.indexOf(to)
  if (toIdx <= fromIdx || to === 'refuse') return false
  // Find skipped steps between from and to
  for (let i = fromIdx + 1; i < toIdx; i++) {
    if (!SKIPPABLE_STEPS.has(allStatuts[i])) return false
  }
  return true
}

function getSkippedSteps(from: string, to: string): string[] {
  const allStatuts = Object.keys(TRANSITION_MAP)
  const fromIdx = allStatuts.indexOf(from)
  const toIdx = allStatuts.indexOf(to)
  const skipped: string[] = []
  for (let i = fromIdx + 1; i < toIdx; i++) {
    skipped.push(allStatuts[i])
  }
  return skipped
}

// Get allowed transitions for a candidature (includes skip targets)
protectedRouter.get('/candidatures/:id/transitions', (req, res) => {
  const current = getDb().prepare('SELECT statut FROM candidatures WHERE id = ?').get(req.params.id) as { statut: string } | undefined
  if (!current) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  const direct = getAllowedTransitions(current.statut)

  // Find skip targets: look ahead past skippable steps
  const allStatuts = Object.keys(TRANSITION_MAP)
  const currentIdx = allStatuts.indexOf(current.statut)
  const skipTargets: { statut: string; skipped: string[] }[] = []

  if (currentIdx >= 0) {
    for (let i = currentIdx + 2; i < allStatuts.length; i++) {
      const target = allStatuts[i]
      if (target === 'refuse') continue
      if (direct.includes(target)) continue
      if (isSkipTransition(current.statut, target)) {
        skipTargets.push({ statut: target, skipped: getSkippedSteps(current.statut, target) })
      }
    }
  }

  res.json({
    currentStatut: current.statut,
    allowedTransitions: direct,
    skipTransitions: skipTargets,
    notesRequired: direct.filter(s => NOTES_REQUIRED.has(s)),
  })
})

// Change candidature status (with state machine validation)
protectedRouter.patch('/candidatures/:id/status', (req, res) => {
  const { statut, notes, skipReason, sendEmail } = req.body

  if (!statut || typeof statut !== 'string') {
    res.status(400).json({ error: 'Statut requis' })
    return
  }

  const current = getDb().prepare('SELECT statut FROM candidatures WHERE id = ?').get(req.params.id) as { statut: string } | undefined
  if (!current) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  const allowed = getAllowedTransitions(current.statut)
  const isSkip = isSkipTransition(current.statut, statut)

  if (!allowed.includes(statut) && !isSkip) {
    res.status(400).json({
      error: `Transition ${current.statut} → ${statut} non autorisée`,
      allowedTransitions: allowed,
      currentStatut: current.statut,
    })
    return
  }

  // Validate required notes
  if (NOTES_REQUIRED.has(statut) && (!notes || !notes.trim())) {
    res.status(400).json({ error: `Les notes sont obligatoires pour le statut "${statut}"` })
    return
  }

  // Validate skip reason
  if (isSkip && (!skipReason || !skipReason.trim())) {
    const skipped = getSkippedSteps(current.statut, statut)
    res.status(400).json({ error: `Raison requise pour sauter : ${skipped.join(', ')}` })
    return
  }

  const user = getUser(req)

  getDb().transaction(() => {
    getDb().prepare('UPDATE candidatures SET statut = ?, updated_at = datetime(\'now\') WHERE id = ?').run(statut, req.params.id)

    const eventNotes = isSkip
      ? `[Saut: ${getSkippedSteps(current.statut, statut).join(' → ')}] ${skipReason?.trim() ?? ''}\n${notes?.trim() ?? ''}`.trim()
      : notes?.trim() || null

    getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, notes, created_by)
      VALUES (?, 'status_change', ?, ?, ?, ?)
    `).run(req.params.id, current.statut, statut, eventNotes, user.slug || 'unknown')
  })()

  // Send evaluation email if transitioning to skill_radar_envoye and sendEmail is true
  let emailSent = false
  if (statut === 'skill_radar_envoye' && sendEmail) {
    const candidateInfo = getDb().prepare(`
      SELECT cand.name, cand.email, cand.role, cand.id as candidate_id
      FROM candidatures c JOIN candidates cand ON cand.id = c.candidate_id
      WHERE c.id = ?
    `).get(req.params.id) as { name: string; email: string | null; role: string; candidate_id: string } | undefined

    if (candidateInfo?.email) {
      const baseUrl = process.env.BETTER_AUTH_URL || `${req.protocol}://${req.get('host')}`
      sendCandidateInvite({
        to: candidateInfo.email,
        candidateName: candidateInfo.name,
        role: candidateInfo.role,
        evaluationUrl: `${baseUrl}/evaluate/${candidateInfo.candidate_id}`,
      }).then(() => {
        // Log email event
        getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, created_by)
          VALUES (?, 'email', ?, ?)
        `).run(req.params.id, `Lien d'évaluation envoyé à ${candidateInfo.email}`, user.slug || 'unknown')
      }).catch((err) => {
        console.error('[Email] Failed to send evaluation link:', err)
      })
      emailSent = true
    }
  }

  res.json({ ok: true, previousStatut: current.statut, newStatut: statut, skipped: isSkip, emailSent })
})

// Add note to candidature
protectedRouter.post('/candidatures/:id/notes', (req, res) => {
  const { notes } = req.body
  if (!notes || typeof notes !== 'string') {
    res.status(400).json({ error: 'Notes requises' })
    return
  }

  const exists = getDb().prepare('SELECT id FROM candidatures WHERE id = ?').get(req.params.id)
  if (!exists) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  const user = getUser(req)
  getDb().prepare('UPDATE candidatures SET notes_directeur = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(notes, req.params.id)

  // Log event
  getDb().prepare(`
    INSERT INTO candidature_events (candidature_id, type, notes, created_by)
    VALUES (?, 'note', ?, ?)
  `).run(req.params.id, notes, user.slug || 'unknown')

  res.json({ ok: true })
})

// Recalculate compatibility for a candidature
protectedRouter.post('/candidatures/:id/recalculate', (req, res) => {
  const row = getDb().prepare(`
    SELECT c.candidate_id, c.poste_id, p.role_id, p.pole, cand.ratings, cand.ai_suggestions
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    JOIN candidates cand ON cand.id = c.candidate_id
    WHERE c.id = ?
  `).get(req.params.id) as { candidate_id: string; poste_id: string; role_id: string; pole: string; ratings: string; ai_suggestions: string | null } | undefined

  if (!row) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  const candidateRatings = safeJsonParse<Record<string, number>>(row.ratings, {})
  const aiSuggestions = safeJsonParse<Record<string, number>>(row.ai_suggestions, {})
  const effectiveRatings = { ...aiSuggestions, ...candidateRatings }

  const tauxPoste = calculatePosteCompatibility(effectiveRatings, row.role_id)
  const tauxEquipe = calculateEquipeCompatibility(effectiveRatings, row.role_id)

  getDb().prepare(
    'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(tauxPoste, tauxEquipe, req.params.id)

  res.json({ tauxPoste, tauxEquipe })
})

// Upload document for a candidature (Aboro PDF, etc.)
protectedRouter.post('/candidatures/:id/documents', async (req, res) => {
  const exists = getDb().prepare('SELECT id FROM candidatures WHERE id = ?').get(req.params.id) as { id: string } | undefined
  if (!exists) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  try {
    const parsed = await parseMultipartIntake(req)
    const file = parsed.files.get('file')
    if (!file) {
      res.status(400).json({ error: 'Fichier requis' })
      return
    }

    const docType = parsed.fields.type || 'other'
    const dataDir = process.env.DATA_DIR || 'server/data'
    const docDir = `${dataDir}/documents/${req.params.id}`

    // Create directory
    const fs = await import('fs')
    const path = await import('path')
    fs.mkdirSync(docDir, { recursive: true })

    // Save file
    const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = path.join(docDir, safeFilename)
    fs.writeFileSync(filePath, file.buffer)

    // Save metadata
    const docId = crypto.randomUUID()
    const user = getUser(req)
    getDb().prepare(`
      INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(docId, req.params.id, docType, file.filename, filePath, user.slug || 'unknown')

    // Log event
    getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, notes, created_by)
      VALUES (?, 'document', ?, ?)
    `).run(req.params.id, `Document uploadé: ${file.filename} (${docType})`, user.slug || 'unknown')

    // Auto-extract Aboro profile if document type is 'aboro'
    let aboroProfile = null
    if (docType === 'aboro') {
      try {
        const pdfText = await extractAboroText(file.buffer)
        const profile = await extractAboroProfile(pdfText)

        // Find the candidate_id from the candidature
        const candidature = getDb().prepare(
          'SELECT candidate_id FROM candidatures WHERE id = ?'
        ).get(req.params.id) as { candidate_id: string } | undefined

        if (candidature) {
          const profileId = crypto.randomUUID()
          getDb().prepare(`
            INSERT OR REPLACE INTO aboro_profiles (id, candidate_id, profile_json, source_document_id, created_by)
            VALUES (?, ?, ?, ?, ?)
          `).run(profileId, candidature.candidate_id, JSON.stringify(profile), docId, user.slug || 'unknown')

          getDb().prepare(`
            INSERT INTO candidature_events (candidature_id, type, notes, created_by)
            VALUES (?, 'document', ?, ?)
          `).run(req.params.id, `Profil Âboro extrait : 20 traits, ${Object.keys(profile.talent_cloud).length} talents`, user.slug || 'unknown')

          aboroProfile = profile
        }
      } catch (err) {
        console.error('[Aboro extraction] Error:', err)
        // Non-blocking: document is saved even if extraction fails
        getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, created_by)
          VALUES (?, 'document', ?, ?)
        `).run(req.params.id, `Extraction Âboro échouée : ${(err as Error).message}. Saisie manuelle possible.`, user.slug || 'unknown')
      }
    }

    res.status(201).json({ id: docId, filename: file.filename, type: docType, aboroProfile })
  } catch (err) {
    console.error('[Document upload] Error:', err)
    res.status(500).json({ error: 'Erreur upload' })
  }
})

// Get Aboro profile for a candidate
protectedRouter.get('/candidates/:candidateId/aboro', (req, res) => {
  const profile = getDb().prepare(
    'SELECT profile_json, created_at FROM aboro_profiles WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(req.params.candidateId) as { profile_json: string; created_at: string } | undefined

  if (!profile) {
    res.json({ profile: null })
    return
  }

  res.json({ profile: JSON.parse(profile.profile_json), createdAt: profile.created_at })
})

// List documents for a candidature
protectedRouter.get('/candidatures/:id/documents', (req, res) => {
  const docs = getDb().prepare(
    'SELECT id, type, filename, uploaded_by, created_at FROM candidature_documents WHERE candidature_id = ? ORDER BY created_at DESC'
  ).all(req.params.id) as { id: string; type: string; filename: string; uploaded_by: string; created_at: string }[]

  res.json(docs)
})

// Download a document
protectedRouter.get('/documents/:docId/download', async (req, res) => {
  const doc = getDb().prepare(
    'SELECT filename, path FROM candidature_documents WHERE id = ?'
  ).get(req.params.docId) as { filename: string; path: string } | undefined

  if (!doc) {
    res.status(404).json({ error: 'Document introuvable' })
    return
  }

  const fs = await import('fs')
  if (!fs.existsSync(doc.path)) {
    res.status(404).json({ error: 'Fichier introuvable sur le disque' })
    return
  }

  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`)
  res.setHeader('Content-Type', 'application/pdf')
  fs.createReadStream(doc.path).pipe(res)
})

// Dashboard summary stats
protectedRouter.get('/dashboard', (_req, res) => {
  const poles = getDb().prepare(`
    SELECT p.pole,
      COUNT(DISTINCT p.id) as poste_count,
      COUNT(DISTINCT c.id) as candidature_count,
      COUNT(DISTINCT CASE WHEN c.statut NOT IN ('refuse', 'embauche') THEN c.id END) as active_count
    FROM postes p
    LEFT JOIN candidatures c ON c.poste_id = p.id
    GROUP BY p.pole
    ORDER BY p.pole
  `).all() as { pole: string; poste_count: number; candidature_count: number; active_count: number }[]

  const totalCandidatures = poles.reduce((sum, p) => sum + p.candidature_count, 0)
  const totalActive = poles.reduce((sum, p) => sum + p.active_count, 0)

  // Per-status breakdown
  const statusCounts = getDb().prepare(`
    SELECT statut, COUNT(*) as count FROM candidatures GROUP BY statut
  `).all() as { statut: string; count: number }[]

  res.json({
    poles,
    totalCandidatures,
    totalActive,
    statusBreakdown: Object.fromEntries(statusCounts.map(s => [s.statut, s.count])),
  })
})

// Mount protected routes
recruitmentRouter.use('/', protectedRouter)

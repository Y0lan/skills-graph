import { Router } from 'express'
import { Readable } from 'stream'
import busboy from 'busboy'
import rateLimit from 'express-rate-limit'
import { getDb } from '../lib/db.js'
import { requireLead } from '../middleware/require-lead.js'
import { sendCandidateInvite, sendCandidateDeclined, sendTransitionNotification } from '../lib/email.js'
import { calculatePosteCompatibility, calculateEquipeCompatibility, getGapAnalysis, calculateGlobalScore, calculateMultiPosteCompatibility, getBonusSkills } from '../lib/compatibility.js'
import { uploadDocument, getDocumentForDownload, generateCandidatureZip } from '../lib/document-service.js'
import { getAboroProfile, saveManualAboroProfile } from '../lib/aboro-service.js'
import { processIntake } from '../lib/intake-service.js'
import { safeJsonParse, getUser, type PosteRow, type CandidatureRow, type CandidatureEventRow } from '../lib/types.js'

interface ParsedIntake {
  fields: Record<string, string>
  files: Map<string, { buffer: Buffer; mimetype: string; filename: string }>
  warnings: string[]
}

function parseMultipartIntake(req: import('express').Request): Promise<ParsedIntake> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    const files = new Map<string, { buffer: Buffer; mimetype: string; filename: string }>()
    const warnings: string[] = []
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: 10 * 1024 * 1024, files: 2 }
    })
    bb.on('field', (name: string, val: string) => { fields[name] = val })
    const allowedMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
    bb.on('file', (name: string, stream: Readable, info: { filename: string; mimeType: string }) => {
      if (!allowedMimes.includes(info.mimeType)) {
        warnings.push(`Fichier ${info.filename} ignoré : type ${info.mimeType} non supporté`)
        stream.resume() // drain non-allowed file
        return
      }
      const chunks: Buffer[] = []
      let truncated = false
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('limit', () => {
        truncated = true
        warnings.push(`Fichier ${info.filename} tronqué : dépasse la taille maximale`)
      })
      stream.on('end', () => {
        if (!truncated) {
          files.set(name, { buffer: Buffer.concat(chunks), mimetype: info.mimeType, filename: info.filename })
        }
      })
    })
    bb.on('close', () => { clearTimeout(timer); resolve({ fields, files, warnings }) })
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

const mutationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
})

const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de fichiers. Réessayez dans une minute.' },
})

const heavyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
})

const recalcRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Recalcul en cours. Réessayez dans une minute.' },
})

const WEBHOOK_SECRET = process.env.DRUPAL_WEBHOOK_SECRET

recruitmentRouter.post('/intake', intakeRateLimit, async (req, res) => {
  if (!WEBHOOK_SECRET) {
    console.error('[WEBHOOK] DRUPAL_WEBHOOK_SECRET not set — rejecting all intake requests')
    res.status(500).json({ error: 'Webhook not configured' })
    return
  }
  const provided = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '')
  if (!provided || provided !== WEBHOOK_SECRET) {
    res.status(401).json({ error: 'Webhook secret invalide' })
    return
  }

  try {
    let fields: Record<string, string>
    let cvFile: { buffer: Buffer; mimetype: string; originalname?: string } | null = null
    let lettreFile: { buffer: Buffer; mimetype: string; originalname?: string } | null = null

    let warnings: string[] = []
    const contentType = req.headers['content-type'] || ''
    if (contentType.startsWith('multipart/')) {
      const parsed = await parseMultipartIntake(req)
      fields = parsed.fields
      warnings = parsed.warnings
      const cv = parsed.files.get('cv')
      if (cv) cvFile = { buffer: cv.buffer, mimetype: cv.mimetype, originalname: cv.filename }
      const lettre = parsed.files.get('lettre')
      if (lettre) lettreFile = { buffer: lettre.buffer, mimetype: lettre.mimetype, originalname: lettre.filename }
    } else {
      fields = req.body
    }

    const result = await processIntake(fields as unknown as Parameters<typeof processIntake>[0], cvFile, lettreFile)

    if ('error' in result) {
      res.status(result.status).json({ error: result.error })
      return
    }

    res.status(result.updated ? 200 : 201).json({ ...result, warnings })
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
    poste_titre: string; poste_pole: string;
    taux_soft_skills: number | null; soft_skill_alerts: string | null; taux_global: number | null;
    last_event_at: string | null
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
    tauxSoft: r.taux_soft_skills,
    softSkillAlerts: safeJsonParse<{ trait: string; value: number; threshold: number; message: string }[]>(r.soft_skill_alerts, []),
    tauxGlobal: r.taux_global,
    notesDirecteur: r.notes_directeur,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastEventAt: r.last_event_at,
  })))
})

// Get candidature detail
protectedRouter.get('/candidatures/:id', (req, res) => {
  const row = getDb().prepare(`
    SELECT
      c.id AS candidature_id, c.candidate_id, c.poste_id, c.statut AS candidature_statut,
      c.canal AS candidature_canal, c.notes_directeur, c.taux_compatibilite_poste,
      c.taux_compatibilite_equipe, c.taux_soft_skills, c.soft_skill_alerts, c.taux_global,
      c.created_at AS candidature_created_at,
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

  // Multi-poste compatibility + bonus skills (Task 3)
  const multiPosteCompatibility = Object.keys(effectiveRatings).length > 0
    ? calculateMultiPosteCompatibility(effectiveRatings, row.poste_id as string)
    : []
  const bonusSkills = Object.keys(effectiveRatings).length > 0
    ? getBonusSkills(effectiveRatings, row.poste_role_id as string)
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
      tauxSoft: row.taux_soft_skills,
      softSkillAlerts: safeJsonParse<{ trait: string; value: number; threshold: number; message: string }[]>(row.soft_skill_alerts as string, []),
      tauxGlobal: row.taux_global,
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
    multiPosteCompatibility,
    bonusSkills,
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
protectedRouter.patch('/candidatures/:id/status', mutationRateLimit, async (req, res) => {
  const { statut, notes, skipReason, sendEmail, includeReasonInEmail } = req.body

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
      try {
        const result = await sendCandidateInvite({
          to: candidateInfo.email,
          candidateName: candidateInfo.name,
          role: candidateInfo.role,
          evaluationUrl: `${baseUrl}/evaluate/${candidateInfo.candidate_id}`,
        })
        emailSent = result !== null
        if (emailSent) {
          getDb().prepare(`
            INSERT INTO candidature_events (candidature_id, type, notes, created_by)
            VALUES (?, 'email_sent', ?, ?)
          `).run(req.params.id, `Lien d'évaluation envoyé à ${candidateInfo.email}`, user.slug || 'unknown')
        }
      } catch (err) {
        console.error('[Email] Failed to send evaluation link:', err)
        emailSent = false
        getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, created_by)
          VALUES (?, 'email_failed', ?, ?)
        `).run(req.params.id, `Échec envoi email à ${candidateInfo.email}`, user.slug || 'unknown')
      }
    }
  }

  // Send decline emails when transitioning to refuse
  if (statut === 'refuse') {
    const candidateInfo = getDb().prepare(`
      SELECT cand.name, cand.email, cand.role, c.candidate_id
      FROM candidatures c JOIN candidates cand ON cand.id = c.candidate_id
      WHERE c.id = ?
    `).get(req.params.id) as { name: string; email: string | null; role: string; candidate_id: string } | undefined

    if (candidateInfo?.email) {
      const leadSlug = user.slug || 'unknown'
      const leadEmail = `${leadSlug.replaceAll('-', '.')}@sinapse.nc`
      try {
        const result = await sendCandidateDeclined({
          candidateName: candidateInfo.name,
          role: candidateInfo.role,
          candidateEmail: candidateInfo.email,
          leadEmail,
          reason: notes?.trim() || undefined,
          includeReason: !!includeReasonInEmail,
        })
        emailSent = result !== null
        if (emailSent) {
          getDb().prepare(`
            INSERT INTO candidature_events (candidature_id, type, notes, created_by)
            VALUES (?, 'email_sent', ?, ?)
          `).run(req.params.id, `Email de refus envoyé à ${candidateInfo.email}${includeReasonInEmail ? ' (motif inclus)' : ''}`, user.slug || 'unknown')
        }
      } catch (err) {
        console.error('[Email] Failed to send decline:', err)
        emailSent = false
        getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, created_by)
          VALUES (?, 'email_failed', ?, ?)
        `).run(req.params.id, `Échec envoi email de refus à ${candidateInfo.email}`, user.slug || 'unknown')
      }
    }
  }

  // Send transition notification for statuses not already handled above
  const candidatureId = req.params.id
  if (!['skill_radar_envoye', 'refuse', 'skill_radar_complete'].includes(statut)) {
    const candidateInfo = getDb().prepare(`
      SELECT cand.email, cand.name, cand.role
      FROM candidatures c JOIN candidates cand ON cand.id = c.candidate_id
      WHERE c.id = ?
    `).get(candidatureId) as { email: string | null; name: string; role: string } | undefined

    if (candidateInfo?.email && sendEmail !== false) {
      try {
        const result = await sendTransitionNotification({
          to: candidateInfo.email,
          candidateName: candidateInfo.name,
          role: candidateInfo.role,
          statut,
        })
        if (result) {
          emailSent = true
          getDb().prepare('INSERT INTO candidature_events (candidature_id, type, notes, created_by) VALUES (?, ?, ?, ?)')
            .run(candidatureId, 'email_sent', `Email transition ${statut} envoyé`, user.slug)
        }
      } catch {
        getDb().prepare('INSERT INTO candidature_events (candidature_id, type, notes, created_by) VALUES (?, ?, ?, ?)')
          .run(candidatureId, 'email_failed', `Échec email transition ${statut}`, user.slug)
      }
    }
  }

  // Onboarding: convert hired candidate to team member
  if (statut === 'embauche') {
    const candidateInfo = getDb().prepare(`
      SELECT cand.id, cand.name, cand.email, cand.role, cand.ratings, cand.ai_suggestions,
             cand.experience, cand.skipped_categories
      FROM candidatures c JOIN candidates cand ON cand.id = c.candidate_id
      WHERE c.id = ?
    `).get(candidatureId) as { id: string; name: string; email: string | null; role: string; ratings: string | null; ai_suggestions: string | null; experience: string | null; skipped_categories: string | null } | undefined

    if (candidateInfo) {
      const slug = candidateInfo.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      // Merge AI suggestions with manual ratings (manual overrides AI)
      const aiSuggestions = JSON.parse(candidateInfo.ai_suggestions || '{}')
      const manualRatings = JSON.parse(candidateInfo.ratings || '{}')
      const mergedRatings = { ...aiSuggestions, ...manualRatings }

      // Insert into evaluations (team member data)
      getDb().prepare(`INSERT OR IGNORE INTO evaluations (slug, ratings, experience, skipped_categories, submitted_at)
        VALUES (?, ?, ?, ?, datetime('now'))`)
        .run(slug, JSON.stringify(mergedRatings), candidateInfo.experience || '{}', candidateInfo.skipped_categories || '[]')

      // Log the conversion
      getDb().prepare(`INSERT INTO candidature_events (candidature_id, type, notes, created_by)
        VALUES (?, 'onboarding', ?, ?)`)
        .run(candidatureId, `Candidat converti en membre d'équipe (slug: ${slug})`, user.slug)

      console.log(`[ONBOARDING] ${candidateInfo.name} → team member ${slug}`)
    }
  }

  res.json({ ok: true, previousStatut: current.statut, newStatut: statut, skipped: isSkip, emailSent })
})

// Add note to candidature
protectedRouter.post('/candidatures/:id/notes', mutationRateLimit, (req, res) => {
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
protectedRouter.post('/candidatures/:id/recalculate', heavyRateLimit, (req, res) => {
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

  // Read current soft skill score (from Aboro, if available)
  const currentSoft = getDb().prepare(
    'SELECT taux_soft_skills FROM candidatures WHERE id = ?'
  ).get(req.params.id) as { taux_soft_skills: number | null } | undefined

  const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, currentSoft?.taux_soft_skills ?? null)

  getDb().prepare(
    'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(tauxPoste, tauxEquipe, tauxGlobal, req.params.id)

  res.json({ tauxPoste, tauxEquipe, tauxGlobal })
})

// Upload document for a candidature (Aboro PDF, etc.)
protectedRouter.post('/candidatures/:id/documents', uploadRateLimit, async (req, res) => {
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

    const rawType = parsed.fields.type || 'other'
    const docType = rawType.replace(/[^a-zA-Z0-9_-]/g, '_')
    const user = getUser(req)

    const result = await uploadDocument({
      candidatureId: req.params.id as string,
      file,
      docType,
      userSlug: user.slug || 'unknown',
    })

    res.status(201).json(result)
  } catch (err) {
    console.error('[Document upload] Error:', err)
    res.status(500).json({ error: 'Erreur upload' })
  }
})

// Get Aboro profile for a candidate
protectedRouter.get('/candidates/:candidateId/aboro', (req, res) => {
  res.json(getAboroProfile(req.params.candidateId))
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
  const result = await getDocumentForDownload(req.params.docId)

  if ('error' in result) {
    res.status(result.status).json({ error: result.error })
    return
  }

  const fs = await import('fs')
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
  res.setHeader('Content-Type', result.contentType)
  fs.createReadStream(result.filePath).pipe(res)
})

// Download all documents as ZIP for a candidature
protectedRouter.get('/candidatures/:id/documents/zip', async (req, res) => {
  const result = await generateCandidatureZip(req.params.id)

  if ('error' in result) {
    res.status(result.status).json({ error: result.error })
    return
  }

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="Dossier_${result.candidateName}.zip"`)

  await result.pipe(res)
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

// ─── Scoring weights ─────────────────────────────────────────────────
protectedRouter.get('/scoring-weights', (_req, res) => {
  const weights = getDb().prepare('SELECT * FROM scoring_weights WHERE id = ?').get('default') as {
    id: string; weight_poste: number; weight_equipe: number; weight_soft: number; updated_at: string
  } | undefined

  res.json(weights ?? { id: 'default', weight_poste: 0.5, weight_equipe: 0.2, weight_soft: 0.3 })
})

protectedRouter.put('/scoring-weights', heavyRateLimit, async (req, res) => {
  const { weightPoste, weightEquipe, weightSoft } = req.body
  if (typeof weightPoste !== 'number' || typeof weightEquipe !== 'number' || typeof weightSoft !== 'number') {
    res.status(400).json({ error: 'weightPoste, weightEquipe, weightSoft sont requis (nombres)' })
    return
  }
  if (Math.abs(weightPoste + weightEquipe + weightSoft - 1.0) > 0.01) {
    res.status(400).json({ error: 'Les poids doivent totaliser 1.0' })
    return
  }

  getDb().prepare(
    'UPDATE scoring_weights SET weight_poste = ?, weight_equipe = ?, weight_soft = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(weightPoste, weightEquipe, weightSoft, 'default')

  // Recalculate taux_global for all candidatures
  const allCandidatures = getDb().prepare(
    'SELECT id, taux_compatibilite_poste, taux_compatibilite_equipe, taux_soft_skills FROM candidatures'
  ).all() as { id: string; taux_compatibilite_poste: number | null; taux_compatibilite_equipe: number | null; taux_soft_skills: number | null }[]

  const updateStmt = getDb().prepare('UPDATE candidatures SET taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?')
  const recalc = getDb().transaction(() => {
    for (const c of allCandidatures) {
      const tauxGlobal = calculateGlobalScore(c.taux_compatibilite_poste, c.taux_compatibilite_equipe, c.taux_soft_skills)
      updateStmt.run(tauxGlobal, c.id)
    }
  })
  recalc()

  res.json({ ok: true, recalculated: allCandidatures.length })
})

protectedRouter.post('/recalculate-all', recalcRateLimit, (_req, res) => {
  const allCandidatures = getDb().prepare(
    'SELECT id, taux_compatibilite_poste, taux_compatibilite_equipe, taux_soft_skills FROM candidatures'
  ).all() as { id: string; taux_compatibilite_poste: number | null; taux_compatibilite_equipe: number | null; taux_soft_skills: number | null }[]

  const updateStmt = getDb().prepare('UPDATE candidatures SET taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?')
  const recalc = getDb().transaction(() => {
    for (const c of allCandidatures) {
      const tauxGlobal = calculateGlobalScore(c.taux_compatibilite_poste, c.taux_compatibilite_equipe, c.taux_soft_skills)
      updateStmt.run(tauxGlobal, c.id)
    }
  })
  recalc()

  res.json({ ok: true, recalculated: allCandidatures.length })
})

// Manual Aboro profile entry
protectedRouter.post('/candidates/:candidateId/aboro/manual', async (req, res) => {
  try {
    const { traits, talent_cloud, talents, axes_developpement } = req.body

    // Validate 20 traits are present and 1-10
    if (!traits) {
      res.status(400).json({ error: 'Traits requis' })
      return
    }
    for (const axis of Object.values(traits)) {
      for (const [key, val] of Object.entries(axis as Record<string, number>)) {
        if (typeof val !== 'number' || val < 1 || val > 10) {
          res.status(400).json({ error: `Trait ${key} invalide: doit être entre 1 et 10` })
          return
        }
      }
    }
    const REQUIRED_TRAITS = [
      'ascendant', 'conviction', 'sociabilite', 'diplomatie',
      'implication', 'ouverture', 'critique', 'consultation',
      'taches_variees', 'abstraction', 'inventivite', 'changement',
      'methode', 'details', 'perseverance', 'initiative',
      'detente', 'positivite', 'controle', 'stabilite',
    ]
    const flatTraits: Record<string, unknown> = {}
    for (const axis of Object.values(traits as Record<string, Record<string, unknown>>)) {
      for (const [key, val] of Object.entries(axis)) {
        flatTraits[key] = val
      }
    }
    const missing = REQUIRED_TRAITS.filter(t => !(t in flatTraits))
    if (missing.length > 0) {
      res.status(400).json({
        error: `Traits manquants (${missing.length}/${REQUIRED_TRAITS.length})`,
        missing,
      })
      return
    }

    const result = saveManualAboroProfile({
      candidateId: req.params.candidateId,
      traits,
      talent_cloud,
      talents,
      axes_developpement,
      userSlug: getUser(req).slug || 'unknown',
    })

    res.json(result)
  } catch (err) {
    console.error('[Manual Aboro] Error:', err)
    res.status(500).json({ error: 'Erreur sauvegarde' })
  }
})

// Mount protected routes
recruitmentRouter.use('/', protectedRouter)

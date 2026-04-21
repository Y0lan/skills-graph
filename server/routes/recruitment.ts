import express, { Router } from 'express'
import { Readable } from 'stream'
import busboy from 'busboy'
import rateLimit from 'express-rate-limit'
import Anthropic from '@anthropic-ai/sdk'
import archiver from 'archiver'
import { getDb } from '../lib/db.js'
import { requireLead } from '../middleware/require-lead.js'
import { sendCandidateDeclined, sendTransitionEmail, getEmailTemplate, renderTransitionEmail } from '../lib/email.js'
import { previewizeEmailHtml } from '../lib/brand.js'
import { calculatePosteCompatibility, calculateEquipeCompatibility, getGapAnalysis, calculateGlobalScore, calculateMultiPosteCompatibility, getBonusSkills, getPosteCompatBreakdown, getEquipeCompatBreakdown } from '../lib/compatibility.js'
import { getSoftSkillBreakdown } from '../lib/soft-skill-scoring.js'
import { uploadDocument, getDocumentForDownload, generateCandidatureZip, triggerDocumentScan } from '../lib/document-service.js'
import { isGcsPath, downloadFromGcs } from '../lib/gcs.js'
import { computeRoleGaps } from '../lib/gap-analysis.js'
import { getSkillCategories } from '../lib/catalog.js'
import { getRoleCategories } from '../lib/db.js'
import { buildFunnel } from '../lib/funnel-analysis.js'
import { getAboroProfile, saveManualAboroProfile } from '../lib/aboro-service.js'
import { processIntake } from '../lib/intake-service.js'
import { processCvForCandidate } from '../lib/cv-pipeline.js'
import { listRuns, getRunPayload } from '../lib/extraction-runs.js'
import { readAssetBuffer, getLatestAsset } from '../lib/asset-storage.js'
import { diffSuggestions, diffProfile } from '../lib/run-diff.js'
import { recruitmentBus, type RecruitmentEventMap } from '../lib/event-bus.js'
import { Webhook } from 'svix'
import { safeJsonParse, getUser, type PosteRow, type CandidatureRow, type CandidatureEventRow } from '../lib/types.js'
import { TRANSITION_MAP, NOTES_REQUIRED, getAllowedTransitions, isSkipTransition, getSkippedSteps } from '../lib/state-machine.js'

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
  } catch {
    console.error('[INTAKE] Processing failed')
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
    description: p.description,
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

// Update poste description (fiche de poste text, fed to role-aware CV extraction)
const MAX_DESCRIPTION_CHARS = 20000
protectedRouter.put('/postes/:posteId', mutationRateLimit, (req, res) => {
  const { description } = req.body ?? {}
  if (description !== null && typeof description !== 'string') {
    res.status(400).json({ error: 'description doit être une chaîne ou null' })
    return
  }
  if (typeof description === 'string' && description.length > MAX_DESCRIPTION_CHARS) {
    res.status(400).json({
      error: `Description trop longue (max ${MAX_DESCRIPTION_CHARS} caractères, reçu ${description.length})`,
    })
    return
  }
  // Normalize empty strings to NULL so downstream prompt builders treat
  // "not authored yet" and "cleared" identically.
  const normalized = typeof description === 'string' && description.trim().length > 0 ? description : null
  const result = getDb().prepare('UPDATE postes SET description = ? WHERE id = ?')
    .run(normalized, req.params.posteId)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Poste introuvable' })
    return
  }
  res.json({ ok: true, description: normalized })
})

// List skill requirements for a poste
protectedRouter.get('/postes/:posteId/requirements', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM poste_skill_requirements WHERE poste_id = ? ORDER BY skill_id')
    .all(req.params.posteId)
  res.json(rows)
})

// Bulk update skill requirements for a poste
protectedRouter.put('/postes/:posteId/requirements', mutationRateLimit, (req, res) => {
  const { requirements } = req.body // Array of { skill_id, target_level, importance }
  if (!Array.isArray(requirements)) {
    res.status(400).json({ error: 'requirements must be an array' })
    return
  }

  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM poste_skill_requirements WHERE poste_id = ?').run(req.params.posteId)
    const insert = db.prepare('INSERT INTO poste_skill_requirements (poste_id, skill_id, target_level, importance) VALUES (?, ?, ?, ?)')
    for (const r of requirements) {
      insert.run(req.params.posteId, r.skill_id, r.target_level ?? 3, r.importance ?? 'requis')
    }
  })()

  res.json({ ok: true, count: requirements.length })
})

// Recruitment funnel: aggregated transitions for the Sankey diagram.
// GET /api/recruitment/funnel?days=90&pole=all
protectedRouter.get('/funnel', (req, res) => {
  const daysRaw = req.query.days
  const poleRaw = req.query.pole
  const days = typeof daysRaw === 'string' && /^\d+$/.test(daysRaw) ? Number(daysRaw) : null
  const pole = typeof poleRaw === 'string' ? poleRaw : null
  res.json(buildFunnel({ days, pole }))
})

// Item 20 P2: compare two cohorts (e.g. "last 30d" vs "previous 30d", or
// two arbitrary day-windows). Returns both snapshots plus a per-link diff
// (B.value - A.value) so the frontend can render either side-by-side
// Sankeys or a single diff overlay.
//
// GET /api/recruitment/funnel/compare?aDays=30&bDays=90&pole=all
protectedRouter.get('/funnel/compare', (req, res) => {
  const aRaw = req.query.aDays
  const bRaw = req.query.bDays
  const poleRaw = req.query.pole
  const aDays = typeof aRaw === 'string' && /^\d+$/.test(aRaw) ? Number(aRaw) : null
  const bDays = typeof bRaw === 'string' && /^\d+$/.test(bRaw) ? Number(bRaw) : null
  const pole = typeof poleRaw === 'string' ? poleRaw : null

  const a = buildFunnel({ days: aDays, pole })
  const b = buildFunnel({ days: bDays, pole })

  // Per-link diff: positive = B has more flow than A.
  type LinkKey = string
  const keyOf = (l: { source: string; target: string }): LinkKey => `${l.source}→${l.target}`
  const aMap = new Map<LinkKey, number>()
  for (const l of a.links) aMap.set(keyOf(l), l.value)
  const bMap = new Map<LinkKey, number>()
  for (const l of b.links) bMap.set(keyOf(l), l.value)
  const allKeys = new Set<LinkKey>([...aMap.keys(), ...bMap.keys()])
  const linkDiffs: Array<{ source: string; target: string; aValue: number; bValue: number; delta: number; deltaPct: number | null }> = []
  for (const k of allKeys) {
    const [source, target] = k.split('→')
    const av = aMap.get(k) ?? 0
    const bv = bMap.get(k) ?? 0
    const delta = bv - av
    const deltaPct = av > 0 ? Math.round((delta / av) * 1000) / 10 : null
    linkDiffs.push({ source, target, aValue: av, bValue: bv, delta, deltaPct })
  }
  linkDiffs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))

  res.json({
    a: { label: aDays !== null ? `${aDays}j` : 'tout', funnel: a },
    b: { label: bDays !== null ? `${bDays}j` : 'tout', funnel: b },
    linkDiffs,
    totalsDelta: {
      all: b.totals.all - a.totals.all,
      hired: b.totals.hired - a.totals.hired,
      refused: b.totals.refused - a.totals.refused,
      in_progress: b.totals.in_progress - a.totals.in_progress,
    },
  })
})

// Poste comparison view: enriched candidatures with rank + gaps, plus role categories.
// Powers the /recruit/reports/comparison/:posteId page.
protectedRouter.get('/postes/:posteId/comparison', (req, res) => {
  const posteId = req.params.posteId
  const poste = getDb().prepare('SELECT id, role_id, titre FROM postes WHERE id = ?').get(posteId) as
    { id: string; role_id: string; titre: string } | undefined
  if (!poste) {
    res.status(404).json({ error: 'Poste introuvable' })
    return
  }

  const roleCategories = getRoleCategories(poste.role_id)
  const categories = getSkillCategories()

  // Exclude refused candidates from the compare view (existing page behavior).
  // Stable ordering: fit DESC, global DESC, createdAt ASC, id ASC.
  const rows = getDb().prepare(`
    SELECT c.id, c.candidate_id, c.poste_id, c.statut, c.canal,
      c.taux_compatibilite_poste, c.taux_compatibilite_equipe, c.taux_soft_skills,
      c.soft_skill_alerts, c.taux_global, c.notes_directeur,
      c.created_at, c.updated_at,
      cand.name, cand.email, cand.ratings, cand.ai_suggestions,
      cand.cv_text IS NOT NULL as has_cv,
      (SELECT 1 FROM candidature_documents cd WHERE cd.candidature_id = c.id AND cd.type = 'lettre' AND cd.deleted_at IS NULL LIMIT 1) as has_lettre,
      cand.submitted_at as evaluation_submitted,
      (SELECT MAX(ce.created_at) FROM candidature_events ce WHERE ce.candidature_id = c.id) as last_event_at
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    WHERE c.poste_id = ? AND c.statut != 'refuse'
    ORDER BY c.taux_compatibilite_poste DESC NULLS LAST,
             c.taux_global DESC NULLS LAST,
             c.created_at ASC,
             c.id ASC
  `).all(posteId) as (CandidatureRow & {
    name: string; email: string | null;
    ratings: string; ai_suggestions: string | null;
    has_cv: number; has_lettre: number | null; evaluation_submitted: string | null;
    last_event_at: string | null
  })[]

  const enriched = rows.map((r, idx) => {
    const ratings = safeJsonParse<Record<string, number>>(r.ratings ?? '{}', {})
    const aiSuggestions = safeJsonParse<Record<string, number>>(r.ai_suggestions ?? '{}', {})
    // Manual ratings override AI suggestions — same precedence as compare page.
    const effective = { ...aiSuggestions, ...ratings }
    const gaps = computeRoleGaps(effective, categories, roleCategories)
    return {
      id: r.id,
      candidateId: r.candidate_id,
      posteId: r.poste_id,
      statut: r.statut,
      canal: r.canal,
      candidateName: r.name,
      candidateEmail: r.email,
      hasCv: !!r.has_cv,
      hasLettre: !!r.has_lettre,
      evaluationSubmitted: !!r.evaluation_submitted,
      tauxPoste: r.taux_compatibilite_poste,
      tauxEquipe: r.taux_compatibilite_equipe,
      tauxSoft: r.taux_soft_skills,
      softSkillAlerts: safeJsonParse<{ trait: string; value: number; threshold: number; message: string }[]>(r.soft_skill_alerts, []),
      tauxGlobal: r.taux_global,
      notesDirecteur: r.notes_directeur,
      ratings: effective,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastEventAt: r.last_event_at,
      rank: idx + 1,
      gaps,
    }
  })

  res.json({
    poste: { id: poste.id, titre: poste.titre, roleId: poste.role_id },
    roleCategories,
    candidatures: enriched,
  })
})

// List candidatures with filters
protectedRouter.get('/candidatures', (req, res) => {
  const { poste, pole, statut, candidateId } = req.query
  let sql = `
    SELECT c.*, cand.name, cand.email, cand.cv_text IS NOT NULL as has_cv,
      (SELECT 1 FROM candidature_documents cd WHERE cd.candidature_id = c.id AND cd.type = 'lettre' AND cd.deleted_at IS NULL LIMIT 1) as has_lettre,
      cand.ai_suggestions, cand.submitted_at as evaluation_submitted,
      p.titre as poste_titre, p.pole as poste_pole,
      (SELECT MAX(ce.created_at) FROM candidature_events ce WHERE ce.candidature_id = c.id) as last_event_at,
      (SELECT MAX(ce.created_at) FROM candidature_events ce WHERE ce.candidature_id = c.id AND ce.type = 'status_change' AND ce.statut_to = c.statut) as entered_status_at,
      (SELECT COUNT(DISTINCT cd.type) FROM candidature_documents cd WHERE cd.candidature_id = c.id AND cd.deleted_at IS NULL AND cd.type IN ('cv', 'lettre')) as docs_slot_count
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
  if (candidateId && typeof candidateId === 'string') {
    sql += ' AND c.candidate_id = ?'
    params.push(candidateId)
  }

  sql += ' ORDER BY c.taux_compatibilite_poste DESC NULLS LAST, c.created_at DESC'

  const rows = getDb().prepare(sql).all(...params) as (CandidatureRow & {
    name: string; email: string | null; has_cv: number; has_lettre: number | null;
    ai_suggestions: string | null; evaluation_submitted: string | null;
    poste_titre: string; poste_pole: string;
    taux_soft_skills: number | null; soft_skill_alerts: string | null; taux_global: number | null;
    last_event_at: string | null;
    entered_status_at: string | null;
    docs_slot_count: number | null;
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
    hasLettre: !!r.has_lettre,
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
    enteredStatusAt: r.entered_status_at ?? r.created_at,
    docsSlotCount: r.docs_slot_count ?? 0,
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
      contentMd: e.content_md,
      emailSnapshot: e.email_snapshot,
      createdBy: e.created_by,
      createdAt: e.created_at,
    })),
    gaps,
    multiPosteCompatibility,
    bonusSkills,
  })
})

// ─── State machine (imported from server/lib/state-machine.ts) ──────

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

// Get default email template for a given status
protectedRouter.get('/email-template/:statut', (req, res) => {
  const { candidateName, role, evaluationUrl } = req.query

  if (!candidateName || !role || typeof candidateName !== 'string' || typeof role !== 'string') {
    res.status(400).json({ error: 'candidateName and role query params required' })
    return
  }

  const template = getEmailTemplate(req.params.statut, {
    candidateName,
    role,
    evaluationUrl: typeof evaluationUrl === 'string' ? evaluationUrl : undefined,
  })

  if (!template) {
    res.json({ error: 'no_template' })
    return
  }

  res.json(template)
})

// Change candidature status (with state machine validation)
protectedRouter.patch('/candidatures/:id/status', mutationRateLimit, async (req, res) => {
  const { statut, currentStatut: clientStatut, notes, skipReason, sendEmail, includeReasonInEmail, customBody, skipEmailReason } = req.body

  if (!statut || typeof statut !== 'string') {
    res.status(400).json({ error: 'Statut requis' })
    return
  }

  const current = getDb().prepare('SELECT statut FROM candidatures WHERE id = ?').get(req.params.id) as { statut: string } | undefined
  if (!current) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  // Early stale-state detection: if the client sent currentStatut and it doesn't match DB, reject immediately
  if (clientStatut && clientStatut !== current.statut) {
    res.status(409).json({
      error: `Le statut a changé entre-temps (attendu : ${clientStatut}, actuel : ${current.statut}). Veuillez rafraîchir.`,
      currentStatut: current.statut,
    })
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

  // Item 16 + Auth ADR: when the recruiter advances a forward statut and
  // explicitly opts OUT of sending the candidate email, a reason ≥ 10 chars
  // is mandatory and gets audit-logged. The check applies only to statuts
  // that have a candidate-facing email (i.e., not skill_radar_complete which
  // never emails the candidate, and not refuse which always sends).
  const isEmailableStatusForSkipCheck = statut !== 'skill_radar_complete' && statut !== 'refuse'
  if (isEmailableStatusForSkipCheck && sendEmail === false) {
    const reason = typeof skipEmailReason === 'string' ? skipEmailReason.trim() : ''
    if (reason.length < 10) {
      res.status(400).json({ error: 'Une raison d’au moins 10 caractères est requise pour avancer sans envoyer d’email.' })
      return
    }
  }

  const user = getUser(req)

  try {
    getDb().transaction(() => {
      const result = getDb().prepare(
        'UPDATE candidatures SET statut = ?, updated_at = datetime(\'now\') WHERE id = ? AND statut = ?'
      ).run(statut, req.params.id, current.statut)

      if (result.changes === 0) {
        throw new Error('STATUS_CONFLICT')
      }

      let eventNotes = isSkip
        ? `[Saut: ${getSkippedSteps(current.statut, statut).join(' → ')}] ${skipReason?.trim() ?? ''}\n${notes?.trim() ?? ''}`.trim()
        : notes?.trim() || null

      // Append skip-email reason to the audit trail if the recruiter opted out.
      if (isEmailableStatusForSkipCheck && sendEmail === false && typeof skipEmailReason === 'string' && skipEmailReason.trim()) {
        eventNotes = `${eventNotes ? eventNotes + '\n' : ''}[Email non envoyé — raison: ${skipEmailReason.trim()}]`
      }

      getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, notes, created_by)
        VALUES (?, 'status_change', ?, ?, ?, ?)
      `).run(req.params.id, current.statut, statut, eventNotes, user.slug || 'unknown')
    })()

    // Item 8: publish to the event bus so any open SSE stream refreshes
    // status badges + actions without manual reload.
    recruitmentBus.publish('status_changed', {
      candidatureId: String(req.params.id),
      statutFrom: current.statut,
      statutTo: String(statut),
      byUserSlug: user.slug || 'unknown',
    })
  } catch (err) {
    if ((err as Error).message === 'STATUS_CONFLICT') {
      res.status(409).json({ error: 'Le statut a été modifié par un autre utilisateur. Veuillez rafraîchir.' })
      return
    }
    throw err
  }

  // Unified email dispatch for all transition types
  let emailSent = false
  const candidatureId = req.params.id
  const shouldSendEmail = statut === 'refuse' || sendEmail
  const isEmailableStatus = statut !== 'skill_radar_complete'

  if (shouldSendEmail && isEmailableStatus) {
    // IMPORTANT: select the actual poste title for THIS candidature, not the
    // candidate.role string (which is set at candidate creation and goes stale
    // for second/subsequent applications since one candidate can apply to many
    // postes).
    const candidateInfo = getDb().prepare(`
      SELECT cand.name, cand.email, cand.id as candidate_id, p.titre AS poste_titre
      FROM candidatures c
      JOIN candidates cand ON cand.id = c.candidate_id
      JOIN postes p ON p.id = c.poste_id
      WHERE c.id = ?
    `).get(candidatureId) as { name: string; email: string | null; candidate_id: string; poste_titre: string } | undefined

    if (candidateInfo?.email) {
      const baseUrl = process.env.BETTER_AUTH_URL || `${req.protocol}://${req.get('host')}`
      const userSlug = user.slug || 'unknown'

      try {
        const emailResult = await sendTransitionEmail({
          to: candidateInfo.email,
          candidateName: candidateInfo.name,
          role: candidateInfo.poste_titre,
          statut,
          notes: notes?.trim() || undefined,
          customBody: customBody || undefined,
          includeReasonInEmail: !!includeReasonInEmail,
          evaluationUrl: statut === 'skill_radar_envoye'
            ? `${baseUrl}/evaluate/${candidateInfo.candidate_id}`
            : undefined,
        })

        emailSent = emailResult.sent
        if (emailResult.sent) {
          // Get template info for the snapshot
          const template = getEmailTemplate(statut, {
            candidateName: candidateInfo.name,
            role: candidateInfo.poste_titre,
            notes: notes?.trim() || undefined,
            evaluationUrl: statut === 'skill_radar_envoye'
              ? `${baseUrl}/evaluate/${candidateInfo.candidate_id}`
              : undefined,
          })

          getDb().prepare(`INSERT INTO candidature_events (candidature_id, type, notes, email_snapshot, created_by)
            VALUES (?, 'email_sent', ?, ?, ?)`).run(
            candidatureId,
            `Email transition ${statut} envoyé à ${candidateInfo.email}`,
            JSON.stringify({ subject: template?.subject, body: customBody || template?.body, messageId: emailResult.messageId }),
            userSlug
          )
        }
      } catch {
        console.error(`[EMAIL] Failed to send ${statut} email`)
        emailSent = false
        getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, created_by)
          VALUES (?, 'email_failed', ?, ?)
        `).run(candidatureId, `Échec envoi email ${statut} à ${candidateInfo.email}`, userSlug)
      }

    }
  }

  // For refuse, notify the lead regardless of whether the candidate has an email
  if (statut === 'refuse') {
    const declineInfo = getDb().prepare(`
      SELECT cand.name, cand.email, p.titre AS poste_titre
      FROM candidatures c
      JOIN candidates cand ON cand.id = c.candidate_id
      JOIN postes p ON p.id = c.poste_id
      WHERE c.id = ?
    `).get(candidatureId) as { name: string; email: string | null; poste_titre: string } | undefined

    if (declineInfo) {
      const leadSlug = user.slug || 'unknown'
      const leadEmail = `${leadSlug.replaceAll('-', '.')}@sinapse.nc`
      try {
        await sendCandidateDeclined({
          candidateName: declineInfo.name,
          role: declineInfo.poste_titre,
          candidateEmail: declineInfo.email || '',
          leadEmail,
          reason: notes?.trim() || undefined,
          includeReason: !!includeReasonInEmail,
          skipCandidateEmail: true,
        })
      } catch {
        console.error('[EMAIL] Failed to send decline notification to lead')
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

// ═══════════════════════════════════════════════════════════════════════
// CV Intelligence Phase 10 — shortlist + batch outreach
// ═══════════════════════════════════════════════════════════════════════

/**
 * Ranked top-N candidates for a poste. Candidates with null taux_global
 * are EXCLUDED (per eng-review decision #9 — don't show as "N/A", force
 * the recruiter to re-extract if they want to see them).
 */
protectedRouter.get('/postes/:posteId/shortlist', (req, res) => {
  const posteId = String(req.params.posteId)
  const limitRaw = Number(req.query.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? Math.floor(limitRaw) : 10

  const posteRow = getDb().prepare(
    'SELECT id, titre, description, role_id FROM postes WHERE id = ?',
  ).get(posteId) as { id: string; titre: string; description: string | null; role_id: string } | undefined
  if (!posteRow) { res.status(404).json({ error: 'Poste introuvable' }); return }

  const rows = getDb().prepare(
    `SELECT c.id AS candidature_id,
            c.statut,
            c.taux_compatibilite_poste,
            c.taux_compatibilite_equipe,
            c.taux_soft_skills,
            c.taux_global,
            c.role_aware_suggestions,
            cand.id AS candidate_id,
            cand.name,
            cand.ai_suggestions,
            cand.ai_profile
       FROM candidatures c
       JOIN candidates cand ON cand.id = c.candidate_id
      WHERE c.poste_id = ?
        AND c.taux_global IS NOT NULL
      ORDER BY c.taux_global DESC
      LIMIT ?`,
  ).all(posteId, limit) as Array<{
    candidature_id: string; statut: string
    taux_compatibilite_poste: number | null; taux_compatibilite_equipe: number | null
    taux_soft_skills: number | null; taux_global: number
    role_aware_suggestions: string | null
    candidate_id: string; name: string
    ai_suggestions: string | null; ai_profile: string | null
  }>

  const items = rows.map(r => {
    // Prefer role-aware suggestions when computing top-3 skills (they're
    // calibrated to THIS poste). Fall back to baseline suggestions.
    const rating = r.role_aware_suggestions
      ? safeJsonParse<Record<string, number>>(r.role_aware_suggestions, {})
      : safeJsonParse<Record<string, number>>(r.ai_suggestions ?? '{}', {})
    const top3 = Object.entries(rating)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([skillId, rating]) => ({ skillId, rating }))

    const profile = r.ai_profile ? safeJsonParse<Record<string, unknown>>(r.ai_profile, {}) : null
    const profileIdentity = profile?.identity as { fullName?: { value?: string } } | undefined
    const profileCurrent = profile?.currentRole as { company?: { value?: string }; role?: { value?: string } } | undefined
    const profileTotalExp = profile?.totalExperienceYears as { value?: number } | undefined
    const profileLocation = profile?.location as { city?: { value?: string } } | undefined

    return {
      candidatureId: r.candidature_id,
      candidateId: r.candidate_id,
      name: profileIdentity?.fullName?.value ?? r.name,
      statut: r.statut,
      tauxPoste: r.taux_compatibilite_poste,
      tauxEquipe: r.taux_compatibilite_equipe,
      tauxSoft: r.taux_soft_skills,
      tauxGlobal: r.taux_global,
      currentCompany: profileCurrent?.company?.value ?? null,
      currentRole: profileCurrent?.role?.value ?? null,
      totalExperienceYears: profileTotalExp?.value ?? null,
      city: profileLocation?.city?.value ?? null,
      top3Skills: top3,
    }
  })

  res.json({
    poste: {
      id: posteRow.id,
      titre: posteRow.titre,
      description: posteRow.description,
      roleId: posteRow.role_id,
    },
    items,
  })
})

// Idempotency cache for outreach POSTs (in-memory, TTL 1h per eng-review #7).
// Keys are user-supplied X-Idempotency-Key headers. Values are the full response
// JSON the first call produced. A second call within TTL returns the cached
// response without re-sending emails.
interface OutreachCachedResponse {
  body: unknown
  status: number
  expiresAt: number
}
const outreachIdempotencyCache = new Map<string, OutreachCachedResponse>()
const OUTREACH_IDEMPOTENCY_TTL_MS = 60 * 60 * 1000 // 1h
const OUTREACH_MAX_BATCH = 20

/**
 * Send outreach emails to N candidates in the shortlist. Max 20 per batch.
 * Continues on per-email failure and returns {sent: [...ids], failed: [{id,error}]}.
 * Idempotency via X-Idempotency-Key header — safe for double-click / client retries.
 */
protectedRouter.post('/postes/:posteId/outreach', heavyRateLimit, async (req, res) => {
  const posteId = String(req.params.posteId)
  const idempotencyKey = typeof req.headers['x-idempotency-key'] === 'string'
    ? (req.headers['x-idempotency-key'] as string)
    : null

  // Idempotency check (expire old entries lazily)
  if (idempotencyKey) {
    const now = Date.now()
    const cached = outreachIdempotencyCache.get(idempotencyKey)
    if (cached && cached.expiresAt > now) {
      res.status(cached.status).json(cached.body)
      return
    }
    if (cached) outreachIdempotencyCache.delete(idempotencyKey)
  }

  const { candidatureIds, statut, customBody } = req.body ?? {}
  if (!Array.isArray(candidatureIds) || candidatureIds.length === 0) {
    res.status(400).json({ error: 'candidatureIds requis (array, ≥1)' })
    return
  }
  if (candidatureIds.length > OUTREACH_MAX_BATCH) {
    res.status(400).json({
      error: `Lot trop grand (max ${OUTREACH_MAX_BATCH}, reçu ${candidatureIds.length})`,
      code: 'batch-too-large',
    })
    return
  }
  if (typeof statut !== 'string' || !statut.trim()) {
    res.status(400).json({ error: 'statut (pour template email) requis' })
    return
  }

  const poste = getDb().prepare('SELECT titre FROM postes WHERE id = ?').get(posteId) as { titre: string } | undefined
  if (!poste) { res.status(404).json({ error: 'Poste introuvable' }); return }

  const { sendTransitionEmail } = await import('../lib/email.js')
  const user = getUser(req)

  const sent: string[] = []
  const failed: Array<{ candidatureId: string; error: string }> = []

  for (const cid of candidatureIds) {
    if (typeof cid !== 'string') {
      failed.push({ candidatureId: String(cid), error: 'Invalid id' })
      continue
    }
    try {
      const row = getDb().prepare(
        `SELECT c.id, c.candidate_id, cand.name, cand.email
           FROM candidatures c
           JOIN candidates cand ON cand.id = c.candidate_id
          WHERE c.id = ? AND c.poste_id = ?`,
      ).get(cid, posteId) as { id: string; candidate_id: string; name: string; email: string | null } | undefined
      if (!row) { failed.push({ candidatureId: cid, error: 'Candidature introuvable pour ce poste' }); continue }
      if (!row.email) { failed.push({ candidatureId: cid, error: 'Candidat sans email' }); continue }

      const result = await sendTransitionEmail({
        to: row.email,
        candidateName: row.name,
        role: poste.titre,
        statut,
        customBody,
      })
      if (!result.sent) {
        failed.push({ candidatureId: cid, error: 'email non envoyé (template manquant ou clé API absente)' })
        continue
      }

      getDb().prepare(
        `INSERT INTO candidature_events (candidature_id, type, notes, created_by)
         VALUES (?, 'email_sent', ?, ?)`,
      ).run(cid, `Outreach batch: statut=${statut}`, user?.slug ?? 'system')

      sent.push(cid)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failed.push({ candidatureId: cid, error: msg })
    }
  }

  const body = { sent, failed, total: candidatureIds.length }

  if (idempotencyKey) {
    outreachIdempotencyCache.set(idempotencyKey, {
      body,
      status: 200,
      expiresAt: Date.now() + OUTREACH_IDEMPOTENCY_TTL_MS,
    })
  }

  res.json(body)
})

// ═══════════════════════════════════════════════════════════════════════
// CV Intelligence Phase 8 — re-extract, history, diff
// ═══════════════════════════════════════════════════════════════════════

/**
 * Re-run the full CV extraction pipeline (baseline + profile + role-aware +
 * multipass) using the raw_pdf asset persisted at initial upload time.
 * Returns 409 when another extraction is already running for this candidate,
 * or when no raw_pdf asset exists (recruiter must re-upload the CV).
 */
protectedRouter.post('/candidates/:id/reextract', heavyRateLimit, async (req, res) => {
  const candidateId = String(req.params.id)
  const asset = getLatestAsset(candidateId, 'raw_pdf')
  if (!asset) {
    res.status(409).json({
      error: 'Aucun CV original trouvé — re-téléchargez le CV pour lancer une ré-extraction',
      code: 'no-raw-pdf',
    })
    return
  }
  const buf = readAssetBuffer(asset.id)
  if (!buf) {
    res.status(409).json({ error: 'Fichier CV introuvable sur disque', code: 'asset-missing' })
    return
  }
  try {
    const result = await processCvForCandidate(candidateId, buf, { source: 'reextract' })
    if (result.status === 'skipped') {
      res.status(409).json({ error: 'Extraction déjà en cours', code: 'in-flight' })
      return
    }
    res.json({ status: result.status, suggestionsCount: result.suggestionsCount, error: result.error ?? null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[reextract] candidate=${req.params.id}:`, err)
    res.status(500).json({ error: msg })
  }
})

/** List extraction runs for a candidate (metadata only, no payloads). */
protectedRouter.get('/candidates/:id/extraction-runs', (req, res) => {
  const limitRaw = Number(req.query.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? Math.floor(limitRaw) : 50
  const runs = listRuns(String(req.params.id), limit)
  res.json({ runs })
})

/** Full payload for one run. Access is logged in candidature_events for audit. */
protectedRouter.get('/extraction-runs/:runId/payload', (req, res) => {
  const runRow = getDb().prepare(
    'SELECT candidate_id, candidature_id, kind FROM cv_extraction_runs WHERE id = ?',
  ).get(req.params.runId) as { candidate_id: string; candidature_id: string | null; kind: string } | undefined
  if (!runRow) { res.status(404).json({ error: 'Run introuvable' }); return }
  const payload = getRunPayload(req.params.runId)
  if (payload == null) {
    res.status(410).json({
      error: 'Payload expiré (politique de rétention). Les métadonnées sont encore disponibles.',
      code: 'payload-pruned',
    })
    return
  }
  // Audit trail: log access on the candidature if there is one, else silently.
  if (runRow.candidature_id) {
    const user = getUser(req)
    try {
      getDb().prepare(
        `INSERT INTO candidature_events (candidature_id, type, notes, created_by)
         VALUES (?, 'note_added', ?, ?)`,
      ).run(
        runRow.candidature_id,
        `extraction_run_payload_viewed: run=${req.params.runId} kind=${runRow.kind}`,
        user?.slug ?? 'system',
      )
    } catch { /* audit trail is best-effort */ }
  }
  res.json({ payload })
})

/**
 * Compare two runs. Body: { runIdA: string, runIdB: string }.
 * Returns typed diff of ratings (for skill runs) and profile (for profile runs).
 */
protectedRouter.post('/extraction-runs/compare', (req, res) => {
  const { runIdA, runIdB } = req.body ?? {}
  if (typeof runIdA !== 'string' || typeof runIdB !== 'string') {
    res.status(400).json({ error: 'runIdA et runIdB requis (string)' })
    return
  }
  const a = getRunPayload(runIdA) as Record<string, unknown> | null
  const b = getRunPayload(runIdB) as Record<string, unknown> | null
  if (a == null || b == null) {
    res.status(410).json({
      error: 'Au moins un des payloads a été purgé par la politique de rétention',
      code: 'payload-pruned',
    })
    return
  }
  // If both look like skill extraction payloads (have `ratings`), diff those.
  // If both look like profile payloads (no `ratings` but have identity/contact),
  // diff the profile.
  const isSkillPayload = (p: Record<string, unknown>) => p.ratings && typeof p.ratings === 'object'
  if (isSkillPayload(a) && isSkillPayload(b)) {
    const sDiff = diffSuggestions(
      a.ratings as Record<string, number>,
      b.ratings as Record<string, number>,
    )
    res.json({ kind: 'skills', diff: sDiff })
    return
  }
  const pDiff = diffProfile(a, b)
  res.json({ kind: 'profile', diff: pDiff })
})
// Document types that act as "required slots" — uploading one supersedes the
// previous active row of the same type (kept linked via replaces_document_id).
const SLOT_TYPES = new Set(['cv', 'lettre', 'aboro'])

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

    // For slot types, find the existing active doc to supersede.
    const previousActive = SLOT_TYPES.has(docType)
      ? getDb().prepare(
          'SELECT id, filename FROM candidature_documents WHERE candidature_id = ? AND type = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1'
        ).get(req.params.id, docType) as { id: string; filename: string } | undefined
      : undefined

    const result = await uploadDocument({
      candidatureId: req.params.id as string,
      file,
      docType,
      userSlug: user.slug || 'unknown',
    })

    // Link replacement and soft-delete the old slot, atomically.
    if (previousActive) {
      const tx = getDb().transaction(() => {
        getDb().prepare('UPDATE candidature_documents SET replaces_document_id = ? WHERE id = ?').run(previousActive.id, result.id)
        getDb().prepare('UPDATE candidature_documents SET deleted_at = datetime(\'now\') WHERE id = ?').run(previousActive.id)
        getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, created_by)
          VALUES (?, 'document', ?, ?)
        `).run(req.params.id, `Remplacé: ${previousActive.filename} → ${file.filename}`, user.slug || 'unknown')
      })
      tx()
    }

    res.status(201).json({ ...result, supersededDocumentId: previousActive?.id ?? null })
  } catch {
    console.error('[DOCUMENT_UPLOAD] Upload failed')
    res.status(500).json({ error: 'Erreur upload' })
  }
})

// Slot view of a candidature's documents — three required slots + admin pool +
// per-slot supersede history. Used by the candidate detail page document panel.
protectedRouter.get('/candidatures/:id/documents/slots', (req, res) => {
  const all = getDb().prepare(`
    SELECT id, type, filename, display_filename, uploaded_by, created_at, scan_status, deleted_at, replaces_document_id
    FROM candidature_documents WHERE candidature_id = ? ORDER BY created_at DESC
  `).all(req.params.id) as Array<{
    id: string; type: string; filename: string; display_filename: string | null;
    uploaded_by: string; created_at: string; scan_status: string | null;
    deleted_at: string | null; replaces_document_id: string | null
  }>

  const active = (type: string) =>
    all.find(d => d.type === type && d.deleted_at === null) ?? null
  const history = (type: string) =>
    all.filter(d => d.type === type && d.deleted_at !== null)

  res.json({
    cv: active('cv'),
    lettre: active('lettre'),
    aboro: active('aboro'),
    autres: all.filter(d => !SLOT_TYPES.has(d.type) && d.deleted_at === null),
    history: {
      cv: history('cv'),
      lettre: history('lettre'),
      aboro: history('aboro'),
    },
  })
})

// Get Aboro profile for a candidate
protectedRouter.get('/candidates/:candidateId/aboro', (req, res) => {
  res.json(getAboroProfile(req.params.candidateId))
})

// List documents for a candidature
protectedRouter.get('/candidatures/:id/documents', (req, res) => {
  const includeDeleted = req.query.deleted === '1'
  const baseSql = 'SELECT id, type, filename, display_filename, uploaded_by, created_at, scan_status, deleted_at FROM candidature_documents WHERE candidature_id = ?'
  const sql = includeDeleted ? baseSql + ' ORDER BY created_at DESC' : baseSql + ' AND deleted_at IS NULL ORDER BY created_at DESC'
  const docs = getDb().prepare(sql).all(req.params.id) as { id: string; type: string; filename: string; display_filename: string | null; uploaded_by: string; created_at: string; scan_status: string | null; deleted_at: string | null }[]

  res.json(docs)
})

// Soft-delete a document. Permission: original uploader OR any recruitment lead.
protectedRouter.delete('/documents/:docId', (req, res) => {
  const doc = getDb().prepare(
    'SELECT candidature_id, uploaded_by, filename, deleted_at FROM candidature_documents WHERE id = ?'
  ).get(req.params.docId) as { candidature_id: string; uploaded_by: string; filename: string; deleted_at: string | null } | undefined

  if (!doc) {
    res.status(404).json({ error: 'Document introuvable' })
    return
  }
  if (doc.deleted_at) {
    res.status(409).json({ error: 'Document déjà supprimé', deleted_at: doc.deleted_at })
    return
  }

  // requireLead has already authorized any lead. We additionally allow any user
  // to delete their own upload via uploaded_by == req.user.slug.
  // (Today the protectedRouter requires lead anyway, so this is a no-op gate
  // until we widen the writer cohort. Keeping the check explicit so future
  // permission changes don't accidentally hide it.)
  const user = getUser(req)
  // (No-op: any reader of this router is already a lead.)
  void user

  getDb().prepare('UPDATE candidature_documents SET deleted_at = datetime(\'now\') WHERE id = ?').run(req.params.docId)

  try {
    getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, notes, created_by)
      VALUES (?, 'document', ?, ?)
    `).run(doc.candidature_id, `Supprimé: ${doc.filename}`, getUser(req).slug || 'unknown')
  } catch {
    // Audit non-blocking
  }

  res.status(204).send()
})

// Restore a previously soft-deleted document (within retention window).
protectedRouter.post('/documents/:docId/restore', (req, res) => {
  const doc = getDb().prepare(
    'SELECT candidature_id, filename, deleted_at FROM candidature_documents WHERE id = ?'
  ).get(req.params.docId) as { candidature_id: string; filename: string; deleted_at: string | null } | undefined

  if (!doc) {
    res.status(404).json({ error: 'Document introuvable' })
    return
  }
  if (!doc.deleted_at) {
    res.status(409).json({ error: 'Document non supprimé' })
    return
  }
  // 30-day retention window
  const deletedMs = new Date(doc.deleted_at + 'Z').getTime()
  const ageMs = Date.now() - deletedMs
  if (ageMs > 30 * 24 * 60 * 60 * 1000) {
    res.status(410).json({ error: 'Délai de restauration dépassé (30 jours)' })
    return
  }

  getDb().prepare('UPDATE candidature_documents SET deleted_at = NULL WHERE id = ?').run(req.params.docId)

  try {
    getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, notes, created_by)
      VALUES (?, 'document', ?, ?)
    `).run(doc.candidature_id, `Restauré: ${doc.filename}`, getUser(req).slug || 'unknown')
  } catch { /* audit non-blocking */ }

  res.status(204).send()
})

// PATCH document — currently supports renaming via display_filename
const ALLOWED_DOC_TYPES = new Set(['cv', 'lettre', 'aboro', 'entretien', 'proposition', 'administratif', 'other'])

protectedRouter.patch('/documents/:docId', (req, res) => {
  const body = req.body as { display_filename?: unknown; type?: unknown }
  const hasName = typeof body.display_filename === 'string'
  const hasType = typeof body.type === 'string'
  if (!hasName && !hasType) {
    res.status(400).json({ error: 'display_filename ou type requis' })
    return
  }

  let trimmed: string | null = null
  if (hasName) {
    trimmed = (body.display_filename as string).trim()
    if (trimmed.length === 0 || trimmed.length > 200) {
      res.status(400).json({ error: 'Le nom doit faire entre 1 et 200 caractères' })
      return
    }
    // Block path separators and ASCII control chars (intentional — these are
    // exactly what we want to block in a stored filename).
    // eslint-disable-next-line no-control-regex
    if (/[\\/]/.test(trimmed) || /[\x00-\x1f\x7f]/.test(trimmed)) {
      res.status(400).json({ error: 'Caractères interdits dans le nom (séparateurs ou contrôle)' })
      return
    }
  }

  let newType: string | null = null
  if (hasType) {
    newType = body.type as string
    if (!ALLOWED_DOC_TYPES.has(newType)) {
      res.status(400).json({ error: 'Type invalide' })
      return
    }
  }

  const existing = getDb().prepare(
    'SELECT candidature_id, type, display_filename, filename FROM candidature_documents WHERE id = ? AND deleted_at IS NULL'
  ).get(req.params.docId) as { candidature_id: string; type: string; display_filename: string | null; filename: string } | undefined

  if (!existing) {
    res.status(404).json({ error: 'Document introuvable' })
    return
  }

  const effectiveType = newType ?? existing.type
  const typeChanged = hasType && newType !== existing.type

  // Moving into a slot (cv/lettre/aboro) must not collide with an already-filled slot.
  if (typeChanged && SLOT_TYPES.has(effectiveType)) {
    const filled = getDb().prepare(
      'SELECT 1 FROM candidature_documents WHERE candidature_id = ? AND type = ? AND id != ? AND deleted_at IS NULL LIMIT 1'
    ).get(existing.candidature_id, effectiveType, req.params.docId)
    if (filled) {
      res.status(409).json({ error: `Le slot « ${effectiveType} » est déjà occupé — supprimez ou remplacez le document existant avant de reclasser.` })
      return
    }
  }

  const nameForCheck = trimmed ?? (existing.display_filename ?? existing.filename)
  const conflict = getDb().prepare(`
    SELECT 1 FROM candidature_documents
    WHERE candidature_id = ? AND type = ? AND id != ?
      AND COALESCE(display_filename, filename) = ?
    LIMIT 1
  `).get(existing.candidature_id, effectiveType, req.params.docId, nameForCheck)

  if (conflict) {
    res.status(409).json({ error: 'Un autre document du même type porte déjà ce nom' })
    return
  }

  const updates: string[] = []
  const values: unknown[] = []
  if (hasName) { updates.push('display_filename = ?'); values.push(trimmed) }
  if (typeChanged) { updates.push('type = ?'); values.push(newType) }
  if (updates.length > 0) {
    values.push(req.params.docId)
    getDb().prepare(`UPDATE candidature_documents SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }

  const user = getUser(req)
  const noteParts: string[] = []
  if (hasName && trimmed !== (existing.display_filename ?? existing.filename)) noteParts.push(`Renommé: ${trimmed}`)
  if (typeChanged) noteParts.push(`Type: ${existing.type} → ${newType}`)
  if (noteParts.length > 0) {
    try {
      getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, notes, created_by)
        VALUES (?, 'document', ?, ?)
      `).run(existing.candidature_id, noteParts.join(' | '), user.slug || 'unknown')
    } catch {
      // Audit non-blocking
    }
  }

  res.json({ ok: true, display_filename: trimmed ?? existing.display_filename, type: effectiveType })
})

// Download a document
protectedRouter.get('/documents/:docId/download', async (req, res) => {
  const result = await getDocumentForDownload(req.params.docId)

  if ('error' in result) {
    res.status(result.status).json({ error: result.error })
    return
  }

  const safeFilename = result.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"')
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`)
  res.setHeader('Content-Type', result.contentType)

  if (result.kind === 'gcs') {
    res.send(result.buffer)
  } else {
    const fs = await import('fs')
    fs.createReadStream(result.filePath).pipe(res)
  }
})

// Item 8: Server-Sent Events stream for live updates on a candidature page.
// Channels: document_scan_updated, extraction_run_completed, status_changed.
// Auth: requireLead (already applied via protectedRouter). Per-candidature
// existence check so a closed candidature returns 404 cleanly. Heartbeats
// every 15 s keep the connection alive through GKE/proxy idle timeouts.
//
// Codex flagged: this works for prod's single-replica deployment. When we
// scale out, replace the in-process bus with Cloud Pub/Sub. See ADR.
protectedRouter.get('/candidatures/:id/events/stream', (req, res) => {
  const exists = getDb().prepare('SELECT id FROM candidatures WHERE id = ?').get(req.params.id) as { id: string } | undefined
  if (!exists) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // disables Nginx buffering if ever in front
  res.flushHeaders()

  const candidatureId = req.params.id
  const send = <K extends keyof RecruitmentEventMap>(event: K, payload: RecruitmentEventMap[K]): void => {
    try {
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    } catch (err) {
      console.error('[SSE] write failed', err)
    }
  }

  // Initial hello so the client knows the connection is live.
  send('status_changed', { candidatureId, statutFrom: null, statutTo: '__connected__', byUserSlug: 'system' })

  // Subscribe to all three channels, filter by candidatureId.
  const offDocs = recruitmentBus.subscribe('document_scan_updated', (p) => {
    if (p.candidatureId === candidatureId) send('document_scan_updated', p)
  })
  const offExtraction = recruitmentBus.subscribe('extraction_run_completed', (p) => {
    if (p.candidatureId === candidatureId) send('extraction_run_completed', p)
  })
  const offStatus = recruitmentBus.subscribe('status_changed', (p) => {
    if (p.candidatureId === candidatureId) send('status_changed', p)
  })

  // Heartbeat — comment line, ignored by EventSource but keeps proxies happy.
  const heartbeat = setInterval(() => {
    try { res.write(`: keep-alive ${Date.now()}\n\n`) } catch { /* socket closed; cleanup will fire */ }
  }, 15_000)

  const cleanup = () => {
    clearInterval(heartbeat)
    offDocs()
    offExtraction()
    offStatus()
  }
  req.on('close', cleanup)
  req.on('error', cleanup)
})

// Item 18: AI-generated email body draft. Returns the four schema fields plus
// the markdown-rendered body that fits the existing customBody field on the
// transition dialog. Recruiter previews + edits before sending.
protectedRouter.post('/emails/ai-generate', async (req, res) => {
  const body = req.body as {
    candidatureId?: unknown
    statut?: unknown
    contextNote?: unknown
    refuseReason?: unknown
    currentBody?: unknown
    instruction?: unknown
  }
  if (typeof body.candidatureId !== 'string' || typeof body.statut !== 'string') {
    res.status(400).json({ error: 'candidatureId et statut requis' })
    return
  }
  const cand = getDb().prepare(`
    SELECT cand.name, p.titre AS poste_titre
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    JOIN postes p ON p.id = c.poste_id
    WHERE c.id = ?
  `).get(body.candidatureId) as { name: string; poste_titre: string } | undefined
  if (!cand) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  try {
    const { generateAiEmailDraft } = await import('../lib/email-ai.js')
    const { draftToMarkdown } = await import('../emails/ai-schema.js')
    const result = await generateAiEmailDraft({
      candidateName: cand.name,
      role: cand.poste_titre,
      statut: body.statut,
      contextNote: typeof body.contextNote === 'string' ? body.contextNote.slice(0, 500) : undefined,
      refuseReason: typeof body.refuseReason === 'string' ? body.refuseReason.slice(0, 500) : undefined,
      currentBody: typeof body.currentBody === 'string' ? body.currentBody.slice(0, 4000) : undefined,
      instruction: typeof body.instruction === 'string' ? body.instruction.slice(0, 500) : undefined,
    })
    res.json({
      draft: result.draft,
      bodyMarkdown: draftToMarkdown(result.draft),
      meta: {
        promptVersion: result.promptVersion,
        modelVersion: result.modelVersion,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    })
  } catch (err) {
    console.error('[EMAIL_AI] failed', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Échec génération IA' })
  }
})

// Render the email a recruiter is about to send. Pure preview — no Resend call.
// Item 16: lets ConfirmEmailDialog show the actual HTML the candidate will see,
// not a markdown approximation, before the recruiter clicks "Envoyer & avancer".
protectedRouter.post('/emails/preview', (req, res) => {
  const body = req.body as { candidatureId?: unknown; statut?: unknown; customBody?: unknown; includeReasonInEmail?: unknown; notes?: unknown }
  if (typeof body.candidatureId !== 'string' || typeof body.statut !== 'string') {
    res.status(400).json({ error: 'candidatureId et statut requis' })
    return
  }

  const cand = getDb().prepare(`
    SELECT cand.name, cand.id AS candidate_id, p.titre AS poste_titre
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    JOIN postes p ON p.id = c.poste_id
    WHERE c.id = ?
  `).get(body.candidatureId) as { name: string; candidate_id: string; poste_titre: string } | undefined

  if (!cand) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  const baseUrl = process.env.BETTER_AUTH_URL || `${req.protocol}://${req.get('host')}`
  renderTransitionEmail({
    candidateName: cand.name,
    role: cand.poste_titre,
    statut: body.statut,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
    customBody: typeof body.customBody === 'string' ? body.customBody : undefined,
    includeReasonInEmail: !!body.includeReasonInEmail,
    evaluationUrl: body.statut === 'skill_radar_envoye'
      ? `${baseUrl}/evaluate/${cand.candidate_id}`
      : undefined,
  }).then(rendered => {
    if (!rendered) {
      res.status(404).json({ error: `Aucun template pour le statut "${body.statut}"` })
      return
    }
    res.json({ subject: rendered.subject, html: previewizeEmailHtml(rendered.html) })
  }).catch(err => {
    console.error('[EMAIL_PREVIEW] failed', err)
    res.status(500).json({ error: 'Échec du rendu du template' })
  })
})

// Delete a single candidature (NOT the candidate). Use this from any "delete card"
// UI in the pipeline — the candidate row + their other candidatures stay intact.
// Documents and events for this candidature are cascade-deleted via FK.
protectedRouter.delete('/candidatures/:id', mutationRateLimit, (req, res) => {
  const db = getDb()
  const cand = db.prepare(`
    SELECT c.id, c.candidate_id, cand.name, p.titre AS poste_titre
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    JOIN postes p ON p.id = c.poste_id
    WHERE c.id = ?
  `).get(req.params.id) as { id: string; candidate_id: string; name: string; poste_titre: string } | undefined

  if (!cand) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  // Collect document blobs to clean up after the cascade.
  const docs = db.prepare(
    'SELECT path FROM candidature_documents WHERE candidature_id = ?'
  ).all(req.params.id) as { path: string }[]

  db.prepare('DELETE FROM candidatures WHERE id = ?').run(req.params.id)

  // GCS cleanup — best effort, never blocks
  for (const doc of docs) {
    if (isGcsPath(doc.path)) continue // GCS objects can be GC'd separately
    try { import('fs').then(fs => fs.unlinkSync(doc.path)).catch(() => {}) } catch { /* */ }
  }

  // Audit on the candidate side so the timeline retains the deletion.
  // Cannot insert into candidature_events (the candidature is gone), so we leave
  // the candidate.notes alone — the recruiter sees the row vanish from the list.

  res.status(204).send()
})

// Revert the most recent status change for a candidature (within 10 min, same user).
// Emits a NEW status_change event — never deletes the original — so the audit
// trail keeps the full forward+back history.
const REVERT_WINDOW_MS = 10 * 60 * 1000
const TERMINAL_STATUTS = new Set(['embauche', 'refuse'])
protectedRouter.post('/candidatures/:id/revert-status', mutationRateLimit, (req, res) => {
  const lastEvent = getDb().prepare(`
    SELECT id, statut_from, statut_to, created_by, created_at
    FROM candidature_events
    WHERE candidature_id = ? AND type = 'status_change'
    ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id) as { id: number; statut_from: string | null; statut_to: string; created_by: string; created_at: string } | undefined

  if (!lastEvent) {
    res.status(404).json({ error: 'Aucun changement de statut à annuler' })
    return
  }
  if (!lastEvent.statut_from) {
    res.status(409).json({ error: 'Premier événement — rien à annuler' })
    return
  }

  const ageMs = Date.now() - new Date(lastEvent.created_at + 'Z').getTime()
  if (ageMs > REVERT_WINDOW_MS) {
    res.status(410).json({
      error: 'Délai d’annulation dépassé (10 minutes). Pour reculer, utilisez un nouveau changement de statut.',
      ageMinutes: Math.round(ageMs / 60000),
    })
    return
  }

  const user = getUser(req)
  if (lastEvent.created_by !== (user.slug || 'unknown')) {
    res.status(403).json({
      error: `Seul l’utilisateur ayant fait le changement (${lastEvent.created_by}) peut l’annuler dans les 10 minutes.`,
    })
    return
  }

  // Block revert OUT of terminal statuses — too many side effects
  // (embauche triggers onboarding, refuse sent a finality email).
  if (TERMINAL_STATUTS.has(lastEvent.statut_to)) {
    res.status(422).json({
      error: `Impossible d’annuler une transition vers "${lastEvent.statut_to}" (effets de bord engagés). Créez un nouveau changement de statut explicite.`,
      statut_to: lastEvent.statut_to,
    })
    return
  }

  const current = getDb().prepare('SELECT statut FROM candidatures WHERE id = ?').get(req.params.id) as { statut: string } | undefined
  if (!current) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }
  // Defensive: if the candidature has been moved again since lastEvent, refuse.
  if (current.statut !== lastEvent.statut_to) {
    res.status(409).json({
      error: 'Le statut a évolué depuis. Rafraîchissez la page.',
      currentStatut: current.statut,
    })
    return
  }

  try {
    getDb().transaction(() => {
      const result = getDb().prepare(
        'UPDATE candidatures SET statut = ?, updated_at = datetime(\'now\') WHERE id = ? AND statut = ?'
      ).run(lastEvent.statut_from, req.params.id, current.statut)
      if (result.changes === 0) throw new Error('REVERT_CONFLICT')

      getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, notes, created_by)
        VALUES (?, 'status_change', ?, ?, ?, ?)
      `).run(req.params.id, current.statut, lastEvent.statut_from, `Annulation de la transition ${lastEvent.statut_from} → ${current.statut}`, user.slug || 'unknown')
    })()
  } catch (err) {
    if ((err as Error).message === 'REVERT_CONFLICT') {
      res.status(409).json({ error: 'Conflit pendant l’annulation. Rafraîchissez la page.' })
      return
    }
    throw err
  }

  res.json({ ok: true, statut: lastEvent.statut_from })
})

// Compatibility breakdown — lazy endpoint per (candidature, metric).
// Drives the "Voir les détails" UI on the % pill.
protectedRouter.get('/candidatures/:id/compat/:metric', (req, res) => {
  const metric = req.params.metric
  if (metric !== 'poste' && metric !== 'equipe' && metric !== 'soft') {
    res.status(400).json({ error: 'metric doit être poste, equipe ou soft' })
    return
  }

  const row = getDb().prepare(`
    SELECT cand.ratings AS candidate_ratings, cand.role_id AS candidate_role_id, p.role_id AS poste_role_id
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    JOIN postes p ON p.id = c.poste_id
    WHERE c.id = ?
  `).get(req.params.id) as { candidate_ratings: string | null; candidate_role_id: string | null; poste_role_id: string } | undefined

  if (!row) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }

  const ratings = safeJsonParse<Record<string, number>>(row.candidate_ratings ?? '{}', {})

  if (metric === 'poste') {
    res.json(getPosteCompatBreakdown(ratings, row.poste_role_id))
    return
  }
  if (metric === 'equipe') {
    const base = getEquipeCompatBreakdown(ratings, row.poste_role_id)
    // Phase 9: surface gap analysis + bonus skills + run metadata so the UI
    // can answer "why did the candidate get this equipe score, and what
    // did the LLM add that was not asked for?"
    const gap = getGapAnalysis(ratings, row.poste_role_id)
    const bonus = getBonusSkills(ratings, row.poste_role_id)
    const candidateIdRow = getDb().prepare('SELECT candidate_id FROM candidatures WHERE id = ?').get(req.params.id) as { candidate_id: string } | undefined
    const metaRow = candidateIdRow ? getDb().prepare(
      `SELECT prompt_version, model FROM cv_extraction_runs
         WHERE candidate_id = ? AND kind = 'skills_baseline' AND status = 'success'
         ORDER BY started_at DESC LIMIT 1`,
    ).get(candidateIdRow.candidate_id) as { prompt_version: number; model: string } | undefined : undefined
    res.json({
      ...base,
      gapAnalysis: gap,
      bonusSkills: bonus,
      promptVersion: metaRow?.prompt_version ?? null,
      model: metaRow?.model ?? null,
    })
    return
  }

  // soft
  const candidateRow = getDb().prepare(`
    SELECT candidate_id FROM candidatures WHERE id = ?
  `).get(req.params.id) as { candidate_id: string } | undefined
  if (!candidateRow) {
    res.status(404).json({ error: 'Candidature introuvable' })
    return
  }
  const aboroRow = getDb().prepare(
    'SELECT profile_json FROM aboro_profiles WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(candidateRow.candidate_id) as { profile_json: string } | undefined
  if (!aboroRow) {
    res.status(404).json({ error: 'Aucun profil Âboro disponible pour ce candidat', missing: true })
    return
  }
  const profile = safeJsonParse<import('../lib/aboro-extraction.js').AboroProfile | null>(aboroRow.profile_json, null)
  if (!profile) {
    res.status(500).json({ error: 'Profil Âboro illisible' })
    return
  }
  res.json(getSoftSkillBreakdown(profile))
})

// Preview a document inline (PDFs only). Logs view to candidature_events.
protectedRouter.get('/documents/:docId/preview', async (req, res) => {
  const result = await getDocumentForDownload(req.params.docId)

  if ('error' in result) {
    res.status(result.status).json({ error: result.error })
    return
  }

  // Serve any type with Content-Disposition: inline. PDFs and images render in
  // the browser; anything else falls back to the browser's default handler
  // (usually a download prompt), which is exactly what a user asking to "view"
  // a .docx would get anyway — same UX, no 406.
  const user = getUser(req)
  try {
    getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, notes, created_by)
      SELECT candidature_id, 'document', ?, ?
      FROM candidature_documents WHERE id = ?
    `).run(`Aperçu: ${result.filename}`, user.slug || 'unknown', req.params.docId)
  } catch {
    // Audit failure must never block preview
  }

  const safeFilename = result.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"')
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`)
  res.setHeader('Content-Type', result.contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (result.kind === 'gcs') {
    res.send(result.buffer)
  } else {
    const fs = await import('fs')
    fs.createReadStream(result.filePath).pipe(res)
  }
})

// Get scan status for a document, including any active override.
// Manual rescan trigger — re-runs ClamAV + VirusTotal on an existing doc.
// Used by the "Relancer" button in scan-detail-dialog when VT timed out.
// Rate-limited (mutationRateLimit) + in-flight guarded to protect the VT
// quota from loop-clicks and from the auto-retry scheduler racing the user.
protectedRouter.post('/documents/:docId/rescan', mutationRateLimit, (req, res) => {
  const doc = getDb().prepare(
    'SELECT id, path, filename, candidature_id, scan_status, scanned_at FROM candidature_documents WHERE id = ? AND deleted_at IS NULL'
  ).get(req.params.docId) as { id: string; path: string; filename: string; candidature_id: string; scan_status: string | null; scanned_at: string | null } | undefined

  if (!doc) {
    res.status(404).json({ error: 'Document introuvable' })
    return
  }

  // In-flight guard: a scan is already running if scan_status is 'pending'
  // AND it was updated recently (5 min). Older 'pending' rows are treated
  // as stuck and re-triggering is allowed. Prevents concurrent scans from
  // racing their UPDATEs — last-writer-wins was corrupting the result.
  if (doc.scan_status === 'pending' && doc.scanned_at) {
    const pendingFor = Date.now() - new Date(doc.scanned_at.replace(' ', 'T') + 'Z').getTime()
    if (pendingFor < 5 * 60 * 1000) {
      res.status(409).json({ error: 'Un scan est déjà en cours pour ce document', status: 'pending' })
      return
    }
  }

  // Reset status to pending AND stamp scanned_at so the in-flight guard
  // above works (previous writer only set scanned_at on completion).
  getDb().prepare(
    "UPDATE candidature_documents SET scan_status = 'pending', scan_result = NULL, scanned_at = datetime('now') WHERE id = ?"
  ).run(doc.id)

  // Fire-and-forget — triggerDocumentScan publishes SSE updates + persists the result.
  triggerDocumentScan(doc.id, doc.path, doc.filename).catch(err =>
    console.error(`[RESCAN] Document ${doc.id} failed:`, err)
  )

  res.json({ ok: true, status: 'pending' })
})

protectedRouter.get('/documents/:docId/scan', (req, res) => {
  const doc = getDb().prepare(
    'SELECT scan_status, scan_result, scanned_at FROM candidature_documents WHERE id = ?'
  ).get(req.params.docId) as { scan_status: string | null; scan_result: string | null; scanned_at: string | null } | undefined

  if (!doc) {
    res.status(404).json({ error: 'Document introuvable' })
    return
  }

  // Codex P1: previously fell back to the raw string on parse failure, which
  // crashed the scan-detail-dialog when it tried to read .engines / .threats.
  // Now: object on success, null on failure (dialog handles null cleanly).
  let parsedResult: Record<string, unknown> | null = null
  if (doc.scan_result) {
    try {
      const parsed = JSON.parse(doc.scan_result)
      parsedResult = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null
    } catch {
      console.warn(`[SCAN] malformed scan_result on document ${req.params.docId} — surfacing as null`)
      parsedResult = null
    }
  }

  // Look up active override (if any).
  const override = getDb().prepare(
    `SELECT id, verdict, reason, expires_at, created_by, created_at
     FROM scan_overrides
     WHERE document_id = ? AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 1`
  ).get(req.params.docId) as { id: string; verdict: string; reason: string; expires_at: string; created_by: string; created_at: string } | undefined

  res.json({
    status: doc.scan_status ?? 'pending',
    result: parsedResult,
    scannedAt: doc.scanned_at,
    override: override ?? null,
    effectiveVerdict: override?.verdict ?? (doc.scan_status === 'clean' ? 'safe' : doc.scan_status === 'infected' ? 'quarantine' : doc.scan_status ?? 'pending'),
  })
})

// Create a scan override (recruiter mark file safe / quarantine for an incident).
// Reason mandatory, expiry defaults to 30 days. Audit-logged. Recruitment-lead only
// (already enforced by protectedRouter).
protectedRouter.post('/documents/:docId/scan/override', (req, res) => {
  const body = req.body as { verdict?: unknown; reason?: unknown; expires_at?: unknown }
  if (body.verdict !== 'safe' && body.verdict !== 'quarantine') {
    res.status(400).json({ error: 'verdict doit être "safe" ou "quarantine"' })
    return
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 10) {
    res.status(400).json({ error: 'Une raison d’au moins 10 caractères est requise' })
    return
  }

  const doc = getDb().prepare(
    'SELECT candidature_id, filename FROM candidature_documents WHERE id = ?'
  ).get(req.params.docId) as { candidature_id: string; filename: string } | undefined
  if (!doc) {
    res.status(404).json({ error: 'Document introuvable' })
    return
  }

  // Default 30-day expiry; cap user-provided expiry at 365 days.
  let expiresAt: string
  if (typeof body.expires_at === 'string') {
    const parsed = new Date(body.expires_at)
    if (isNaN(parsed.getTime())) {
      res.status(400).json({ error: 'expires_at invalide (ISO 8601 attendu)' })
      return
    }
    const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000
    if (parsed.getTime() > oneYearFromNow) {
      res.status(400).json({ error: 'Expiration plafonnée à 1 an' })
      return
    }
    expiresAt = parsed.toISOString()
  } else {
    expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }

  const user = getUser(req)
  const id = crypto.randomUUID()
  getDb().prepare(`
    INSERT INTO scan_overrides (id, document_id, verdict, reason, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.docId, body.verdict, reason, expiresAt, user.slug || 'unknown')

  try {
    getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, notes, created_by)
      VALUES (?, 'document', ?, ?)
    `).run(doc.candidature_id, `Override scan (${body.verdict}) sur ${doc.filename} — raison: ${reason}`, user.slug || 'unknown')
  } catch { /* audit non-blocking */ }

  res.status(201).json({ id, verdict: body.verdict, reason, expires_at: expiresAt })
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
  } catch {
    console.error('[MANUAL_ABORO] Save failed')
    res.status(500).json({ error: 'Erreur sauvegarde' })
  }
})

// ─── AI Email Draft ─────────────────────────────────────────────────

const AI_EMAIL_SYSTEM_PROMPT = `Tu es un recruteur professionnel chez SINAPSE, une ESN basée en Nouvelle-Calédonie. Rédige des emails professionnels en français. Sois chaleureux mais professionnel. Ne fabrique pas de détails sur le candidat qui ne sont pas dans le contexte fourni.

Réponds au format suivant exactement :
SUJET: <sujet de l'email>
CORPS:
<corps de l'email en texte simple>`

function stripPii(text: string | undefined | null): string {
  if (!text) return ''
  return text
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email masqué]')
    .replace(/(\+?\d[\d\s.-]{7,})/g, '[téléphone masqué]')
}

function getEmailPrompt(statut: string, candidateName: string, role: string, candidateContext?: string): string {
  const contextBlock = candidateContext
    ? `\n\nContexte candidat :\n${stripPii(candidateContext).slice(0, 4000)}`
    : ''

  switch (statut) {
    case 'refuse':
      return `Rédige un email de refus poli pour ${candidateName}, candidat(e) au poste de ${role}. Remercie pour le temps consacré, sois empathique mais clair.${contextBlock}`
    case 'embauche':
      return `Rédige un email de bienvenue/offre pour ${candidateName}, recruté(e) au poste de ${role}. Félicite et montre l'enthousiasme de l'équipe.${contextBlock}`
    case 'proposition':
      return `Rédige un email de proposition d'embauche pour ${candidateName} au poste de ${role}. Exprime l'intérêt et invite à discuter des modalités.${contextBlock}`
    case 'preselectionne':
      return `Rédige un email informant ${candidateName} que sa candidature au poste de ${role} a été présélectionnée. Bonne nouvelle, prochaines étapes à venir.${contextBlock}`
    case 'entretien_1':
    case 'entretien_2':
      return `Rédige un email de convocation à un entretien pour ${candidateName}, candidat(e) au poste de ${role}. Invite à proposer des créneaux.${contextBlock}`
    default:
      return `Rédige un email de mise à jour de statut pour ${candidateName}, candidat(e) au poste de ${role}. Le statut passe à "${statut}".${contextBlock}`
  }
}

protectedRouter.post('/ai-email-draft', heavyRateLimit, async (req, res) => {
  const { statut, candidateName, role, candidateContext } = req.body

  if (!statut || !candidateName || !role) {
    res.status(400).json({ error: 'statut, candidateName et role sont requis' })
    return
  }

  try {
    const client = new Anthropic()
    const prompt = getEmailPrompt(statut, candidateName, role, candidateContext)

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
      system: AI_EMAIL_SYSTEM_PROMPT,
    })

    const rawText = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    // Parse subject and body from the structured response
    const subjectMatch = rawText.match(/SUJET:\s*(.+?)(?:\n|$)/)
    const bodyMatch = rawText.match(/CORPS:\s*\n?([\s\S]+)/)

    const subject = subjectMatch?.[1]?.trim() || `${candidateName} — ${role}`
    const body = bodyMatch?.[1]?.trim() || rawText

    res.json({ subject, body })
  } catch (err) {
    console.error('[AI_EMAIL] Draft generation failed')
    const isTimeout = err instanceof Error && (err.message.includes('timeout') || err.message.includes('ETIMEDOUT'))
    res.status(503).json({ error: 'ai_unavailable', detail: isTimeout ? 'Claude timeout' : 'Claude API error' })
  }
})

// ─── Batch ZIP Download ─────────────────────────────────────────────

protectedRouter.post('/candidatures/batch-zip', heavyRateLimit, async (req, res) => {
  const { candidatureIds } = req.body

  if (!Array.isArray(candidatureIds) || candidatureIds.length === 0) {
    res.status(400).json({ error: 'candidatureIds requis (tableau non vide)' })
    return
  }

  if (candidatureIds.length > 20) {
    res.status(400).json({ error: 'Maximum 20 candidatures par téléchargement' })
    return
  }

  // Validate all IDs are strings
  if (!candidatureIds.every((id: unknown) => typeof id === 'string')) {
    res.status(400).json({ error: 'Tous les IDs doivent être des chaînes' })
    return
  }

  try {
    const fs = await import('fs')

    // Fetch all candidatures with their data
    const candidatures = candidatureIds.map(id => {
      const row = getDb().prepare(`
        SELECT c.id, c.statut, c.canal, c.taux_compatibilite_poste, c.taux_compatibilite_equipe,
          cand.name, cand.email, cand.telephone, cand.pays,
          p.titre AS poste_titre, p.pole AS poste_pole
        FROM candidatures c
        JOIN candidates cand ON cand.id = c.candidate_id
        JOIN postes p ON p.id = c.poste_id
        WHERE c.id = ?
      `).get(id) as { id: string; statut: string; canal: string; taux_compatibilite_poste: number | null; taux_compatibilite_equipe: number | null; name: string; email: string | null; telephone: string | null; pays: string | null; poste_titre: string; poste_pole: string } | undefined
      return row ?? null
    }).filter((r): r is NonNullable<typeof r> => r !== null)

    if (candidatures.length === 0) {
      res.status(404).json({ error: 'Aucune candidature trouvée' })
      return
    }

    // Track folder name collisions
    const folderNames = new Map<string, number>()

    function makeFolderName(candidateName: string, posteTitre: string): string {
      const safeName = (candidateName as string).replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_') || 'Candidat'
      const safePoste = (posteTitre as string).replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_') || 'Poste'
      let base = `${safeName}_${safePoste}`
      const count = folderNames.get(base) ?? 0
      folderNames.set(base, count + 1)
      if (count > 0) base = `${base}_${count + 1}`
      return base
    }

    const { STATUT_LABELS: statusLabels } = await import('../lib/constants.js')

    // Create combined archive
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', () => {
      console.error('[BATCH_ZIP] Archive error')
    })

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="Dossiers_candidats_${candidatures.length}.zip"`)
    archive.pipe(res)

    for (const cand of candidatures) {
      const folderName = makeFolderName(cand.name as string, cand.poste_titre as string)

      // Get documents (active only — soft-deleted excluded)
      const docs = getDb().prepare(
        'SELECT id, type, filename, display_filename, path FROM candidature_documents WHERE candidature_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
      ).all(cand.id as string) as { id: string; type: string; filename: string; display_filename: string | null; path: string }[]

      // Get events
      const events = getDb().prepare(
        'SELECT type, statut_from, statut_to, notes, created_by, created_at FROM candidature_events WHERE candidature_id = ? ORDER BY created_at ASC'
      ).all(cand.id as string) as { type: string; statut_from: string | null; statut_to: string | null; notes: string | null; created_by: string; created_at: string }[]

      // Add documents — honour display_filename if the user renamed.
      let idx = 1
      for (const doc of docs) {
        const ext = doc.filename.split('.').pop() ?? 'pdf'
        const prefix = String(idx).padStart(2, '0')
        const safeType = doc.type.replace(/[^a-zA-Z0-9_-]/g, '_')
        const typeName = safeType === 'other' ? 'Document' : safeType.charAt(0).toUpperCase() + safeType.slice(1)
        const safeCandName = (cand.name as string).replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_') || 'Candidat'
        const baseName = doc.display_filename
          ? doc.display_filename.replace(/[\\/]/g, '_').trim()
          : `${typeName}_${safeCandName}.${ext}`
        const archiveName = `${folderName}/${prefix}_${baseName}`

        if (isGcsPath(doc.path)) {
          try {
            const buffer = await downloadFromGcs(doc.path)
            archive.append(buffer, { name: archiveName })
            idx++
          } catch (err) {
            console.warn(`[BATCH_ZIP] Skipping GCS doc ${doc.id} — download failed:`, err)
          }
        } else if (fs.existsSync(doc.path)) {
          archive.file(doc.path, { name: archiveName })
          idx++
        }
      }

      // Add resume.txt
      let resume = `DOSSIER CANDIDAT — ${cand.name}\n`
      resume += `${'='.repeat(50)}\n\n`
      resume += `Poste : ${cand.poste_titre}\n`
      resume += `Pôle : ${cand.poste_pole}\n`
      resume += `Statut : ${statusLabels[cand.statut as string] ?? cand.statut}\n`
      resume += `Canal : ${cand.canal}\n`
      resume += `Email : ${cand.email ?? '—'}\n`
      resume += `Téléphone : ${cand.telephone ?? '—'}\n`
      resume += `Pays : ${cand.pays ?? '—'}\n`
      resume += `\nCompatibilité poste : ${cand.taux_compatibilite_poste ?? '—'}%\n`
      resume += `Compatibilité équipe : ${cand.taux_compatibilite_equipe ?? '—'}%\n`
      resume += `\nHISTORIQUE\n${'-'.repeat(30)}\n`
      for (const e of events) {
        const date = e.created_at.substring(0, 10)
        if (e.statut_to) {
          resume += `${date} | ${statusLabels[e.statut_to] ?? e.statut_to}`
          if (e.notes) resume += ` — ${e.notes}`
          resume += `\n`
        } else if (e.notes) {
          resume += `${date} | ${e.type} — ${e.notes}\n`
        }
      }
      resume += `\nDOCUMENTS (${docs.length})\n${'-'.repeat(30)}\n`
      for (const doc of docs) {
        resume += `• ${doc.type}: ${doc.display_filename ?? doc.filename}\n`
      }
      resume += `\n---\nGénéré par Skill Radar — GIE SINAPSE\n`

      archive.append(resume, { name: `${folderName}/_resume.txt` })
    }

    await archive.finalize()
  } catch {
    console.error('[BATCH_ZIP] Generation failed')
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du ZIP' })
    }
  }
})

// ─── Resend Webhook (unauthenticated, verified by Svix or plain secret) ──

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET

recruitmentRouter.post('/webhooks/resend', express.raw({ type: 'application/json' }), (req, res) => {
  if (!RESEND_WEBHOOK_SECRET) {
    res.status(500).json({ error: 'Webhook secret not configured' })
    return
  }

  let payload: Record<string, unknown>

  // Try Svix signature verification first (Resend's default mode)
  const svixId = req.headers['svix-id'] as string | undefined
  const svixTimestamp = req.headers['svix-timestamp'] as string | undefined
  const svixSignature = req.headers['svix-signature'] as string | undefined

  if (svixId && svixTimestamp && svixSignature) {
    try {
      // Prefer the raw body captured by the JSON parser's `verify` hook in
      // server/index.ts. Fall back to stringify only if unavailable (e.g.
      // the webhook registered express.raw() at route level — not the case
      // anymore but kept for defensive compat).
      const rawBody = (req as { rawBody?: string }).rawBody
        ?? (Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : JSON.stringify(req.body))
      const wh = new Webhook(RESEND_WEBHOOK_SECRET)
      payload = wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as Record<string, unknown>
    } catch {
      console.error('[WEBHOOK_AUTH] Verification failed')
      res.status(401).json({ error: 'Invalid webhook signature' })
      return
    }
  } else {
    // Fallback: plain x-webhook-secret header (basic mode)
    const secret = req.headers['x-webhook-secret'] || (req.headers['authorization'] as string | undefined)?.replace('Bearer ', '')
    if (!secret || secret !== RESEND_WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Invalid webhook secret' })
      return
    }
    payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf-8')) : req.body
  }
  if (!payload?.type || !payload?.data) {
    res.status(200).json({ ok: true }) // Resend expects 200 even for unhandled events
    return
  }

  // Process synchronously BEFORE acking so a DB failure returns 5xx and Resend
  // retries. Acking before persistence silently loses events on crash.

  // Diagnostic: log every incoming event type so ops can see which event
  // types Resend actually fires for this tenant. If "email.opened" never
  // appears in logs, the issue is Resend-side (domain lacks open tracking,
  // or email client blocked the pixel).
  console.log(`[Webhook] Resend event received: type=${payload.type} email_id=${(payload as { data?: { email_id?: string } })?.data?.email_id ?? 'unknown'}`)

  // Process email.opened events
  if (payload.type === 'email.opened') {
    try {
      const emailId = (payload as { type: string; data: { email_id?: string } }).data.email_id
      if (emailId) {
        const event = getDb().prepare(`
          SELECT ce.candidature_id, ce.email_snapshot
          FROM candidature_events ce
          WHERE ce.type = 'email_sent'
          AND json_extract(ce.email_snapshot, '$.messageId') = ?
        `).get(emailId) as { candidature_id: string; email_snapshot: string } | undefined

        if (!event) {
          console.log(`[Webhook] email.opened: no matching email_sent event for email_id=${emailId}`)
        } else {
          const existing = getDb().prepare(`
            SELECT id FROM candidature_events
            WHERE candidature_id = ? AND type = 'email_open'
            AND notes LIKE ?
          `).get(event.candidature_id, `%${emailId}%`) as { id: number } | undefined
          if (existing) {
            console.log(`[Webhook] Duplicate email_open for ${emailId}, skipping`)
          } else {
            getDb().prepare(`
              INSERT INTO candidature_events (candidature_id, type, notes, created_by)
              VALUES (?, 'email_open', ?, 'system')
            `).run(event.candidature_id, `Email ouvert par le candidat (messageId: ${emailId})`)
            console.log(`[Webhook] Recorded email_open for candidature ${event.candidature_id}`)
          }
        }
      }
    } catch (err) {
      console.error('[WEBHOOK] Error processing email.opened event', err)
    }
  }

  // Process email.bounced events
  if (payload.type === 'email.bounced') {
    try {
      const data = payload.data as Record<string, unknown>
      const emailId = data.email_id as string | undefined
      if (emailId) {
        const event = getDb().prepare(`
          SELECT ce.candidature_id
          FROM candidature_events ce
          WHERE ce.type = 'email_sent'
          AND json_extract(ce.email_snapshot, '$.messageId') = ?
        `).get(emailId) as { candidature_id: string } | undefined

        if (event) {
          const existing = getDb().prepare(`
            SELECT id FROM candidature_events
            WHERE candidature_id = ? AND type = 'email_failed'
            AND notes LIKE ?
          `).get(event.candidature_id, `%${emailId}%`) as { id: number } | undefined

          if (!existing) {
            getDb().prepare(`
              INSERT INTO candidature_events (candidature_id, type, notes, created_by)
              VALUES (?, 'email_failed', ?, 'system')
            `).run(event.candidature_id, `Email rebondi (messageId: ${emailId})`)
            console.log(`[Webhook] Recorded email_failed for candidature ${event.candidature_id}`)
          }
        }
      }
    } catch (err) {
      console.error('[WEBHOOK] Error processing email.bounced event', err)
    }
  }

  // Process email.clicked events
  if (payload.type === 'email.clicked') {
    recordDeliverabilityEvent(payload, 'email_clicked', (emailId) => `Lien cliqué dans l'email (messageId: ${emailId})`)
  }

  // Process email.delivered events (server accepted the message)
  if (payload.type === 'email.delivered') {
    recordDeliverabilityEvent(payload, 'email_delivered', (emailId) => `Email délivré au serveur destinataire (messageId: ${emailId})`)
  }

  // Process email.complained events (user marked as spam)
  if (payload.type === 'email.complained') {
    recordDeliverabilityEvent(payload, 'email_complained', (emailId) => `Email signalé comme spam par le destinataire (messageId: ${emailId})`)
  }

  // Process email.delivery_delayed events (soft bounce / retry)
  if (payload.type === 'email.delivery_delayed') {
    recordDeliverabilityEvent(payload, 'email_delay', (emailId) => `Livraison retardée — Resend réessaie (messageId: ${emailId})`)
  }

  // Process email.failed / email.suppressed (hard failures from Resend-side),
  // recorded under the same email_failed type as bounces so the UI surfaces
  // the same "Rebondi" badge.
  if (payload.type === 'email.failed' || payload.type === 'email.suppressed') {
    recordDeliverabilityEvent(payload, 'email_failed', (emailId) => {
      const reason = (payload.data as Record<string, unknown>)?.reason ?? payload.type
      return `Envoi ${payload.type === 'email.suppressed' ? 'supprimé' : 'échoué'} — ${String(reason).slice(0, 100)} (messageId: ${emailId})`
    })
  }

  res.status(200).json({ ok: true })
})

/** Shared helper: look up the originating email_sent event by messageId, then
 * insert a deliverability event (open / click / delivered / bounced / etc.)
 * with idempotency by messageId in notes. */
function recordDeliverabilityEvent(
  payload: Record<string, unknown>,
  eventType: 'email_clicked' | 'email_delivered' | 'email_complained' | 'email_delay' | 'email_failed',
  buildNotes: (emailId: string) => string,
): void {
  try {
    const data = payload.data as Record<string, unknown>
    const emailId = data.email_id as string | undefined
    if (!emailId) return

    const found = getDb().prepare(`
      SELECT ce.candidature_id
      FROM candidature_events ce
      WHERE ce.type = 'email_sent'
      AND json_extract(ce.email_snapshot, '$.messageId') = ?
    `).get(emailId) as { candidature_id: string } | undefined

    if (!found) return

    const existing = getDb().prepare(`
      SELECT id FROM candidature_events
      WHERE candidature_id = ? AND type = ?
      AND notes LIKE ?
    `).get(found.candidature_id, eventType, `%${emailId}%`) as { id: number } | undefined

    if (!existing) {
      getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, notes, created_by)
        VALUES (?, ?, ?, 'system')
      `).run(found.candidature_id, eventType, buildNotes(emailId))
      console.log(`[Webhook] Recorded ${eventType} for candidature ${found.candidature_id}`)
    }
  } catch {
    console.error(`[WEBHOOK] Error processing ${eventType} event`)
  }
}

// ─── Pipeline Health Check ──────────────────────────────────────────

recruitmentRouter.get('/pipeline-health', (_req, res) => {
  try {
    const db = getDb()

    // Last intake event timestamp
    const lastIntake = db.prepare(`
      SELECT created_at FROM candidature_events
      WHERE type = 'transition' AND statut_to = 'postule'
      ORDER BY created_at DESC LIMIT 1
    `).get() as { created_at: string } | undefined

    // Candidates received in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recentCount = db.prepare(`
      SELECT COUNT(*) as count FROM candidatures
      WHERE created_at >= ?
    `).get(twentyFourHoursAgo) as { count: number }

    // Service statuses
    const emailServiceStatus = !!process.env.RESEND_API_KEY
    const virusTotalConfigured = !!process.env.VIRUSTOTAL_API_KEY
    // ClamAV is optional — check if clamdscan or clamscan would be available
    const clamAvConfigured = !!process.env.CLAMAV_HOST || !!process.env.CLAMDSCAN_PATH

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (!emailServiceStatus) status = 'degraded'
    if (!lastIntake) status = 'degraded'

    res.json({
      drupalWebhookLastReceived: lastIntake?.created_at ?? null,
      emailServiceStatus: emailServiceStatus ? 'configured' : 'not_configured',
      scannerStatus: {
        virustotal: virusTotalConfigured ? 'configured' : 'not_configured',
        clamav: clamAvConfigured ? 'configured' : 'not_configured',
      },
      candidatesLast24h: recentCount.count,
      status,
    })
  } catch {
    console.error('[PIPELINE_HEALTH] Health check failed')
    res.status(500).json({ status: 'unhealthy', error: 'Health check failed' })
  }
})

// Mount protected routes
recruitmentRouter.use('/', protectedRouter)

import crypto from 'crypto'
import { getDb } from './db.js'
import { extractCvText, extractSkillsFromCv } from './cv-extraction.js'
import { getSkillCategories } from './catalog.js'
import { calculatePosteCompatibility, calculateEquipeCompatibility, calculateGlobalScore } from './compatibility.js'
import { uploadDocument } from './document-service.js'
import type { PosteRow } from './types.js'

// ─── Process intake ──────────────────────────────────────────────────

interface IntakeFields {
  nom: string
  prenom?: string
  email: string
  telephone?: string
  pays?: string
  poste_vise: string
  linkedin?: string
  github?: string
  message?: string
  canal?: string
}

interface IntakeResult {
  ok: true
  candidatureId: string
  candidateId?: string
  updated: boolean
}

interface IntakeError {
  error: string
  status: number
}

export async function processIntake(
  fields: IntakeFields,
  cvFile: { buffer: Buffer; mimetype: string; originalname?: string } | null,
  lettreFile: { buffer: Buffer; mimetype: string; originalname?: string } | null,
): Promise<IntakeResult | IntakeError> {
  const { nom, prenom, email, telephone, pays, poste_vise, linkedin, github, message, canal } = fields

  if (!nom || !email || !poste_vise) {
    return { error: 'nom, email, et poste_vise sont requis', status: 400 }
  }

  // Validate poste exists
  const poste = getDb().prepare('SELECT * FROM postes WHERE id = ?').get(poste_vise) as PosteRow | undefined
  if (!poste) {
    return { error: `Poste invalide: ${poste_vise}`, status: 400 }
  }

  // Check idempotence: same email + same poste = update existing
  const existingCandidature = getDb().prepare(`
    SELECT c.id as candidature_id, c.candidate_id
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    WHERE cand.email = ? AND c.poste_id = ?
  `).get(email.trim(), poste_vise) as { candidature_id: string; candidate_id: string } | undefined

  if (existingCandidature) {
    return { ok: true, candidatureId: existingCandidature.candidature_id, updated: true }
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

  // Save message as candidate notes (visible in detail page)
  if (message?.trim()) {
    getDb().prepare('UPDATE candidates SET notes = ? WHERE id = ?')
      .run(message.trim(), candidateId)
  }

  // Save CV file as downloadable document
  if (cvFile) {
    try {
      await uploadDocument({
        candidatureId,
        file: { buffer: cvFile.buffer, mimetype: cvFile.mimetype, filename: cvFile.originalname || 'cv.pdf' },
        docType: 'cv',
        userSlug: 'drupal-webhook',
      })
    } catch (err) {
      console.error('[Intake] CV file save error:', err)
    }
  }

  // Save lettre de motivation as downloadable document
  if (lettreFile) {
    try {
      await uploadDocument({
        candidatureId,
        file: { buffer: lettreFile.buffer, mimetype: lettreFile.mimetype, filename: lettreFile.originalname || 'lettre.pdf' },
        docType: 'lettre',
        userSlug: 'drupal-webhook',
      })
    } catch (err) {
      console.error('[Intake] Lettre file save error:', err)
    }
  }

  // Process CV for AI skill extraction (outside transaction — external API call)
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
        const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, null)
        getDb().prepare(
          'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
        ).run(tauxPoste, tauxEquipe, tauxGlobal, candidatureId)
      }
    } catch (err) {
      console.error('[Intake] CV processing error:', err)
    }
  }

  return { ok: true, candidatureId, candidateId, updated: false }
}

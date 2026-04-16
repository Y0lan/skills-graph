import crypto from 'crypto'
import { getDb } from './db.js'
import { extractCvText, extractSkillsFromCv } from './cv-extraction.js'
import { getSkillCategories } from './catalog.js'
import { calculatePosteCompatibility, calculateEquipeCompatibility, calculateGlobalScore } from './compatibility.js'
import { uploadDocument } from './document-service.js'
import { sendApplicationReceived } from './email.js'
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

  const fullName = prenom ? `${prenom.trim()} ${nom.trim()}` : nom.trim()
  const candidateId = crypto.randomUUID()
  const candidatureId = crypto.randomUUID()
  const VALID_CANALS = ['cabinet', 'site', 'candidature_directe', 'reseau']
  const resolvedCanal = canal?.trim() || 'site'
  if (!VALID_CANALS.includes(resolvedCanal)) {
    return { error: `Canal invalide: ${resolvedCanal}. Valeurs acceptées: ${VALID_CANALS.join(', ')}`, status: 400 }
  }

  // Atomic creation: idempotence check + candidate + candidature + event in one transaction
  // This prevents duplicate candidatures from parallel webhook deliveries
  const intakeResult = getDb().transaction((): IntakeResult => {
    // Check idempotence INSIDE transaction (case-insensitive email match)
    const existingCandidature = getDb().prepare(`
      SELECT c.id as candidature_id, c.candidate_id
      FROM candidatures c
      JOIN candidates cand ON cand.id = c.candidate_id
      WHERE LOWER(cand.email) = LOWER(?) AND c.poste_id = ?
    `).get(email.trim(), poste_vise) as { candidature_id: string; candidate_id: string } | undefined

    if (existingCandidature) {
      return { ok: true, candidatureId: existingCandidature.candidature_id, updated: true }
    }

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

    return { ok: true, candidatureId, candidateId, updated: false }
  })()

  if (intakeResult.updated) {
    // Redelivered webhook — retry any missing side effects
    const cid = intakeResult.candidatureId
    const existingCandidate = getDb().prepare(
      'SELECT candidate_id FROM candidatures WHERE id = ?'
    ).get(cid) as { candidate_id: string } | undefined

    if (existingCandidate) {
      const candId = existingCandidate.candidate_id

      // Retry candidate notes if blank
      if (message?.trim()) {
        const current = getDb().prepare('SELECT notes FROM candidates WHERE id = ?').get(candId) as { notes: string | null } | undefined
        if (!current?.notes) {
          getDb().prepare('UPDATE candidates SET notes = ? WHERE id = ?').run(message.trim(), candId)
        }
      }

      // Retry CV upload if missing
      if (cvFile) {
        const cvExists = getDb().prepare(
          "SELECT COUNT(*) as c FROM candidature_documents WHERE candidature_id = ? AND type = 'cv'"
        ).get(cid) as { c: number }
        if (cvExists.c === 0) {
          try {
            await uploadDocument({
              candidatureId: cid,
              file: { buffer: cvFile.buffer, mimetype: cvFile.mimetype, filename: cvFile.originalname || 'cv.pdf' },
              docType: 'cv',
              userSlug: 'drupal-webhook',
            })
          } catch (err) {
            console.error('[Intake retry] CV file save error:', err)
          }
        }
      }

      // Retry lettre upload if missing
      if (lettreFile) {
        const lettreExists = getDb().prepare(
          "SELECT COUNT(*) as c FROM candidature_documents WHERE candidature_id = ? AND type = 'lettre'"
        ).get(cid) as { c: number }
        if (lettreExists.c === 0) {
          try {
            await uploadDocument({
              candidatureId: cid,
              file: { buffer: lettreFile.buffer, mimetype: lettreFile.mimetype, filename: lettreFile.originalname || 'lettre.pdf' },
              docType: 'lettre',
              userSlug: 'drupal-webhook',
            })
          } catch (err) {
            console.error('[Intake retry] Lettre file save error:', err)
          }
        }
      }

      // Retry CV extraction if missing
      if (cvFile) {
        const candidate = getDb().prepare('SELECT cv_text FROM candidates WHERE id = ?').get(candId) as { cv_text: string | null } | undefined
        if (!candidate?.cv_text) {
          try {
            const cvText = await extractCvText(cvFile.buffer)
            const catalog = getSkillCategories()
            const result = await extractSkillsFromCv(cvText, catalog)
            const suggestions = result?.ratings ?? null
            getDb().prepare('UPDATE candidates SET cv_text = ?, ai_suggestions = ? WHERE id = ?')
              .run(cvText, suggestions ? JSON.stringify(suggestions) : null, candId)

            if (suggestions && Object.keys(suggestions).length > 0) {
              const posteInfo = getDb().prepare(
                'SELECT p.role_id FROM candidatures c JOIN postes p ON p.id = c.poste_id WHERE c.id = ?'
              ).get(cid) as { role_id: string } | undefined
              if (posteInfo) {
                const tauxPoste = calculatePosteCompatibility(suggestions, posteInfo.role_id)
                const tauxEquipe = calculateEquipeCompatibility(suggestions, posteInfo.role_id)
                const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, null)
                getDb().prepare(
                  'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
                ).run(tauxPoste, tauxEquipe, tauxGlobal, cid)
              }
            }
          } catch (err) {
            console.error('[Intake retry] CV processing error:', err)
          }
        }
      }

      // Do NOT retry confirmation email (risk of delayed duplicate)
    }

    return intakeResult
  }

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

  // Send application received emails (candidate + default lead)
  if (email?.trim()) {
    const defaultLeadSlug = 'yolan-maldonado'
    const leadEmail = `${defaultLeadSlug.replaceAll('-', '.')}@sinapse.nc`
    sendApplicationReceived({
      candidateName: fullName,
      role: poste.titre,
      candidateEmail: email.trim(),
      leadEmail,
    }).catch(err => console.error('[Intake] Application email error:', err))
  }

  return intakeResult
}

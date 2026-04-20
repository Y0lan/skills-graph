import crypto from 'crypto'
import { getDb } from './db.js'
import { extractCvText, extractSkillsFromCv } from './cv-extraction.js'
import { getSkillCategories } from './catalog.js'
import { calculatePosteCompatibility, calculateEquipeCompatibility, calculateGlobalScore } from './compatibility.js'
import { uploadDocument } from './document-service.js'
import { sendApplicationReceived } from './email.js'
import { DEFAULT_LEAD_SLUG } from '../middleware/require-lead.js'
import { safeJsonParse, type PosteRow } from './types.js'

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

  // Atomic creation: dedup-by-email + idempotence check + candidate (or reuse) + candidature + event
  // in one transaction. Prevents both duplicate candidates (same email applies to multiple postes)
  // and duplicate candidatures (parallel webhook redelivery on the same poste).
  const intakeResult = getDb().transaction((): IntakeResult => {
    // 1. Find existing candidate by email (case-insensitive). One person = one candidate.
    const existingCandidate = getDb().prepare(
      'SELECT id FROM candidates WHERE LOWER(email) = LOWER(?) ORDER BY created_at ASC LIMIT 1'
    ).get(email.trim()) as { id: string } | undefined

    if (existingCandidate) {
      // 2a. Candidate exists. Did they already apply to this poste? → idempotent return.
      const existingCandidature = getDb().prepare(
        'SELECT id FROM candidatures WHERE candidate_id = ? AND poste_id = ?'
      ).get(existingCandidate.id, poste_vise) as { id: string } | undefined

      if (existingCandidature) {
        return { ok: true, candidatureId: existingCandidature.id, updated: true }
      }

      // 2b. Candidate exists, new poste — refresh contact fields (last-write-wins on
      // optional metadata, never on email or name to avoid identity collisions) and
      // attach a NEW candidature.
      getDb().prepare(`
        UPDATE candidates SET
          telephone = COALESCE(?, telephone),
          pays = COALESCE(?, pays),
          linkedin_url = COALESCE(?, linkedin_url),
          github_url = COALESCE(?, github_url)
        WHERE id = ?
      `).run(
        telephone?.trim() || null,
        pays?.trim() || null,
        linkedin?.trim() || null,
        github?.trim() || null,
        existingCandidate.id,
      )

      getDb().prepare(`
        INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal)
        VALUES (?, ?, ?, 'postule', ?)
      `).run(candidatureId, existingCandidate.id, poste_vise, resolvedCanal)

      getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, statut_to, notes, created_by)
        VALUES (?, 'status_change', 'postule', ?, 'drupal-webhook')
      `).run(candidatureId, message?.trim() || null)

      // If the candidate already has ratings (self-eval done) or AI suggestions
      // from a previous CV upload, compute compat for THIS new candidature
      // immediately — otherwise the new candidature would show null scores and
      // wouldn't recompute until /evaluate is reopened.
      const existingData = getDb().prepare(
        'SELECT ratings, ai_suggestions FROM candidates WHERE id = ?'
      ).get(existingCandidate.id) as { ratings: string | null; ai_suggestions: string | null } | undefined
      if (existingData) {
        const candidateRatings = safeJsonParse<Record<string, number>>(existingData.ratings ?? '{}', {})
        const aiSuggestions = safeJsonParse<Record<string, number>>(existingData.ai_suggestions ?? '{}', {})
        const effectiveRatings = { ...aiSuggestions, ...candidateRatings }
        if (Object.keys(effectiveRatings).length > 0) {
          const tauxPoste = calculatePosteCompatibility(effectiveRatings, poste.role_id)
          const tauxEquipe = calculateEquipeCompatibility(effectiveRatings, poste.role_id)
          // Read existing soft-skill score (Aboro is candidate-level, applies to all).
          const softRow = getDb().prepare(
            'SELECT taux_soft_skills FROM candidatures WHERE candidate_id = ? AND taux_soft_skills IS NOT NULL LIMIT 1'
          ).get(existingCandidate.id) as { taux_soft_skills: number | null } | undefined
          const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, softRow?.taux_soft_skills ?? null)
          getDb().prepare(
            'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, taux_soft_skills = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
          ).run(tauxPoste, tauxEquipe, softRow?.taux_soft_skills ?? null, tauxGlobal, candidatureId)
        }
      }

      return { ok: true, candidatureId, candidateId: existingCandidate.id, updated: false }
    }

    // 3. New candidate, new candidature.
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
          } catch {
            console.error('[INTAKE_RETRY] CV file save failed')
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
          } catch {
            console.error('[INTAKE_RETRY] Lettre file save failed')
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
              // Recompute compat for EVERY candidature of this candidate, not
              // just the redelivered one — ai_suggestions live on the candidate.
              const allCandidatures = getDb().prepare(
                'SELECT c.id, p.role_id FROM candidatures c JOIN postes p ON p.id = c.poste_id WHERE c.candidate_id = ?'
              ).all(candId) as { id: string; role_id: string }[]
              const updateOne = getDb().prepare(
                'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
              )
              for (const c of allCandidatures) {
                const tauxPoste = calculatePosteCompatibility(suggestions, c.role_id)
                const tauxEquipe = calculateEquipeCompatibility(suggestions, c.role_id)
                const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, null)
                updateOne.run(tauxPoste, tauxEquipe, tauxGlobal, c.id)
              }
            }
          } catch {
            console.error('[INTAKE_RETRY] CV processing failed')
          }
        }
      }

      // Do NOT retry confirmation email (risk of delayed duplicate)
    }

    return intakeResult
  }

  // CRITICAL: use the resolved candidate id from the transaction, NOT the
  // freshly-generated `candidateId` variable. When intake reused an existing
  // candidate (multi-poste case), the freshly-generated id was never inserted —
  // any UPDATE on it silently affects 0 rows and we'd lose CV / notes / AI.
  const resolvedCandidateId = intakeResult.candidateId ?? candidateId

  // Save message as candidate notes (visible in detail page) — non-destructive:
  // append rather than overwrite so multi-poste candidates accumulate context.
  if (message?.trim()) {
    const existing = getDb().prepare('SELECT notes FROM candidates WHERE id = ?').get(resolvedCandidateId) as { notes: string | null } | undefined
    const merged = existing?.notes
      ? `${existing.notes}\n\n--- ${poste.titre} ---\n${message.trim()}`
      : message.trim()
    getDb().prepare('UPDATE candidates SET notes = ? WHERE id = ?').run(merged, resolvedCandidateId)
  }

  // Save CV file as downloadable document
  if (cvFile) {
    try {
      await uploadDocument({
        candidatureId: intakeResult.candidatureId,
        file: { buffer: cvFile.buffer, mimetype: cvFile.mimetype, filename: cvFile.originalname || 'cv.pdf' },
        docType: 'cv',
        userSlug: 'drupal-webhook',
      })
    } catch {
      console.error('[INTAKE] CV file save failed')
    }
  }

  // Save lettre de motivation as downloadable document
  if (lettreFile) {
    try {
      await uploadDocument({
        candidatureId: intakeResult.candidatureId,
        file: { buffer: lettreFile.buffer, mimetype: lettreFile.mimetype, filename: lettreFile.originalname || 'lettre.pdf' },
        docType: 'lettre',
        userSlug: 'drupal-webhook',
      })
    } catch {
      console.error('[INTAKE] Lettre file save failed')
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
        .run(cvText, suggestions ? JSON.stringify(suggestions) : null, resolvedCandidateId)

      // Update compatibility scores for EVERY candidature of this candidate, not
      // just the one that triggered this intake. CV extraction updates the
      // candidate-level ai_suggestions which feed all postes' compat formulas.
      if (suggestions && Object.keys(suggestions).length > 0) {
        const allCandidatures = getDb().prepare(
          'SELECT c.id, p.role_id FROM candidatures c JOIN postes p ON p.id = c.poste_id WHERE c.candidate_id = ?'
        ).all(resolvedCandidateId) as { id: string; role_id: string }[]
        const updateOne = getDb().prepare(
          'UPDATE candidatures SET taux_compatibilite_poste = ?, taux_compatibilite_equipe = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
        )
        for (const c of allCandidatures) {
          const tauxPoste = calculatePosteCompatibility(suggestions, c.role_id)
          const tauxEquipe = calculateEquipeCompatibility(suggestions, c.role_id)
          const tauxGlobal = calculateGlobalScore(tauxPoste, tauxEquipe, null)
          updateOne.run(tauxPoste, tauxEquipe, tauxGlobal, c.id)
        }
      }
    } catch {
      console.error('[INTAKE] CV processing failed')
    }
  }

  // Send application received emails (candidate + default lead)
  if (email?.trim()) {
    const leadEmail = `${DEFAULT_LEAD_SLUG.replaceAll('-', '.')}@sinapse.nc`
    // Skip resend on idempotent replay — if the caller submits the same intake
    // twice (Drupal webhook retry, manual retry), sendApplicationReceived would
    // otherwise dispatch a second "Candidature reçue" email AND record a second
    // email_sent event. Both are undesirable.
    if (!intakeResult.updated) {
      sendApplicationReceived({
        candidateName: fullName,
        role: poste.titre,
        candidateEmail: email.trim(),
        leadEmail,
        candidatureId: intakeResult.candidatureId,
      }).catch(() => console.error('[INTAKE] Application email failed'))
    }
  }

  return intakeResult
}

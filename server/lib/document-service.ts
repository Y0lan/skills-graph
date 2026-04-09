import crypto from 'crypto'
import { getDb } from './db.js'
import { resolveSafePath } from './fs-safety.js'
import { extractAboroText, extractAboroProfile, type AboroProfile } from './aboro-extraction.js'
import { calculateSoftSkillScore } from './soft-skill-scoring.js'
import { calculateGlobalScore } from './compatibility.js'
import { STATUT_LABELS as statusLabels } from './constants.js'
import archiver from 'archiver'
import type { Writable } from 'stream'

// ─── Document upload ─────────────────────────────────────────────────

interface UploadDocumentParams {
  candidatureId: string
  file: { buffer: Buffer; mimetype: string; filename: string }
  docType: string
  userSlug: string
}

interface UploadDocumentResult {
  id: string
  filename: string
  type: string
  aboroProfile: AboroProfile | null
}

export async function uploadDocument(params: UploadDocumentParams): Promise<UploadDocumentResult> {
  const { candidatureId, file, docType, userSlug } = params
  const dataDir = process.env.DATA_DIR || 'server/data'
  const docDir = `${dataDir}/documents/${candidatureId}`

  // Create directory
  const fs = await import('fs')
  fs.mkdirSync(docDir, { recursive: true })

  // Save file
  const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = resolveSafePath(docDir, safeFilename)
  fs.writeFileSync(filePath, file.buffer)

  // Save metadata
  const docId = crypto.randomUUID()
  getDb().prepare(`
    INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(docId, candidatureId, docType, file.filename, filePath, userSlug)

  // Log event
  getDb().prepare(`
    INSERT INTO candidature_events (candidature_id, type, notes, created_by)
    VALUES (?, 'document', ?, ?)
  `).run(candidatureId, `Document uploadé: ${file.filename} (${docType})`, userSlug)

  // Auto-extract Aboro profile if document type is 'aboro'
  let aboroProfile: AboroProfile | null = null
  if (docType === 'aboro') {
    try {
      const pdfText = await extractAboroText(file.buffer)
      const profile = await extractAboroProfile(pdfText)

      // Find the candidate_id from the candidature
      const candidature = getDb().prepare(
        'SELECT candidate_id FROM candidatures WHERE id = ?'
      ).get(candidatureId) as { candidate_id: string } | undefined

      if (candidature) {
        const profileId = crypto.randomUUID()
        getDb().prepare(`
          INSERT OR REPLACE INTO aboro_profiles (id, candidate_id, profile_json, source_document_id, created_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(profileId, candidature.candidate_id, JSON.stringify(profile), docId, userSlug)

        getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, created_by)
          VALUES (?, 'document', ?, ?)
        `).run(candidatureId, `Profil Âboro extrait : 20 traits, ${Object.keys(profile.talent_cloud).length} talents`, userSlug)

        aboroProfile = profile

        // Calculate soft skill score from Aboro profile
        const softResult = calculateSoftSkillScore(profile)

        // Read current compatibility scores from the candidature
        const currentScores = getDb().prepare(
          'SELECT taux_compatibilite_poste, taux_compatibilite_equipe FROM candidatures WHERE id = ?'
        ).get(candidatureId) as { taux_compatibilite_poste: number | null; taux_compatibilite_equipe: number | null } | undefined

        const tauxGlobal = calculateGlobalScore(
          currentScores?.taux_compatibilite_poste ?? null,
          currentScores?.taux_compatibilite_equipe ?? null,
          softResult.score,
        )

        getDb().prepare(
          'UPDATE candidatures SET taux_soft_skills = ?, soft_skill_alerts = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
        ).run(softResult.score, JSON.stringify(softResult.alerts), tauxGlobal, candidatureId)
      }
    } catch (err) {
      console.error('[Aboro extraction] Error:', err)
      // Non-blocking: document is saved even if extraction fails
      getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, notes, created_by)
        VALUES (?, 'document', ?, ?)
      `).run(candidatureId, `Extraction Âboro échouée : ${(err as Error).message}. Saisie manuelle possible.`, userSlug)
    }
  }

  return { id: docId, filename: file.filename, type: docType, aboroProfile }
}

// ─── Document download ───────────────────────────────────────────────

interface DownloadDocumentResult {
  filePath: string
  filename: string
  contentType: string
}

export async function getDocumentForDownload(docId: string): Promise<DownloadDocumentResult | { error: string; status: number }> {
  const doc = getDb().prepare(
    'SELECT filename, path FROM candidature_documents WHERE id = ?'
  ).get(docId) as { filename: string; path: string } | undefined

  if (!doc) {
    return { error: 'Document introuvable', status: 404 }
  }

  const fs = await import('fs')
  const path = await import('path')
  if (!fs.existsSync(doc.path)) {
    return { error: 'Fichier introuvable sur le disque', status: 404 }
  }

  const dataDir = process.env.DATA_DIR || 'server/data'
  const expectedBase = path.resolve(dataDir, 'documents')
  const resolvedPath = path.resolve(doc.path)
  if (!resolvedPath.startsWith(expectedBase + path.sep)) {
    return { error: 'Acces refuse', status: 403 }
  }

  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  }
  const ext = doc.filename.split('.').pop()?.toLowerCase() ?? ''
  const contentType = mimeTypes[ext] ?? 'application/octet-stream'

  return { filePath: resolvedPath, filename: doc.filename, contentType }
}

// ─── ZIP generation ──────────────────────────────────────────────────

interface ZipGenerationResult {
  candidateName: string
  pipe: (output: Writable) => Promise<void>
}

export async function generateCandidatureZip(candidatureId: string): Promise<ZipGenerationResult | { error: string; status: number }> {
  const candidature = getDb().prepare(`
    SELECT c.id, c.statut, c.canal, c.taux_compatibilite_poste, c.taux_compatibilite_equipe,
      cand.name, cand.email, cand.telephone, cand.pays,
      p.titre AS poste_titre, p.pole AS poste_pole
    FROM candidatures c
    JOIN candidates cand ON cand.id = c.candidate_id
    JOIN postes p ON p.id = c.poste_id
    WHERE c.id = ?
  `).get(candidatureId) as Record<string, unknown> | undefined

  if (!candidature) {
    return { error: 'Candidature introuvable', status: 404 }
  }

  const docs = getDb().prepare(
    'SELECT id, type, filename, path FROM candidature_documents WHERE candidature_id = ? ORDER BY created_at ASC'
  ).all(candidatureId) as { id: string; type: string; filename: string; path: string }[]

  const events = getDb().prepare(
    'SELECT type, statut_from, statut_to, notes, created_by, created_at FROM candidature_events WHERE candidature_id = ? ORDER BY created_at ASC'
  ).all(candidatureId) as { type: string; statut_from: string | null; statut_to: string | null; notes: string | null; created_by: string; created_at: string }[]

  const fs = await import('fs')
  const sanitized = (candidature.name as string).replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_')
  const candidateName = sanitized || 'Candidat'

  async function pipe(output: Writable): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', (err) => {
      console.error('[ZIP] Archive error:', err)
    })
    archive.pipe(output)

    // Add documents with numbered prefixes
    let idx = 1
    for (const doc of docs) {
      if (fs.existsSync(doc.path)) {
        const ext = doc.filename.split('.').pop() ?? 'pdf'
        const prefix = String(idx).padStart(2, '0')
        const safeType = doc.type.replace(/[^a-zA-Z0-9_-]/g, '_')
        const typeName = safeType === 'other' ? 'Document' : safeType.charAt(0).toUpperCase() + safeType.slice(1)
        archive.file(doc.path, { name: `${prefix}_${typeName}_${candidateName}.${ext}` })
        idx++
      }
    }

    // Add resume.txt
    let resume = `DOSSIER CANDIDAT — ${candidature.name}\n`
    resume += `${'='.repeat(50)}\n\n`
    resume += `Poste : ${candidature.poste_titre}\n`
    resume += `Pôle : ${candidature.poste_pole}\n`
    resume += `Statut : ${statusLabels[candidature.statut as string] ?? candidature.statut}\n`
    resume += `Canal : ${candidature.canal}\n`
    resume += `Email : ${candidature.email ?? '—'}\n`
    resume += `Téléphone : ${candidature.telephone ?? '—'}\n`
    resume += `Pays : ${candidature.pays ?? '—'}\n`
    resume += `\nCompatibilité poste : ${candidature.taux_compatibilite_poste ?? '—'}%\n`
    resume += `Compatibilité équipe : ${candidature.taux_compatibilite_equipe ?? '—'}%\n`
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
      resume += `• ${doc.type}: ${doc.filename}\n`
    }
    resume += `\n---\nGénéré par Skill Radar — GIE SINAPSE\n`

    archive.append(resume, { name: `_resume.txt` })
    await archive.finalize()
  }

  return { candidateName, pipe }
}

import crypto from 'crypto'
import { getDb } from './db.js'
import { extractAboroText, extractAboroProfile, type AboroProfile } from './aboro-extraction.js'
import { calculateSoftSkillScore } from './soft-skill-scoring.js'
import { calculateGlobalScore } from './compatibility.js'
import { STATUT_LABELS as statusLabels } from './constants.js'
import { scanDocument } from './document-scanner.js'
import { uploadToGcs, downloadFromGcs, isGcsPath } from './gcs.js'
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

  // Save file to GCS
  const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const uniqueFilename = `${crypto.randomUUID().slice(0, 8)}-${safeFilename}`
  const storedPath = await uploadToGcs(
    candidatureId,
    uniqueFilename,
    file.buffer,
    file.mimetype,
    file.filename,
  )

  // Save metadata (path is now gs://bucket/prefix/candidatureId/filename)
  const docId = crypto.randomUUID()
  getDb().prepare(`
    INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(docId, candidatureId, docType, file.filename, storedPath, userSlug)

  // Log event
  getDb().prepare(`
    INSERT INTO candidature_events (candidature_id, type, notes, created_by)
    VALUES (?, 'document', ?, ?)
  `).run(candidatureId, `Document uploadé: ${file.filename} (${docType})`, userSlug)

  // Trigger async malware scan (non-blocking)
  triggerDocumentScan(docId, storedPath, file.filename).catch(err =>
    console.error('[SCAN] Background scan failed:', err)
  )

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

        // Calculate soft skill score once from the Aboro profile.
        const softResult = calculateSoftSkillScore(profile)

        // Apply the score to EVERY candidature of this candidate, not just the
        // one whose document triggered the extraction. Aboro is per-person, so
        // a candidate applying to multiple postes gets the same soft score on
        // each — recompute taux_global per candidature using its own poste/équipe.
        const candidatureRows = getDb().prepare(
          'SELECT id, taux_compatibilite_poste, taux_compatibilite_equipe FROM candidatures WHERE candidate_id = ?'
        ).all(candidature.candidate_id) as { id: string; taux_compatibilite_poste: number | null; taux_compatibilite_equipe: number | null }[]

        const updateOne = getDb().prepare(
          'UPDATE candidatures SET taux_soft_skills = ?, soft_skill_alerts = ?, taux_global = ?, updated_at = datetime(\'now\') WHERE id = ?'
        )
        for (const c of candidatureRows) {
          const tauxGlobal = calculateGlobalScore(c.taux_compatibilite_poste, c.taux_compatibilite_equipe, softResult.score)
          updateOne.run(softResult.score, JSON.stringify(softResult.alerts), tauxGlobal, c.id)
        }
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

interface DownloadDocumentResultLocal {
  kind: 'local'
  filePath: string
  filename: string
  contentType: string
}

interface DownloadDocumentResultGcs {
  kind: 'gcs'
  buffer: Buffer
  filename: string
  contentType: string
}

export type DownloadDocumentResult = DownloadDocumentResultLocal | DownloadDocumentResultGcs

export async function getDocumentForDownload(docId: string): Promise<DownloadDocumentResult | { error: string; status: number }> {
  const doc = getDb().prepare(
    'SELECT filename, display_filename, path FROM candidature_documents WHERE id = ? AND deleted_at IS NULL'
  ).get(docId) as { filename: string; display_filename: string | null; path: string } | undefined

  if (!doc) {
    return { error: 'Document introuvable', status: 404 }
  }

  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  }
  // MIME comes from ORIGINAL filename — display_filename is a label, not a contract on file format.
  const ext = doc.filename.split('.').pop()?.toLowerCase() ?? ''
  const contentType = mimeTypes[ext] ?? 'application/octet-stream'
  const userFacingName = doc.display_filename ?? doc.filename

  // GCS path (new) — download from cloud storage
  if (isGcsPath(doc.path)) {
    try {
      const buffer = await downloadFromGcs(doc.path)
      return { kind: 'gcs', buffer, filename: userFacingName, contentType }
    } catch (err) {
      console.error(`[DOWNLOAD] GCS download failed for doc ${docId}:`, err)
      return { error: 'Fichier introuvable dans le stockage cloud', status: 404 }
    }
  }

  // Legacy local path — backward compatibility
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

  return { kind: 'local', filePath: resolvedPath, filename: userFacingName, contentType }
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
    'SELECT id, type, filename, display_filename, path FROM candidature_documents WHERE candidature_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
  ).all(candidatureId) as { id: string; type: string; filename: string; display_filename: string | null; path: string }[]

  const events = getDb().prepare(
    'SELECT type, statut_from, statut_to, notes, created_by, created_at FROM candidature_events WHERE candidature_id = ? ORDER BY created_at ASC'
  ).all(candidatureId) as { type: string; statut_from: string | null; statut_to: string | null; notes: string | null; created_by: string; created_at: string }[]

  const fs = await import('fs')
  // candidature is guaranteed non-undefined after the early return above
  const cand = candidature!
  const sanitized = (cand.name as string).replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_')
  const candidateName = sanitized || 'Candidat'

  async function pipe(output: Writable): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', (err) => {
      console.error('[ZIP] Archive error:', err)
    })
    archive.pipe(output)

    // Add documents with numbered prefixes. If the user has renamed a document
    // (display_filename), honour their choice; otherwise use the design's
    // canonical "Type_Candidate.ext" convention.
    let idx = 1
    for (const doc of docs) {
      const ext = doc.filename.split('.').pop() ?? 'pdf'
      const prefix = String(idx).padStart(2, '0')
      const safeType = doc.type.replace(/[^a-zA-Z0-9_-]/g, '_')
      const typeName = safeType === 'other' ? 'Document' : safeType.charAt(0).toUpperCase() + safeType.slice(1)
      const baseName = doc.display_filename
        ? doc.display_filename.replace(/[\\/]/g, '_').trim()
        : `${typeName}_${candidateName}.${ext}`
      const archiveName = `${prefix}_${baseName}`

      if (isGcsPath(doc.path)) {
        try {
          const buffer = await downloadFromGcs(doc.path)
          archive.append(buffer, { name: archiveName })
          idx++
        } catch (err) {
          console.warn(`[ZIP] Skipping GCS doc ${doc.id} — download failed:`, err)
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

    archive.append(resume, { name: `_resume.txt` })
    await archive.finalize()
  }

  return { candidateName, pipe }
}

// ─── Async malware scan ─────────────────────────────────────────────

async function triggerDocumentScan(docId: string, storedPath: string, filename: string): Promise<void> {
  let tempPath: string | null = null
  try {
    // For GCS paths, download to a temp file for scanning
    let scanPath: string
    if (isGcsPath(storedPath)) {
      const { downloadToTempFile } = await import('./gcs.js')
      tempPath = await downloadToTempFile(storedPath)
      scanPath = tempPath
    } else {
      scanPath = storedPath
    }

    const result = await scanDocument(scanPath, filename)

    const scanStatus = result.engines.length === 0
      ? 'skipped'
      : result.safe ? 'clean' : 'infected'

    getDb().prepare(
      'UPDATE candidature_documents SET scan_status = ?, scan_result = ?, scanned_at = ? WHERE id = ?'
    ).run(scanStatus, JSON.stringify(result), result.scannedAt, docId)

    // Item 8: publish to the event bus so any open SSE stream on the
    // candidature page refreshes the badge without a manual reload.
    try {
      const ctx = getDb().prepare(
        'SELECT candidature_id FROM candidature_documents WHERE id = ?'
      ).get(docId) as { candidature_id: string } | undefined
      if (ctx) {
        const { recruitmentBus } = await import('./event-bus.js')
        recruitmentBus.publish('document_scan_updated', {
          candidatureId: ctx.candidature_id,
          documentId: docId,
          scanStatus: scanStatus as 'clean' | 'infected' | 'skipped',
          filename,
        })
      }
    } catch (err) {
      console.warn('[SCAN] event publish failed', err)
    }

    if (!result.safe) {
      console.error(`[SCAN] Document ${docId} (${filename}) is INFECTED — threats: ${result.threats.join(', ')}`)
      // NOTE: File is kept for forensic review, but marked as infected in DB
    } else if (scanStatus === 'skipped') {
      console.warn(`[SCAN] Document ${docId} (${filename}) — scan skipped (no engines available)`)
    } else {
      console.log(`[SCAN] Document ${docId} (${filename}) — clean (${result.engines.join(', ')})`)
    }
  } catch (err) {
    // Mark as error — scan itself failed
    getDb().prepare(
      "UPDATE candidature_documents SET scan_status = 'error', scan_result = ?, scanned_at = ? WHERE id = ?"
    ).run(JSON.stringify({ error: (err as Error).message }), new Date().toISOString(), docId)
    console.error(`[SCAN] Document ${docId} scan error:`, err)
    // Publish error so UI can show it without reload too.
    try {
      const ctx = getDb().prepare(
        'SELECT candidature_id FROM candidature_documents WHERE id = ?'
      ).get(docId) as { candidature_id: string } | undefined
      if (ctx) {
        const { recruitmentBus } = await import('./event-bus.js')
        recruitmentBus.publish('document_scan_updated', {
          candidatureId: ctx.candidature_id,
          documentId: docId,
          scanStatus: 'error',
          filename,
        })
      }
    } catch { /* */ }
  } finally {
    // Clean up temp file
    if (tempPath) {
      try {
        const fs = await import('fs')
        fs.unlinkSync(tempPath)
      } catch { /* ignore cleanup errors */ }
    }
  }
}

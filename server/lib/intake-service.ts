import crypto from 'crypto';
import { getDb } from './db.js';
import { processCvForCandidate } from './cv-pipeline.js';
import { rescoreCandidature } from './scoring-helpers.js';
import { uploadDocument } from './document-service.js';
import { sendApplicationReceived } from './email.js';
import { DEFAULT_LEAD_SLUG } from '../middleware/require-lead.js';
import { type PosteRow } from './types.js';
import { hashIntakePayload, normalizeSubmissionUuid } from './intake-canonical.js';
// ─── Process intake ──────────────────────────────────────────────────
interface IntakeFields {
    nom: string;
    prenom?: string;
    email: string;
    telephone?: string;
    pays?: string;
    poste_vise: string;
    linkedin?: string;
    github?: string;
    message?: string;
    canal?: string;
    /** Drupal Webform submission UUID — idempotency key. When present and
     *  already seen, processIntake returns the existing candidature without
     *  side effects (no new row, no email, no doc upload). Sent by the
     *  Drupal queue worker so retries after a radar outage don't duplicate. */
    submission_uuid?: string;
    submission_id?: string;
}
interface IntakeResult {
    ok: true;
    candidatureId: string;
    candidateId?: string;
    updated: boolean;
    /** True when the call was a no-op replay of a prior successful intake. */
    duplicate?: boolean;
}
interface IntakeError {
    error: string;
    status: number;
}
export async function processIntake(fields: IntakeFields, cvFile: {
    buffer: Buffer;
    mimetype: string;
    originalname?: string;
} | null, lettreFile: {
    buffer: Buffer;
    mimetype: string;
    originalname?: string;
} | null): Promise<IntakeResult | IntakeError> {
    const { nom, prenom, email, telephone, pays, poste_vise, linkedin, github, message, canal } = fields;
    if (!nom || !email || !poste_vise) {
        return { error: 'nom, email, et poste_vise sont requis', status: 400 };
    }
    let submissionUuid: string | null;
    try {
        submissionUuid = normalizeSubmissionUuid(fields as unknown as Record<string, unknown>);
    }
    catch {
        return { error: 'submission_uuid et submission_id ne correspondent pas', status: 400 };
    }
    const payloadSha256 = hashIntakePayload(fields as unknown as Record<string, unknown>, [
        ...(cvFile ? [{ field: 'cv', buffer: cvFile.buffer, mimetype: cvFile.mimetype }] : []),
        ...(lettreFile ? [{ field: 'lettre', buffer: lettreFile.buffer, mimetype: lettreFile.mimetype }] : []),
    ]);
    // Idempotency fast-path: if Drupal already delivered this submission,
    // return the existing candidature without acquiring any write locks. The
    // authoritative check happens inside the transaction below — this fast
    // path is just a performance win for the common case.
    if (submissionUuid) {
        const prior = await getDb().prepare('SELECT id, candidate_id, payload_sha256 FROM candidatures WHERE submission_uuid = ? LIMIT 1').get(submissionUuid) as {
            id: string;
            candidate_id: string;
            payload_sha256: string | null;
        } | undefined;
        if (prior) {
            if (prior.payload_sha256 && prior.payload_sha256 !== payloadSha256) {
                console.error('[INTAKE][hash-conflict]', {
                    submissionUuid,
                    candidatureId: prior.id,
                    expected: prior.payload_sha256,
                    actual: payloadSha256,
                });
                return { error: 'hash mismatch', status: 409 };
            }
            if (!prior.payload_sha256) {
                await getDb().prepare('UPDATE candidatures SET payload_sha256 = ? WHERE id = ? AND payload_sha256 IS NULL').run(payloadSha256, prior.id);
            }
            console.log(`[INTAKE][idempotent] submissionUuid=${submissionUuid} existing candidatureId=${prior.id}`);
            return { ok: true, candidatureId: prior.id, candidateId: prior.candidate_id, updated: true, duplicate: true };
        }
    }
    // Validate poste exists
    const poste = await getDb().prepare('SELECT * FROM postes WHERE id = ?').get(poste_vise) as PosteRow | undefined;
    if (!poste) {
        return { error: `Poste invalide: ${poste_vise}`, status: 400 };
    }
    const fullName = prenom ? `${prenom.trim()} ${nom.trim()}` : nom.trim();
    const candidateId = crypto.randomUUID();
    const candidatureId = crypto.randomUUID();
    const VALID_CANALS = ['cabinet', 'site', 'candidature_directe', 'reseau'];
    const resolvedCanal = canal?.trim() || 'site';
    if (!VALID_CANALS.includes(resolvedCanal)) {
        return { error: `Canal invalide: ${resolvedCanal}. Valeurs acceptées: ${VALID_CANALS.join(', ')}`, status: 400 };
    }
    // Atomic creation: dedup-by-email + idempotence check + candidate (or reuse) + candidature + event
    // in one transaction. Prevents both duplicate candidates (same email applies to multiple postes)
    // and duplicate candidatures (parallel webhook redelivery on the same poste).
    const runTransaction = getDb().transaction(async (): Promise<IntakeResult | IntakeError> => {
        if (submissionUuid) {
            await getDb().prepare('SELECT pg_advisory_xact_lock(hashtext(?))').run(`intake:submission:${submissionUuid}`);
            const existingSubmission = await getDb().prepare('SELECT id, candidate_id, payload_sha256 FROM candidatures WHERE submission_uuid = ? LIMIT 1').get(submissionUuid) as {
                id: string;
                candidate_id: string;
                payload_sha256: string | null;
            } | undefined;
            if (existingSubmission) {
                if (existingSubmission.payload_sha256 && existingSubmission.payload_sha256 !== payloadSha256) {
                    console.error('[INTAKE][hash-conflict]', {
                        submissionUuid,
                        candidatureId: existingSubmission.id,
                        expected: existingSubmission.payload_sha256,
                        actual: payloadSha256,
                    });
                    return { error: 'hash mismatch', status: 409 };
                }
                if (!existingSubmission.payload_sha256) {
                    await getDb().prepare('UPDATE candidatures SET payload_sha256 = ? WHERE id = ? AND payload_sha256 IS NULL').run(payloadSha256, existingSubmission.id);
                }
                return { ok: true, candidatureId: existingSubmission.id, candidateId: existingSubmission.candidate_id, updated: true, duplicate: true };
            }
        }
        await getDb().prepare('SELECT pg_advisory_xact_lock(hashtext(?))').run(`intake:email:${email.trim().toLowerCase()}`);
        // 1. Find existing candidate by email (case-insensitive). One person = one candidate.
        const existingCandidate = await getDb().prepare('SELECT id FROM candidates WHERE LOWER(email) = LOWER(?) ORDER BY created_at ASC LIMIT 1').get(email.trim()) as {
            id: string;
        } | undefined;
        if (existingCandidate) {
            // 2a. Candidate exists. Did they already apply to this poste? → idempotent return.
            const existingCandidature = await getDb().prepare('SELECT id, submission_uuid, payload_sha256 FROM candidatures WHERE candidate_id = ? AND poste_id = ?').get(existingCandidate.id, poste_vise) as {
                id: string;
                submission_uuid: string | null;
                payload_sha256: string | null;
            } | undefined;
            if (existingCandidature) {
                if (submissionUuid && existingCandidature.submission_uuid && existingCandidature.submission_uuid !== submissionUuid) {
                    return { error: 'candidate already applied to this poste with another submission_uuid', status: 409 };
                }
                if (submissionUuid && existingCandidature.payload_sha256 && existingCandidature.payload_sha256 !== payloadSha256) {
                    console.error('[INTAKE][hash-conflict]', {
                        submissionUuid,
                        candidatureId: existingCandidature.id,
                        expected: existingCandidature.payload_sha256,
                        actual: payloadSha256,
                    });
                    return { error: 'hash mismatch', status: 409 };
                }
                if (submissionUuid) {
                    await getDb().prepare(`
            UPDATE candidatures
               SET submission_uuid = COALESCE(submission_uuid, ?),
                   payload_sha256 = COALESCE(payload_sha256, ?)
             WHERE id = ?
          `).run(submissionUuid, payloadSha256, existingCandidature.id);
                }
                return { ok: true, candidatureId: existingCandidature.id, candidateId: existingCandidate.id, updated: true, duplicate: !!submissionUuid };
            }
            // 2b. Candidate exists, new poste — refresh contact fields (last-write-wins on
            // optional metadata, never on email or name to avoid identity collisions) and
            // attach a NEW candidature.
            await getDb().prepare(`
        UPDATE candidates SET
          telephone = COALESCE(?, telephone),
          pays = COALESCE(?, pays),
          linkedin_url = COALESCE(?, linkedin_url),
          github_url = COALESCE(?, github_url)
        WHERE id = ?
      `).run(telephone?.trim() || null, pays?.trim() || null, linkedin?.trim() || null, github?.trim() || null, existingCandidate.id);
            await getDb().prepare(`
        INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal, submission_uuid, payload_sha256)
        VALUES (?, ?, ?, 'postule', ?, ?, ?)
      `).run(candidatureId, existingCandidate.id, poste_vise, resolvedCanal, submissionUuid, payloadSha256);
            await getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, statut_to, stage, notes, created_by)
        VALUES (?, 'status_change', 'postule', 'postule', ?, 'drupal-webhook')
      `).run(candidatureId, message?.trim() || null);
            return { ok: true, candidatureId, candidateId: existingCandidate.id, updated: false };
        }
        // 3. New candidate, new candidature.
        await getDb().prepare(`
      INSERT INTO candidates (id, name, role, role_id, email, created_by, telephone, pays, linkedin_url, github_url, canal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(candidateId, fullName, poste.titre, poste.role_id, email.trim(), 'drupal-webhook', telephone?.trim() || null, pays?.trim() || null, linkedin?.trim() || null, github?.trim() || null, resolvedCanal);
        await getDb().prepare(`
      INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal, submission_uuid, payload_sha256)
      VALUES (?, ?, ?, 'postule', ?, ?, ?)
    `).run(candidatureId, candidateId, poste_vise, resolvedCanal, submissionUuid, payloadSha256);
        await getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, statut_to, notes, created_by)
      VALUES (?, 'status_change', 'postule', ?, 'drupal-webhook')
    `).run(candidatureId, message?.trim() || null);
        return { ok: true, candidatureId, candidateId, updated: false };
    });
    const intakeResult = await runTransaction();
    if ('error' in intakeResult) {
        return intakeResult;
    }
    if (intakeResult.updated) {
        // Redelivered webhook — retry any missing side effects
        const cid = intakeResult.candidatureId;
        const existingCandidate = await getDb().prepare('SELECT candidate_id FROM candidatures WHERE id = ?').get(cid) as {
            candidate_id: string;
        } | undefined;
        if (existingCandidate) {
            const candId = existingCandidate.candidate_id;
            // Retry candidate notes if blank
            if (message?.trim()) {
                const current = await getDb().prepare('SELECT notes FROM candidates WHERE id = ?').get(candId) as {
                    notes: string | null;
                } | undefined;
                if (!current?.notes) {
                    await getDb().prepare('UPDATE candidates SET notes = ? WHERE id = ?').run(message.trim(), candId);
                }
            }
            // Retry CV upload if missing
            if (cvFile) {
                const cvExists = await getDb().prepare("SELECT COUNT(*) as c FROM candidature_documents WHERE candidature_id = ? AND type = 'cv'").get(cid) as {
                    c: number;
                };
                if (cvExists.c === 0) {
                    try {
                        await uploadDocument({
                            candidatureId: cid,
                            file: { buffer: cvFile.buffer, mimetype: cvFile.mimetype, filename: cvFile.originalname || 'cv.pdf' },
                            docType: 'cv',
                            userSlug: 'drupal-webhook',
                        });
                    }
                    catch {
                        console.error('[INTAKE_RETRY] CV file save failed');
                    }
                }
            }
            // Retry lettre upload if missing
            if (lettreFile) {
                const lettreExists = await getDb().prepare("SELECT COUNT(*) as c FROM candidature_documents WHERE candidature_id = ? AND type = 'lettre'").get(cid) as {
                    c: number;
                };
                if (lettreExists.c === 0) {
                    try {
                        await uploadDocument({
                            candidatureId: cid,
                            file: { buffer: lettreFile.buffer, mimetype: lettreFile.mimetype, filename: lettreFile.originalname || 'lettre.pdf' },
                            docType: 'lettre',
                            userSlug: 'drupal-webhook',
                        });
                    }
                    catch {
                        console.error('[INTAKE_RETRY] Lettre file save failed');
                    }
                }
            }
            // Retry CV extraction if missing — route through the shared pipeline
            // so state machine + scoring stay consistent with the direct-upload path.
            if (cvFile) {
                const candidate = await getDb().prepare('SELECT cv_text FROM candidates WHERE id = ?').get(candId) as {
                    cv_text: string | null;
                } | undefined;
                if (!candidate?.cv_text) {
                    try {
                        await processCvForCandidate(candId, cvFile.buffer, { source: 'drupal' });
                    }
                    catch (err) {
                        console.error('[INTAKE_RETRY] CV processing failed', err);
                    }
                }
            }
            // Do NOT retry confirmation email (risk of delayed duplicate)
        }
        return intakeResult;
    }
    // CRITICAL: use the resolved candidate id from the transaction, NOT the
    // freshly-generated `candidateId` variable. When intake reused an existing
    // candidate (multi-poste case), the freshly-generated id was never inserted —
    // any UPDATE on it silently affects 0 rows and we'd lose CV / notes / AI.
    const resolvedCandidateId = intakeResult.candidateId ?? candidateId;
    // Initial scoring: if the candidate already has ai_suggestions from a
    // prior CV upload (multi-poste case), this gives the new candidature
    // meaningful scores immediately. If not (brand-new candidate), this
    // writes zeros — processCvForCandidate below will rescore with real
    // data once extraction completes. Idempotent either way.
    try {
        await rescoreCandidature(intakeResult.candidatureId);
    }
    catch (err) {
        console.error('[INTAKE] initial rescore failed (non-fatal):', err);
    }
    // Save message as candidate notes (visible in detail page) — non-destructive:
    // append rather than overwrite so multi-poste candidates accumulate context.
    if (message?.trim()) {
        const existing = await getDb().prepare('SELECT notes FROM candidates WHERE id = ?').get(resolvedCandidateId) as {
            notes: string | null;
        } | undefined;
        const merged = existing?.notes
            ? `${existing.notes}\n\n--- ${poste.titre} ---\n${message.trim()}`
            : message.trim();
        await getDb().prepare('UPDATE candidates SET notes = ? WHERE id = ?').run(merged, resolvedCandidateId);
    }
    // Save CV file as downloadable document
    if (cvFile) {
        try {
            await uploadDocument({
                candidatureId: intakeResult.candidatureId,
                file: { buffer: cvFile.buffer, mimetype: cvFile.mimetype, filename: cvFile.originalname || 'cv.pdf' },
                docType: 'cv',
                userSlug: 'drupal-webhook',
            });
        }
        catch {
            console.error('[INTAKE] CV file save failed');
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
            });
        }
        catch {
            console.error('[INTAKE] Lettre file save failed');
        }
    }
    // Process CV for AI skill extraction (outside transaction — external API call).
    // Route through the shared pipeline so extraction state machine + per-candidature
    // scoring are identical across direct-upload and Drupal intake paths.
    if (cvFile) {
        try {
            await processCvForCandidate(resolvedCandidateId, cvFile.buffer, { source: 'drupal' });
        }
        catch (err) {
            console.error('[INTAKE] CV processing failed', err);
        }
    }
    // Send application received emails (candidate + default lead)
    if (email?.trim()) {
        const leadEmail = `${DEFAULT_LEAD_SLUG.replaceAll('-', '.')}@sinapse.nc`;
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
            }).catch(() => console.error('[INTAKE] Application email failed'));
        }
    }
    return intakeResult;
}

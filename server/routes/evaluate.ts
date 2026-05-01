import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDb, getCategoriesForCandidate, getCategoryIdsByPole } from '../lib/db.js';
import { sendCandidateSubmitted } from '../lib/email.js';
import { validateRatings } from '../lib/validation.js';
import { getUser, type CandidateRow } from '../lib/types.js';
import { rescoreCandidature } from '../lib/scoring-helpers.js';
import { requireLead } from '../middleware/require-lead.js';
import { recruitmentBus } from '../lib/event-bus.js';
import { resolveAppPublicOrigin } from '../lib/public-origin.js';
export const evaluateRouter = Router();
// Rate limit: 30 requests per minute per IP on all public endpoints
const publicRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
});
evaluateRouter.use(publicRateLimit);
// Shared guard: check candidate exists, not expired, not submitted
async function getCandidateGuard(id: string, res: import('express').Response, opts?: {
    allowSubmitted?: boolean;
}) {
    const row = await getDb()
        .prepare('SELECT id, name, role, role_id, created_by, expires_at, submitted_at, ratings, ai_suggestions, version FROM candidates WHERE id = ?')
        .get(id) as CandidateRow | undefined;
    if (!row) {
        res.status(404).json({ error: 'Lien invalide' });
        return null;
    }
    if (new Date(row.expires_at) < new Date()) {
        res.status(410).json({ error: 'Ce lien a expiré. Contactez votre recruteur.', expired: true });
        return null;
    }
    if (!opts?.allowSubmitted && row.submitted_at) {
        res.status(409).json({ error: 'Évaluation déjà soumise' });
        return null;
    }
    return row;
}
// validateRatings imported from server/lib/validation.ts
// Get candidate form data (public — no ratings, no report)
evaluateRouter.get('/:id/form', async (req, res) => {
    const row = await getCandidateGuard(req.params.id, res, { allowSubmitted: true });
    if (!row)
        return;
    // Union of category IDs across all postes this candidate has applied to.
    // Empty array means "show ALL categories" (free candidature without a role).
    const candidateCategories = await getCategoriesForCandidate(row.id);
    const candidatureRows = await getDb().prepare(`
    SELECT p.titre AS poste_titre
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    WHERE c.candidate_id = ?
    ORDER BY c.created_at ASC
  `).all(row.id) as {
        poste_titre: string;
    }[];
    res.json({
        id: row.id,
        name: row.name,
        role: row.role,
        posteTitres: candidatureRows.map(r => r.poste_titre),
        submitted: !!row.submitted_at,
        roleCategories: candidateCategories.length > 0 ? candidateCategories : null,
        cvDerivedCategories: [],
        categoryIdsByPole: await getCategoryIdsByPole(),
        version: row.version,
    });
});
// Save candidate ratings (public — autosave)
evaluateRouter.put('/:id/ratings', async (req, res) => {
    const row = await getCandidateGuard(req.params.id, res);
    if (!row)
        return;
    const { ratings, experience, skippedCategories, version } = req.body;
    const ratingsError = validateRatings(ratings);
    if (ratingsError) {
        res.status(400).json({ error: ratingsError });
        return;
    }
    const result = await getDb().prepare(`UPDATE candidates SET ratings = ?, experience = ?, skipped_categories = ?, version = version + 1
     WHERE id = ? AND submitted_at IS NULL${version !== undefined ? ' AND version = ?' : ''}`).run(JSON.stringify(ratings), JSON.stringify(experience ?? {}), JSON.stringify(Array.isArray(skippedCategories) ? skippedCategories : []), req.params.id, ...(version !== undefined ? [version] : []));
    if (result.changes === 0) {
        res.status(409).json({ error: 'Version obsolète ou évaluation déjà soumise' });
        return;
    }
    const updated = await getDb().prepare('SELECT version FROM candidates WHERE id = ?').get(req.params.id) as {
        version: number;
    };
    res.json({ ok: true, version: updated.version });
});
// Submit candidate evaluation (public — one-time, atomic with final ratings)
evaluateRouter.post('/:id/submit', async (req, res) => {
    const row = await getCandidateGuard(req.params.id, res);
    if (!row)
        return; // checks: exists, not expired, not already submitted
    // Accept optional final ratings payload to prevent autosave race
    const { ratings, experience, skippedCategories } = req.body ?? {};
    // Validate ratings if provided (same validation as PUT /ratings)
    if (ratings) {
        const ratingsError = validateRatings(ratings);
        if (ratingsError) {
            res.status(400).json({ error: ratingsError });
            return;
        }
    }
    const now = new Date().toISOString();
    const db = getDb();
    // Atomic: save final ratings + set submitted_at in one transaction
    const submitTransaction = db.transaction(async () => {
        if (ratings && typeof ratings === 'object' && !Array.isArray(ratings)) {
            await db.prepare('UPDATE candidates SET ratings = ?, experience = ?, skipped_categories = ?, version = version + 1 WHERE id = ?').run(JSON.stringify(ratings), JSON.stringify(experience ?? {}), JSON.stringify(Array.isArray(skippedCategories) ? skippedCategories : []), req.params.id);
        }
        const submitResult = await db.prepare('UPDATE candidates SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL').run(now, req.params.id);
        if (submitResult.changes === 0) {
            throw new Error('ALREADY_SUBMITTED');
        }
    });
    try {
        await submitTransaction();
    }
    catch (err) {
        if (err instanceof Error && err.message === 'ALREADY_SUBMITTED') {
            res.status(409).json({ error: 'Évaluation déjà soumise' });
            return;
        }
        throw err;
    }
    // Rescore every linked candidature via the shared helper. Same 3-way
    // merge (ai + role_aware + manual) everywhere — no more pill/modal drift.
    const linkedCandidatures = await db.prepare(`
    SELECT id FROM candidatures WHERE candidate_id = ?
  `).all(req.params.id) as {
        id: string;
    }[];
    for (const cand of linkedCandidatures) {
        await rescoreCandidature(cand.id);
        // Auto-advance to skill_radar_complete if currently at skill_radar_envoye.
        // CAS UPDATE + audit event insert are wrapped together so we can never
        // land in a state where candidatures.statut advanced but the
        // candidature_events trail is missing its status_change row — that would
        // leave revert unable to roll back, and break the per-stage history. The
        // SSE publish is moved OUT of the transaction (publishing is a side
        // effect; if it threw, the tx would roll back and the status advance
        // would be lost).
        let advanced = false;
        await db.transaction(async () => {
            const advanceResult = await db.prepare('UPDATE candidatures SET statut = ?, updated_at = datetime(\'now\') WHERE id = ? AND statut = ?')
                .run('skill_radar_complete', cand.id, 'skill_radar_envoye');
            if (advanceResult.changes > 0) {
                await db.prepare(`
          INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, notes, created_by)
          VALUES (?, 'status_change', 'skill_radar_envoye', 'skill_radar_complete', 'Auto: évaluation soumise par le candidat', 'system')
        `).run(cand.id);
                advanced = true;
            }
        })();
        if (advanced) {
            // Broadcast after the transaction commits so any open SSE stream
            // (recruiter watching the candidate detail page or the pipeline)
            // updates without a manual reload.
            recruitmentBus.publish('status_changed', {
                candidatureId: cand.id,
                statutFrom: 'skill_radar_envoye',
                statutTo: 'skill_radar_complete',
                byUserSlug: 'system',
            });
        }
    }
    // Notify the lead who created this candidate (non-blocking)
    const baseUrl = resolveAppPublicOrigin(req);
    const leadSlug = row.created_by;
    if (leadSlug) {
        const leadEmail = leadSlug.replaceAll('-', '.') + '@sinapse.nc';
        sendCandidateSubmitted({
            to: leadEmail,
            candidateName: row.name,
            role: row.role,
            detailUrl: `${baseUrl}/recruit/${req.params.id}`,
        }).catch(() => { });
    }
    res.json({ ok: true, submittedAt: now });
});
// Reopen a submitted evaluation (lead only)
evaluateRouter.post('/:id/reopen', requireLead, async (req, res) => {
    const db = getDb();
    const candidate = await db.prepare('SELECT id, submitted_at, ratings FROM candidates WHERE id = ?')
        .get(req.params.id) as {
        id: string;
        submitted_at: string | null;
        ratings: string;
    } | undefined;
    if (!candidate) {
        res.status(404).json({ error: 'Candidat introuvable' });
        return;
    }
    if (!candidate.submitted_at) {
        res.status(400).json({ error: 'Évaluation pas encore soumise' });
        return;
    }
    // Snapshot current ratings before reopen
    const user = getUser(req);
    await db.prepare(`INSERT INTO candidature_events (candidature_id, type, notes, created_by)
    SELECT c.id, 'evaluation_reopened', ?, ?
    FROM candidatures c WHERE c.candidate_id = ?`)
        .run(JSON.stringify({ ratings_snapshot: candidate.ratings, reopened_at: new Date().toISOString() }), user.slug ?? 'system', req.params.id);
    await db.prepare('UPDATE candidates SET submitted_at = NULL WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

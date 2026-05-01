import { Router } from 'express';
import { teamMembers } from '../data/team-roster.js';
import { getAllEvaluations, getEvaluation, upsertEvaluation, submitEvaluation, recordSkillChangesOnSubmit, deleteEvaluation, getDb } from '../lib/db.js';
import { generateAndSaveSummary } from '../lib/summary.js';
import { requireAuth, requireOwnership } from '../middleware/require-auth.js';
import { getSkillById } from '../lib/catalog.js';
import { scheduleAllCandidatureScoreRecalculation } from '../lib/scoring-helpers.js';
const VALID_SLUGS = new Set(teamMembers.map(m => m.slug));
export const ratingsRouter = Router();

function scheduleRecruitScoresAfterTeamChange(reason: string): void {
    scheduleAllCandidatureScoreRecalculation(reason);
}
// GET /status — lightweight public endpoint for status dots (no auth required)
// Returns { slug: 'submitted' | 'draft' | 'none' } only, no scores or summaries
ratingsRouter.get('/status', async (_req, res) => {
    const all = await getAllEvaluations();
    const result: Record<string, string> = {};
    for (const [slug, eval_] of Object.entries(all)) {
        if (eval_.submittedAt)
            result[slug] = 'submitted';
        else if (Object.keys(eval_.ratings).length > 0)
            result[slug] = 'draft';
        else
            result[slug] = 'none';
    }
    res.json(result);
});
// GET / — all ratings (requires auth)
ratingsRouter.get('/', async (_req, res) => {
    res.json(await getAllEvaluations());
});
// GET /:slug — single member (public)
ratingsRouter.get('/:slug', async (req, res) => {
    const slug = req.params.slug as string;
    if (!VALID_SLUGS.has(slug)) {
        res.status(404).json({ error: 'Membre introuvable' });
        return;
    }
    const memberData = await getEvaluation(slug);
    if (!memberData) {
        res.json({
            ratings: {},
            experience: {},
            skippedCategories: [],
            submittedAt: null,
        });
        return;
    }
    res.json(memberData);
});
// PUT /:slug — upsert ratings (auth + ownership required)
ratingsRouter.put('/:slug', requireAuth, requireOwnership, async (req, res) => {
    const slug = req.params.slug as string;
    if (!VALID_SLUGS.has(slug)) {
        res.status(404).json({ error: 'Membre introuvable' });
        return;
    }
    const { ratings, experience, skippedCategories, declinedCategories } = req.body;
    // Validate ratings
    if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
        res.status(400).json({ error: 'Évaluations invalides : doit être un objet' });
        return;
    }
    for (const [, value] of Object.entries(ratings)) {
        if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 5) {
            res.status(400).json({ error: 'Évaluations invalides : les valeurs doivent être des entiers entre 0 et 5' });
            return;
        }
    }
    // Validate experience (optional)
    const expObj = experience ?? {};
    if (typeof expObj !== 'object' || Array.isArray(expObj)) {
        res.status(400).json({ error: 'Expérience invalide : doit être un objet' });
        return;
    }
    for (const [, value] of Object.entries(expObj)) {
        if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 4) {
            res.status(400).json({ error: 'Expérience invalide : les valeurs doivent être des entiers entre 0 et 4' });
            return;
        }
    }
    // Validate skippedCategories (optional)
    const skipped = skippedCategories ?? [];
    if (!Array.isArray(skipped)) {
        res.status(400).json({ error: 'Catégories ignorées invalides : doit être un tableau' });
        return;
    }
    // Validate declinedCategories (optional)
    const declined = declinedCategories ?? [];
    if (!Array.isArray(declined)) {
        res.status(400).json({ error: 'Catégories déclinées invalides : doit être un tableau' });
        return;
    }
    const memberData = await upsertEvaluation(slug, ratings, expObj, skipped, declined);
    try {
        await getDb().prepare('DELETE FROM comparison_summaries WHERE slug_a = ? OR slug_b = ?').run(slug, slug);
    }
    catch { /* Table may not exist yet */ }
    scheduleRecruitScoresAfterTeamChange(`team-rating-upsert:${slug}`);
    res.json(memberData);
});
// DELETE /:slug — reset evaluation (auth + ownership required)
ratingsRouter.delete('/:slug', requireAuth, requireOwnership, async (req, res) => {
    const slug = req.params.slug as string;
    if (!VALID_SLUGS.has(slug)) {
        res.status(404).json({ error: 'Membre introuvable' });
        return;
    }
    await deleteEvaluation(slug);
    try {
        await getDb().prepare('DELETE FROM comparison_summaries WHERE slug_a = ? OR slug_b = ?').run(slug, slug);
    }
    catch { /* Table may not exist yet */ }
    scheduleRecruitScoresAfterTeamChange(`team-rating-delete:${slug}`);
    res.json({ ok: true, rescoreScheduled: true });
});
// POST /:slug/submit — finalize evaluation (auth + ownership required)
ratingsRouter.post('/:slug/submit', requireAuth, requireOwnership, async (req, res) => {
    const slug = req.params.slug as string;
    if (!VALID_SLUGS.has(slug)) {
        res.status(404).json({ error: 'Membre introuvable' });
        return;
    }
    const memberData = await getEvaluation(slug);
    if (!memberData || Object.keys(memberData.ratings).length === 0) {
        res.status(400).json({ error: 'Aucune évaluation à soumettre' });
        return;
    }
    await submitEvaluation(slug);
    await recordSkillChangesOnSubmit(slug);
    // Generate LLM summary (≤10s, returns null on failure)
    try {
        await generateAndSaveSummary(slug);
    }
    catch (err) {
        console.error('[SUMMARY] Generation failed during submit:', err);
    }
    // Invalidate cached comparisons involving this slug
    try {
        await getDb().prepare('DELETE FROM comparison_summaries WHERE slug_a = ? OR slug_b = ?').run(slug, slug);
    }
    catch { /* Table may not exist yet */ }
    scheduleRecruitScoresAfterTeamChange(`team-rating-submit:${slug}`);
    // Re-read after potential summary write so response includes profileSummary
    res.json(await getEvaluation(slug));
});
// POST /:slug/generate-summary — generate summary on demand (auth + ownership)
ratingsRouter.post('/:slug/generate-summary', requireAuth, requireOwnership, async (req, res) => {
    const slug = req.params.slug as string;
    if (!VALID_SLUGS.has(slug)) {
        res.status(404).json({ error: 'Membre introuvable' });
        return;
    }
    const memberData = await getEvaluation(slug);
    if (!memberData || !memberData.submittedAt) {
        res.status(400).json({ error: 'Évaluation non soumise' });
        return;
    }
    // Idempotent: return existing summary if already generated
    if (memberData.profileSummary) {
        res.json(memberData);
        return;
    }
    try {
        await generateAndSaveSummary(slug);
    }
    catch (err) {
        console.error('[SUMMARY] Generation failed on demand:', err);
    }
    res.json(await getEvaluation(slug));
});
// POST /:slug/skill-up — update a single skill level (auth + ownership)
ratingsRouter.post('/:slug/skill-up', requireAuth, requireOwnership, async (req, res) => {
    const slug = req.params.slug as string;
    if (!VALID_SLUGS.has(slug)) {
        res.status(404).json({ error: 'Membre introuvable' });
        return;
    }
    const { skillId, newLevel } = req.body;
    // Validate skillId
    if (!skillId || typeof skillId !== 'string') {
        res.status(400).json({ error: 'skillId requis' });
        return;
    }
    if (!getSkillById(skillId)) {
        res.status(400).json({ error: 'Compétence introuvable' });
        return;
    }
    // Validate newLevel
    if (!Number.isInteger(newLevel) || newLevel < 0 || newLevel > 5) {
        res.status(400).json({ error: 'Niveau invalide (0-5)' });
        return;
    }
    // Get current evaluation
    const memberData = await getEvaluation(slug);
    if (!memberData) {
        res.status(404).json({ error: 'Évaluation introuvable' });
        return;
    }
    const oldLevel = memberData.ratings[skillId] ?? 0;
    if (newLevel === oldLevel) {
        res.status(400).json({ error: 'Pas de changement' });
        return;
    }
    // Record change in history
    const db = getDb();
    await db.prepare('INSERT INTO skill_changes (slug, skill_id, old_level, new_level) VALUES (?, ?, ?, ?)').run(slug, skillId, oldLevel, newLevel);
    // Update evaluations.ratings JSON
    const updatedRatings = { ...memberData.ratings, [skillId]: newLevel };
    await db.prepare('UPDATE evaluations SET ratings = ? WHERE slug = ?')
        .run(JSON.stringify(updatedRatings), slug);
    // Invalidate comparison cache
    try {
        await db.prepare('DELETE FROM comparison_summaries WHERE slug_a = ? OR slug_b = ?').run(slug, slug);
    }
    catch { /* Table may not exist yet */ }
    scheduleRecruitScoresAfterTeamChange(`team-skill-up:${slug}`);
    console.log(`[SKILL-UP] ${slug} ${skillId}: ${oldLevel} → ${newLevel}`);
    res.json({ ok: true, oldLevel, newLevel, skillId });
});

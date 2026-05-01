import { getDb } from './db.js';
import { calculatePosteCompatibility, calculateEquipeCompatibility, calculateGlobalScore, } from './compatibility.js';
import { loadEffectiveRatings } from './effective-ratings.js';
// Re-exported so existing callers can keep importing from this module
// during the transition. The canonical home is now ./effective-ratings.
export { loadEffectiveRatings, mergeEffectiveRatings } from './effective-ratings.js';
export type { EffectiveRatings, EffectiveRatingsMode, EffectiveRatingsSources, RawRatingColumns, } from './effective-ratings.js';
/** Load the softSkills score currently stored on this candidature (or
 *  the candidate's first stored value if this candidature doesn't have
 *  its own yet — soft skills are candidate-level, not poste-level). */
async function loadSoftScore(candidatureId: string): Promise<number | null> {
    const own = await getDb().prepare('SELECT taux_soft_skills FROM candidatures WHERE id = ?').get(candidatureId) as {
        taux_soft_skills: number | null;
    } | undefined;
    if (own?.taux_soft_skills != null)
        return own.taux_soft_skills;
    const fallback = await getDb().prepare(`
    SELECT c2.taux_soft_skills
    FROM candidatures c1
    JOIN candidatures c2 ON c2.candidate_id = c1.candidate_id
    WHERE c1.id = ? AND c2.taux_soft_skills IS NOT NULL
    ORDER BY c2.created_at ASC LIMIT 1
  `).get(candidatureId) as {
        taux_soft_skills: number | null;
    } | undefined;
    return fallback?.taux_soft_skills ?? null;
}
/**
 * Recompute the three compat scores + global for one candidature using
 * the merged effective ratings, then UPDATE the row. Idempotent. Safe to
 * call after: CV extraction, form submission, requirements change,
 * manual /recalculate hit, intake of a new candidature.
 *
 * Returns the computed scores so callers that just need the numbers
 * (rather than the side effect) can use this as the single scoring API.
 */
export interface RescoreResult {
    candidatureId: string;
    tauxPoste: number | null;
    tauxEquipe: number | null;
    tauxSoft: number | null;
    tauxGlobal: number | null;
    source: 'rescore';
}
export interface RecalculateAllCandidatureScoresResult {
    reason: string;
    total: number;
    scored: number;
    failed: Array<{ candidatureId: string; error: string }>;
}
let scheduledAllScoresTimer: NodeJS.Timeout | null = null;
const scheduledAllScoresReasons = new Set<string>();
let scheduledAllScoresInFlight = false;

export async function rescoreCandidature(candidatureId: string): Promise<RescoreResult> {
    const row = await getDb().prepare(`
    SELECT c.poste_id, p.role_id
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    WHERE c.id = ?
  `).get(candidatureId) as {
        poste_id: string;
        role_id: string;
    } | undefined;
    if (!row) {
        throw new Error(`[scoring] candidature ${candidatureId} not found`);
    }
    const { ratings } = await loadEffectiveRatings(candidatureId);
    const tauxPoste = await calculatePosteCompatibility(ratings, row.poste_id);
    const tauxEquipe = await calculateEquipeCompatibility(ratings, row.role_id);
    const tauxSoft = await loadSoftScore(candidatureId);
    const tauxGlobal = await calculateGlobalScore(tauxPoste, tauxEquipe, tauxSoft);
    await getDb().prepare(`
    UPDATE candidatures
    SET taux_compatibilite_poste = ?,
        taux_compatibilite_equipe = ?,
        taux_soft_skills = ?,
        taux_global = ?,
        updated_at = now()
    WHERE id = ?
  `).run(tauxPoste, tauxEquipe, tauxSoft, tauxGlobal, candidatureId);
    return {
        candidatureId,
        tauxPoste,
        tauxEquipe,
        tauxSoft,
        tauxGlobal,
        source: 'rescore',
    };
}
/** Rescore every candidature attached to a poste. Used by the requirements
 *  change handler — new weighted requirements → every existing candidature
 *  on that poste has a stale taux_compatibilite_poste. Sync is fine at
 *  current volumes (max ~20 candidatures per poste). */
export async function rescorePoste(posteId: string): Promise<RescoreResult[]> {
    const rows = await getDb().prepare('SELECT id FROM candidatures WHERE poste_id = ?').all(posteId) as {
        id: string;
    }[];
    return Promise.all(rows.map(r => rescoreCandidature(r.id)));
}

async function hasRecruitCandidaturesTable(): Promise<boolean> {
    const row = await getDb().prepare("SELECT to_regclass('candidatures') AS name").get() as {
        name: string | null;
    } | undefined;
    return Boolean(row?.name);
}

/**
 * Recompute all recruit scores that depend on the team baseline.
 * Use after team rating mutations, historical team imports, recruit resets and
 * CV replay. It is intentionally per-row tolerant: one bad candidature is
 * reported without preventing the rest from being refreshed.
 */
export async function recalculateAllCandidatureScores(reason: string): Promise<RecalculateAllCandidatureScoresResult> {
    if (!(await hasRecruitCandidaturesTable())) {
        return { reason, total: 0, scored: 0, failed: [] };
    }
    const rows = await getDb().prepare('SELECT id FROM candidatures ORDER BY created_at ASC, id ASC').all() as {
        id: string;
    }[];
    const failed: RecalculateAllCandidatureScoresResult['failed'] = [];
    let scored = 0;
    for (const row of rows) {
        try {
            await rescoreCandidature(row.id);
            scored += 1;
        }
        catch (err) {
            failed.push({
                candidatureId: row.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    if (rows.length > 0 || failed.length > 0) {
        console.info('[scoring] recalculateAllCandidatureScores', {
            reason,
            total: rows.length,
            scored,
            failed: failed.length,
        });
    }
    return { reason, total: rows.length, scored, failed };
}

function armScheduledAllScoresTimer(delayMs: number): void {
    if (scheduledAllScoresTimer || scheduledAllScoresInFlight)
        return;
    scheduledAllScoresTimer = setTimeout(() => {
        scheduledAllScoresTimer = null;
        void flushScheduledAllScores();
    }, delayMs);
    scheduledAllScoresTimer.unref?.();
}

async function flushScheduledAllScores(): Promise<void> {
    if (scheduledAllScoresInFlight || scheduledAllScoresReasons.size === 0)
        return;
    scheduledAllScoresInFlight = true;
    const reasons = [...scheduledAllScoresReasons];
    scheduledAllScoresReasons.clear();
    try {
        await recalculateAllCandidatureScores(`scheduled:${reasons.join(',')}`);
    }
    catch (err) {
        for (const reason of reasons) {
            scheduledAllScoresReasons.add(reason);
        }
        console.error('[scoring] scheduled recalculateAllCandidatureScores failed:', err);
    }
    finally {
        scheduledAllScoresInFlight = false;
        if (scheduledAllScoresReasons.size > 0) {
            armScheduledAllScoresTimer(500);
        }
    }
}

export function scheduleAllCandidatureScoreRecalculation(reason: string, delayMs = 500): void {
    scheduledAllScoresReasons.add(reason);
    armScheduledAllScoresTimer(delayMs);
}

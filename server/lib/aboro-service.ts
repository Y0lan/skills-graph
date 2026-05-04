import crypto from 'crypto';
import { getDb } from './db.js';
import { calculateSoftSkillScore } from './soft-skill-scoring.js';
import { calculateGlobalScore } from './compatibility.js';
import { safeJsonParse } from './types.js';
import type { AboroProfile } from './aboro-extraction.js';
import type { SoftSkillResult } from './soft-skill-scoring.js';
// ─── Get Aboro profile ───────────────────────────────────────────────
interface GetAboroProfileResult {
    profile: AboroProfile | null;
    createdAt?: string;
    createdBy?: string;
    sourceDocumentId?: string | null;
    sourceDocumentName?: string | null;
    source: 'pdf' | 'manual' | null;
    softSkillScore?: number;
    softSkillAlerts?: SoftSkillResult['alerts'];
}
export async function getAboroProfile(candidateId: string): Promise<GetAboroProfileResult> {
    const row = await getDb().prepare(`
    SELECT ap.profile_json, ap.created_at, ap.created_by, ap.source_document_id,
           cd.filename AS source_filename, cd.display_filename AS source_display_filename
    FROM aboro_profiles ap
    LEFT JOIN candidature_documents cd ON cd.id = ap.source_document_id
    WHERE ap.candidate_id = ?
    ORDER BY ap.created_at DESC LIMIT 1
  `).get(candidateId) as {
        profile_json: string;
        created_at: string;
        created_by: string;
        source_document_id: string | null;
        source_filename: string | null;
        source_display_filename: string | null;
    } | undefined;
    if (!row) {
        return { profile: null, source: null };
    }
    const profile = safeJsonParse<AboroProfile | null>(row.profile_json, null, 'aboro_profiles.profile_json');
    const soft = profile ? calculateSoftSkillScore(profile) : null;
    return {
        profile,
        createdAt: row.created_at,
        createdBy: row.created_by,
        sourceDocumentId: row.source_document_id,
        sourceDocumentName: row.source_display_filename ?? row.source_filename,
        source: row.source_document_id ? 'pdf' : 'manual',
        softSkillScore: soft?.score,
        softSkillAlerts: soft?.alerts,
    };
}
// ─── Manual Aboro entry ──────────────────────────────────────────────
interface ManualAboroParams {
    candidateId: string;
    traits: AboroProfile['traits'];
    talent_cloud?: Record<string, string>;
    talents?: string[];
    axes_developpement?: string[];
    userSlug: string;
}
interface ManualAboroResult {
    profile: AboroProfile;
    softSkillScore: number;
    alerts: SoftSkillResult['alerts'];
}
export async function saveManualAboroProfile(params: ManualAboroParams): Promise<ManualAboroResult> {
    const { candidateId, traits, talent_cloud, talents, axes_developpement, userSlug } = params;
    const db = getDb();
    const profile: AboroProfile = {
        traits,
        talent_cloud: talent_cloud ?? {},
        talents: talents ?? [],
        axes_developpement: axes_developpement ?? [],
        matrices: [],
    };
    const profileId = crypto.randomUUID();
    await db.prepare(`INSERT INTO aboro_profiles (id, candidate_id, profile_json, source_document_id, created_by)
        VALUES (?, ?, ?, ?, ?)`)
        .run(profileId, candidateId, JSON.stringify(profile), null, userSlug);
    // Calculate soft skill score and update ALL candidatures for this candidate
    const softResult = calculateSoftSkillScore(profile);
    const candidatureRows = await db.prepare('SELECT id, taux_compatibilite_poste, taux_compatibilite_equipe FROM candidatures WHERE candidate_id = ?')
        .all(candidateId) as {
        id: string;
        taux_compatibilite_poste: number | null;
        taux_compatibilite_equipe: number | null;
    }[];
    for (const c of candidatureRows) {
        const tauxGlobal = await calculateGlobalScore(c.taux_compatibilite_poste, c.taux_compatibilite_equipe, softResult.score);
        await db.prepare('UPDATE candidatures SET taux_soft_skills = ?, soft_skill_alerts = ?, taux_global = ? WHERE id = ?')
            .run(softResult.score, JSON.stringify(softResult.alerts), tauxGlobal, c.id);
    }
    return { profile, softSkillScore: softResult.score, alerts: softResult.alerts };
}

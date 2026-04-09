import crypto from 'crypto'
import { getDb } from './db.js'
import { calculateSoftSkillScore } from './soft-skill-scoring.js'
import { calculateGlobalScore } from './compatibility.js'
import { safeJsonParse } from './types.js'
import type { AboroProfile } from './aboro-extraction.js'
import type { SoftSkillResult } from './soft-skill-scoring.js'

// ─── Get Aboro profile ───────────────────────────────────────────────

interface GetAboroProfileResult {
  profile: AboroProfile | null
  createdAt?: string
}

export function getAboroProfile(candidateId: string): GetAboroProfileResult {
  const row = getDb().prepare(
    'SELECT profile_json, created_at FROM aboro_profiles WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(candidateId) as { profile_json: string; created_at: string } | undefined

  if (!row) {
    return { profile: null }
  }

  return {
    profile: safeJsonParse<AboroProfile | null>(row.profile_json, null, 'aboro_profiles.profile_json'),
    createdAt: row.created_at,
  }
}

// ─── Manual Aboro entry ──────────────────────────────────────────────

interface ManualAboroParams {
  candidateId: string
  traits: AboroProfile['traits']
  talent_cloud?: Record<string, string>
  talents?: string[]
  axes_developpement?: string[]
  userSlug: string
}

interface ManualAboroResult {
  profile: AboroProfile
  softSkillScore: number
  alerts: SoftSkillResult['alerts']
}

export function saveManualAboroProfile(params: ManualAboroParams): ManualAboroResult {
  const { candidateId, traits, talent_cloud, talents, axes_developpement, userSlug } = params
  const db = getDb()

  const profile: AboroProfile = {
    traits,
    talent_cloud: talent_cloud ?? {},
    talents: talents ?? [],
    axes_developpement: axes_developpement ?? [],
    matrices: [],
  }
  const profileId = crypto.randomUUID()

  db.prepare('INSERT OR REPLACE INTO aboro_profiles (id, candidate_id, profile_json, source_document_id, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(profileId, candidateId, JSON.stringify(profile), null, userSlug)

  // Calculate soft skill score and update ALL candidatures for this candidate
  const softResult = calculateSoftSkillScore(profile)

  const candidatureRows = db.prepare('SELECT id, taux_compatibilite_poste, taux_compatibilite_equipe FROM candidatures WHERE candidate_id = ?')
    .all(candidateId) as { id: string; taux_compatibilite_poste: number | null; taux_compatibilite_equipe: number | null }[]

  for (const c of candidatureRows) {
    const tauxGlobal = calculateGlobalScore(c.taux_compatibilite_poste, c.taux_compatibilite_equipe, softResult.score)
    db.prepare('UPDATE candidatures SET taux_soft_skills = ?, soft_skill_alerts = ?, taux_global = ? WHERE id = ?')
      .run(softResult.score, JSON.stringify(softResult.alerts), tauxGlobal, c.id)
  }

  return { profile, softSkillScore: softResult.score, alerts: softResult.alerts }
}

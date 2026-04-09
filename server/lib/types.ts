export interface AuthUser {
  id: string
  email: string
  name: string
  slug: string | null
  pinCustomized?: boolean
}

export function getUser(req: import('express').Request): AuthUser {
  return (req as typeof req & { user: AuthUser }).user
}

export interface CandidateRow {
  id: string
  name: string
  role: string
  role_id: string | null
  email: string | null
  telephone: string | null
  pays: string | null
  linkedin_url: string | null
  github_url: string | null
  canal: string | null
  created_by: string
  created_at: string
  expires_at: string
  ratings: string
  experience: string
  skipped_categories: string
  submitted_at: string | null
  ai_report: string | null
  notes: string | null
  cv_text: string | null
  ai_suggestions: string | null
}

export interface RoleRow {
  id: string
  label: string
  created_by: string
  created_at: string
  deleted_at: string | null
}

export interface RoleCategoryRow {
  role_id: string
  category_id: string
}

export interface PosteRow {
  id: string
  role_id: string
  titre: string
  pole: string
  headcount: number
  headcount_flexible: number // 0 or 1 (boolean)
  experience_min: number
  cigref: string
  contrat: string
  statut: string
  date_publication: string
  created_at: string
}

export type CandidatureStatut =
  | 'postule'
  | 'preselectionne'
  | 'skill_radar_envoye'
  | 'skill_radar_complete'
  | 'entretien_1'
  | 'aboro'
  | 'entretien_2'
  | 'proposition'
  | 'embauche'
  | 'refuse'

export interface CandidatureRow {
  id: string
  candidate_id: string
  poste_id: string
  statut: string
  canal: string
  notes_directeur: string | null
  taux_compatibilite_poste: number | null
  taux_compatibilite_equipe: number | null
  taux_soft_skills: number | null
  soft_skill_alerts: string | null
  taux_global: number | null
  created_at: string
  updated_at: string
}

export interface CandidatureEventRow {
  id: number
  candidature_id: string
  type: string
  statut_from: string | null
  statut_to: string | null
  notes: string | null
  created_by: string
  created_at: string
}

/** Safe JSON.parse that returns a fallback on error instead of crashing.
 *  Logs corruption so bad rows are visible, not silently hidden. */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T, context?: string): T {
  if (json == null) return fallback
  try {
    return JSON.parse(json)
  } catch {
    console.error(`[DATA] Corrupted JSON${context ? ` in ${context}` : ''}:`, json?.slice(0, 100))
    return fallback
  }
}

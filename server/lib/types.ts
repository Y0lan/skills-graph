export interface CandidateRow {
  id: string
  name: string
  role: string
  role_id: string | null
  email: string | null
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

/** Safe JSON.parse that returns a fallback on error instead of crashing */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (json == null) return fallback
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

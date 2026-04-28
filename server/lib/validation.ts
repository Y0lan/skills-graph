import { getSkillCategories } from './catalog.js'

/**
 * Validate ratings: keys must be valid skill IDs, values must be integers 0-5.
 * Returns an error message string if invalid, null if valid.
 */
export function validateRatings(ratings: unknown): string | null {
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
    return 'ratings doit être un objet'
  }
  const validSkillIds = new Set(
    getSkillCategories().flatMap(c => c.skills.map(s => s.id))
  )
  const unknown: string[] = []
  for (const [key, value] of Object.entries(ratings as Record<string, unknown>)) {
    if (!validSkillIds.has(key)) {
      unknown.push(key)
      continue
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) {
      return `Valeur invalide pour ${key}: doit être un entier entre 0 et 5`
    }
  }
  if (unknown.length > 0) {
    return unknown.length === 1
      ? `Compétence inconnue: ${unknown[0]}`
      : `Compétences inconnues: ${unknown.join(', ')}`
  }
  return null
}

/**
 * Filter a ratings record to only include valid skill IDs with 0-5 integer values.
 * Silently drops invalid entries (useful for AI-generated suggestions).
 */
export function filterValidRatings(ratings: Record<string, unknown>): Record<string, number> {
  const validSkillIds = new Set(
    getSkillCategories().flatMap(c => c.skills.map(s => s.id))
  )
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(ratings)) {
    if (validSkillIds.has(key) && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5) {
      result[key] = value
    }
  }
  return result
}

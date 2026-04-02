import { getDb } from './db.js'
import { safeJsonParse } from './types.js'

const GAP_BONUS_MULTIPLIER = 10

/**
 * Calculate compatibility score between a candidate and a poste.
 *
 * PHASE 1 SIMPLIFICATION: Uses category-average scoring rather than the
 * per-skill formula from the design doc. The design doc specifies:
 *   score = Σ(min(candidat, attendu) / attendu × poids) / Σ(poids) × 100
 * with requis=2, apprecie=1 weighting per skill.
 *
 * Phase 1 instead averages candidate scores per category and normalizes to 0-100.
 * Phase 2 will add a `poste_skill_requirements` table with per-skill target levels
 * and requis/apprecie weights to implement the exact formula.
 */
export function calculatePosteCompatibility(
  candidateRatings: Record<string, number>,
  posteRoleId: string,
): number {
  const db = getDb()

  // Get the categories for this poste's role
  const roleCats = db.prepare(
    'SELECT category_id FROM role_categories WHERE role_id = ?'
  ).all(posteRoleId) as { category_id: string }[]

  if (roleCats.length === 0) return 0

  // Get all skills per category
  const skills = db.prepare(
    'SELECT id, category_id FROM skills'
  ).all() as { id: string; category_id: string }[]

  const skillsByCategory = new Map<string, string[]>()
  for (const s of skills) {
    const list = skillsByCategory.get(s.category_id) ?? []
    list.push(s.id)
    skillsByCategory.set(s.category_id, list)
  }

  let totalScore = 0
  let totalWeight = 0

  for (const { category_id: catId } of roleCats) {
    const catSkills = skillsByCategory.get(catId) ?? []
    if (catSkills.length === 0) continue

    // Calculate candidate's average in this category
    let candidateSum = 0
    let candidateCount = 0
    for (const skillId of catSkills) {
      const level = candidateRatings[skillId]
      if (level != null && level > 0) {
        candidateSum += level
        candidateCount++
      }
    }

    if (candidateCount === 0) continue

    const candidateAvg = candidateSum / candidateCount
    // Normalize to 0-100 scale (max level is 5)
    const categoryScore = (candidateAvg / 5) * 100
    totalScore += categoryScore
    totalWeight++
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0
}

/**
 * Calculate team compatibility score.
 * Measures how well the candidate fills gaps in the existing team
 * for the categories relevant to the poste.
 */
export function calculateEquipeCompatibility(
  candidateRatings: Record<string, number>,
  posteRoleId: string,
): number {
  const db = getDb()

  // Get the categories for this poste's role
  const roleCats = db.prepare(
    'SELECT category_id FROM role_categories WHERE role_id = ?'
  ).all(posteRoleId) as { category_id: string }[]

  if (roleCats.length === 0) return 0

  // Get all submitted team member evaluations
  const teamMembers = db.prepare(
    'SELECT slug, ratings FROM evaluations WHERE submitted_at IS NOT NULL'
  ).all() as { slug: string; ratings: string }[]

  if (teamMembers.length === 0) return 0

  // Get all skills per category
  const skills = db.prepare(
    'SELECT id, category_id FROM skills'
  ).all() as { id: string; category_id: string }[]

  const skillsByCategory = new Map<string, string[]>()
  for (const s of skills) {
    const list = skillsByCategory.get(s.category_id) ?? []
    list.push(s.id)
    skillsByCategory.set(s.category_id, list)
  }

  // Parse team ratings
  const teamRatings = teamMembers.map(m => ({
    slug: m.slug,
    ratings: safeJsonParse<Record<string, number>>(m.ratings, {}),
  }))

  let totalScore = 0
  let totalWeight = 0

  for (const { category_id: catId } of roleCats) {
    const catSkills = skillsByCategory.get(catId) ?? []
    if (catSkills.length === 0) continue

    // Calculate team average in this category
    let teamSum = 0
    let teamCount = 0
    for (const member of teamRatings) {
      for (const skillId of catSkills) {
        const level = member.ratings[skillId]
        if (level != null && level > 0) {
          teamSum += level
          teamCount++
        }
      }
    }
    const teamAvg = teamCount > 0 ? teamSum / teamCount : 0

    // Calculate candidate's average in this category
    let candidateSum = 0
    let candidateCount = 0
    for (const skillId of catSkills) {
      const level = candidateRatings[skillId]
      if (level != null && level > 0) {
        candidateSum += level
        candidateCount++
      }
    }

    if (candidateCount === 0) continue
    const candidateAvg = candidateSum / candidateCount

    // Score: how much does the candidate fill gaps?
    // If candidate > team avg: high gap-filling value
    // If candidate ≈ team avg: moderate (reinforces strength)
    // If candidate < team avg: lower value
    let gapScore: number
    if (teamAvg === 0) {
      // No team data for this category — candidate brings new expertise
      gapScore = (candidateAvg / 5) * 100
    } else if (candidateAvg >= teamAvg) {
      // Candidate fills or exceeds team gap — bonus
      gapScore = Math.min(100, (candidateAvg / 5) * 100 + (candidateAvg - teamAvg) * GAP_BONUS_MULTIPLIER)
    } else {
      // Candidate below team avg — still counts but less
      gapScore = (candidateAvg / 5) * 100 * 0.8
    }

    totalScore += gapScore
    totalWeight++
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0
}

/**
 * Get gap analysis: which categories the candidate fills vs the team
 */
export function getGapAnalysis(
  candidateRatings: Record<string, number>,
  posteRoleId: string,
): { categoryId: string; categoryLabel: string; candidateAvg: number; teamAvg: number; gap: number }[] {
  const db = getDb()

  const roleCats = db.prepare(
    'SELECT category_id FROM role_categories WHERE role_id = ?'
  ).all(posteRoleId) as { category_id: string }[]

  const categories = db.prepare('SELECT id, label FROM categories').all() as { id: string; label: string }[]
  const catLabels = new Map(categories.map(c => [c.id, c.label]))

  const skills = db.prepare('SELECT id, category_id FROM skills').all() as { id: string; category_id: string }[]
  const skillsByCategory = new Map<string, string[]>()
  for (const s of skills) {
    const list = skillsByCategory.get(s.category_id) ?? []
    list.push(s.id)
    skillsByCategory.set(s.category_id, list)
  }

  const teamMembers = db.prepare(
    'SELECT ratings FROM evaluations WHERE submitted_at IS NOT NULL'
  ).all() as { ratings: string }[]
  const teamRatings = teamMembers.map(m => safeJsonParse<Record<string, number>>(m.ratings, {}))

  const gaps: { categoryId: string; categoryLabel: string; candidateAvg: number; teamAvg: number; gap: number }[] = []

  for (const { category_id: catId } of roleCats) {
    const catSkills = skillsByCategory.get(catId) ?? []
    if (catSkills.length === 0) continue

    // Team average
    let teamSum = 0
    let teamCount = 0
    for (const memberRatings of teamRatings) {
      for (const skillId of catSkills) {
        const level = memberRatings[skillId]
        if (level != null && level > 0) {
          teamSum += level
          teamCount++
        }
      }
    }
    const teamAvg = teamCount > 0 ? Math.round((teamSum / teamCount) * 10) / 10 : 0

    // Candidate average
    let candSum = 0
    let candCount = 0
    for (const skillId of catSkills) {
      const level = candidateRatings[skillId]
      if (level != null && level > 0) {
        candSum += level
        candCount++
      }
    }
    const candidateAvg = candCount > 0 ? Math.round((candSum / candCount) * 10) / 10 : 0

    gaps.push({
      categoryId: catId,
      categoryLabel: catLabels.get(catId) ?? catId,
      candidateAvg,
      teamAvg,
      gap: Math.round((candidateAvg - teamAvg) * 10) / 10,
    })
  }

  return gaps.sort((a, b) => b.gap - a.gap)
}

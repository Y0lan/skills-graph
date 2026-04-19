import { getDb } from './db.js'
import { safeJsonParse } from './types.js'

const GAP_BONUS_MULTIPLIER = 10

/**
 * Calculate compatibility score between a candidate and a poste.
 *
 * If per-skill requirements exist in `poste_skill_requirements` for this role's
 * poste, uses the weighted formula:
 *   score = Σ(min(candidate_level, target_level) / target_level × weight) / Σ(weight) × 100
 *   where weight = 2 for 'requis', weight = 1 for 'apprecie'
 *
 * Fallback: if no requirements exist, uses the original category-average logic
 * (backward compatibility).
 */
export function calculatePosteCompatibility(
  candidateRatings: Record<string, number>,
  posteRoleId: string,
): number {
  const db = getDb()

  // Check if any poste linked to this role has skill requirements
  const posteRow = db.prepare('SELECT id FROM postes WHERE role_id = ?').get(posteRoleId) as { id: string } | undefined
  if (posteRow) {
    const requirements = db.prepare(
      'SELECT skill_id, target_level, importance FROM poste_skill_requirements WHERE poste_id = ?'
    ).all(posteRow.id) as { skill_id: string; target_level: number; importance: string }[]

    if (requirements.length > 0) {
      return calculateWeightedCompatibility(candidateRatings, requirements)
    }
  }

  // Fallback: category-average scoring
  return calculateCategoryAverageCompatibility(candidateRatings, posteRoleId)
}

/**
 * Weighted per-skill compatibility scoring.
 * score = Σ(min(candidate_level, target_level) / target_level × weight) / Σ(weight) × 100
 * where weight = 2 for 'requis', weight = 1 for 'apprecie'
 */
function calculateWeightedCompatibility(
  candidateRatings: Record<string, number>,
  requirements: { skill_id: string; target_level: number; importance: string }[],
): number {
  let weightedSum = 0
  let totalWeight = 0

  for (const req of requirements) {
    const weight = req.importance === 'requis' ? 2 : 1
    const candidateLevel = candidateRatings[req.skill_id] ?? 0
    const contribution = (Math.min(candidateLevel, req.target_level) / req.target_level) * weight
    weightedSum += contribution
    totalWeight += weight
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0
}

/**
 * Original category-average compatibility scoring (Phase 1 fallback).
 * Averages candidate scores per category and normalizes to 0-100.
 */
function calculateCategoryAverageCompatibility(
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
    // Count ALL skills (unrated = 0) to prevent sparse-profile inflation
    let candidateSum = 0
    for (const skillId of catSkills) {
      const level = candidateRatings[skillId]
      if (level != null && level > 0) {
        candidateSum += level
      }
    }

    const candidateAvg = candidateSum / catSkills.length
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
    // Count ALL skills (unrated = 0) to prevent sparse-profile inflation
    let candidateSum = 0
    for (const skillId of catSkills) {
      const level = candidateRatings[skillId]
      if (level != null && level > 0) {
        candidateSum += level
      }
    }

    const candidateAvg = candidateSum / catSkills.length

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

// ─── Breakdowns (drive the "Voir les détails" UI on every % pill) ────────

export interface PosteCompatBreakdown {
  total: number
  formula: 'weighted' | 'category-average'
  items: Array<{
    skillId?: string
    skillLabel?: string
    categoryId?: string
    categoryLabel?: string
    candidateLevel: number
    targetLevel: number
    weight: number
    contribution: number
    contributionPct: number
  }>
}

export interface EquipeCompatBreakdown {
  total: number
  items: Array<{
    categoryId: string
    categoryLabel: string
    candidateAvg: number
    teamAvg: number
    contribution: number
    direction: 'fills_gap' | 'matches' | 'below_team'
  }>
}

export function getPosteCompatBreakdown(
  candidateRatings: Record<string, number>,
  posteRoleId: string,
): PosteCompatBreakdown {
  const db = getDb()
  const posteRow = db.prepare('SELECT id FROM postes WHERE role_id = ?').get(posteRoleId) as { id: string } | undefined
  const requirements = posteRow
    ? db.prepare(
        'SELECT skill_id, target_level, importance FROM poste_skill_requirements WHERE poste_id = ?'
      ).all(posteRow.id) as { skill_id: string; target_level: number; importance: string }[]
    : []

  if (requirements.length > 0) {
    const skillLabels = new Map(
      (db.prepare('SELECT id, label FROM skills').all() as { id: string; label: string }[])
        .map(s => [s.id, s.label])
    )
    let weightedSum = 0
    let totalWeight = 0
    const rawItems = requirements.map(r => {
      const weight = r.importance === 'requis' ? 2 : 1
      const candidateLevel = candidateRatings[r.skill_id] ?? 0
      const contribution = (Math.min(candidateLevel, r.target_level) / r.target_level) * weight
      weightedSum += contribution
      totalWeight += weight
      return {
        skillId: r.skill_id,
        skillLabel: skillLabels.get(r.skill_id) ?? r.skill_id,
        candidateLevel,
        targetLevel: r.target_level,
        weight,
        contribution,
      }
    })
    const items = rawItems.map(item => ({
      ...item,
      contributionPct: weightedSum > 0 ? Math.round((item.contribution / weightedSum) * 1000) / 10 : 0,
    })).sort((a, b) => b.contribution - a.contribution)
    return {
      total: totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0,
      formula: 'weighted',
      items,
    }
  }

  // Category-average fallback
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

  let totalScore = 0
  let totalWeight = 0
  const rawItems: Array<{ categoryId: string; categoryLabel: string; candidateLevel: number; targetLevel: number; weight: number; contribution: number }> = []

  for (const { category_id: catId } of roleCats) {
    const catSkills = skillsByCategory.get(catId) ?? []
    if (catSkills.length === 0) continue
    let candidateSum = 0
    for (const skillId of catSkills) {
      const level = candidateRatings[skillId]
      if (level != null && level > 0) candidateSum += level
    }
    const candidateAvg = candidateSum / catSkills.length
    const categoryScore = (candidateAvg / 5) * 100
    totalScore += categoryScore
    totalWeight++
    rawItems.push({
      categoryId: catId,
      categoryLabel: catLabels.get(catId) ?? catId,
      candidateLevel: Math.round(candidateAvg * 10) / 10,
      targetLevel: 5,
      weight: 1,
      contribution: categoryScore,
    })
  }
  const items = rawItems.map(item => ({
    ...item,
    contributionPct: totalScore > 0 ? Math.round((item.contribution / totalScore) * 1000) / 10 : 0,
  })).sort((a, b) => b.contribution - a.contribution)
  return {
    total: totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0,
    formula: 'category-average',
    items,
  }
}

export function getEquipeCompatBreakdown(
  candidateRatings: Record<string, number>,
  posteRoleId: string,
): EquipeCompatBreakdown {
  const db = getDb()
  const roleCats = db.prepare(
    'SELECT category_id FROM role_categories WHERE role_id = ?'
  ).all(posteRoleId) as { category_id: string }[]
  if (roleCats.length === 0) return { total: 0, items: [] }

  const teamMembers = db.prepare(
    'SELECT slug, ratings FROM evaluations WHERE submitted_at IS NOT NULL'
  ).all() as { slug: string; ratings: string }[]

  const skills = db.prepare('SELECT id, category_id FROM skills').all() as { id: string; category_id: string }[]
  const categories = db.prepare('SELECT id, label FROM categories').all() as { id: string; label: string }[]
  const catLabels = new Map(categories.map(c => [c.id, c.label]))
  const skillsByCategory = new Map<string, string[]>()
  for (const s of skills) {
    const list = skillsByCategory.get(s.category_id) ?? []
    list.push(s.id)
    skillsByCategory.set(s.category_id, list)
  }

  const teamRatings = teamMembers.map(m => safeJsonParse<Record<string, number>>(m.ratings, {}))

  let totalScore = 0
  let totalWeight = 0
  const items: EquipeCompatBreakdown['items'] = []

  for (const { category_id: catId } of roleCats) {
    const catSkills = skillsByCategory.get(catId) ?? []
    if (catSkills.length === 0) continue

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
    const teamAvg = teamCount > 0 ? teamSum / teamCount : 0

    let candidateSum = 0
    for (const skillId of catSkills) {
      const level = candidateRatings[skillId]
      if (level != null && level > 0) candidateSum += level
    }
    const candidateAvg = candidateSum / catSkills.length

    let gapScore: number
    let direction: EquipeCompatBreakdown['items'][number]['direction']
    if (teamAvg === 0) {
      gapScore = (candidateAvg / 5) * 100
      direction = 'fills_gap'
    } else if (candidateAvg >= teamAvg) {
      gapScore = Math.min(100, (candidateAvg / 5) * 100 + (candidateAvg - teamAvg) * GAP_BONUS_MULTIPLIER)
      direction = candidateAvg > teamAvg + 0.25 ? 'fills_gap' : 'matches'
    } else {
      gapScore = (candidateAvg / 5) * 100 * 0.8
      direction = 'below_team'
    }

    totalScore += gapScore
    totalWeight++
    items.push({
      categoryId: catId,
      categoryLabel: catLabels.get(catId) ?? catId,
      candidateAvg: Math.round(candidateAvg * 10) / 10,
      teamAvg: Math.round(teamAvg * 10) / 10,
      contribution: Math.round(gapScore),
      direction,
    })
  }

  return {
    total: totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0,
    items: items.sort((a, b) => b.contribution - a.contribution),
  }
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

    // Candidate average (unrated = 0 to prevent sparse-profile inflation)
    let candSum = 0
    for (const skillId of catSkills) {
      const level = candidateRatings[skillId]
      if (level != null && level > 0) {
        candSum += level
      }
    }
    const candidateAvg = Math.round((candSum / catSkills.length) * 10) / 10

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

/**
 * Calculate the global weighted score combining poste, equipe, and soft skills.
 * Reads configurable weights from scoring_weights table.
 */
export function calculateGlobalScore(
  tauxPoste: number | null,
  tauxEquipe: number | null,
  tauxSoft: number | null,
): number | null {
  const db = getDb()
  const weights = db.prepare('SELECT weight_poste, weight_equipe, weight_soft FROM scoring_weights WHERE id = ?')
    .get('default') as { weight_poste: number; weight_equipe: number; weight_soft: number } | undefined

  const wp = weights?.weight_poste ?? 0.7
  const we = weights?.weight_equipe ?? 0.3
  const ws = weights?.weight_soft ?? 0

  // If no soft skills available, redistribute soft weight proportionally
  if (tauxSoft == null) {
    if (tauxPoste == null) return null
    // Guard against division by zero when both poste and equipe weights are 0
    if (wp + we === 0) return null
    const fallbackWp = wp + ws * (wp / (wp + we))
    const fallbackWe = we + ws * (we / (wp + we))
    return Math.round((tauxPoste * fallbackWp + (tauxEquipe ?? 0) * fallbackWe))
  }

  return Math.round(
    (tauxPoste ?? 0) * wp + (tauxEquipe ?? 0) * we + tauxSoft * ws
  )
}

/**
 * Calculate compatibility scores for other postes in the same pole.
 */
export function calculateMultiPosteCompatibility(
  candidateRatings: Record<string, number>,
  currentPosteId: string,
): { posteId: string; posteTitre: string; tauxPoste: number }[] {
  const db = getDb()
  const currentPoste = db.prepare('SELECT pole FROM postes WHERE id = ?')
    .get(currentPosteId) as { pole: string } | undefined
  if (!currentPoste) return []

  const otherPostes = db.prepare(
    'SELECT id, role_id, titre FROM postes WHERE pole = ? AND id != ?'
  ).all(currentPoste.pole, currentPosteId) as { id: string; role_id: string; titre: string }[]

  return otherPostes.map(p => ({
    posteId: p.id,
    posteTitre: p.titre,
    tauxPoste: calculatePosteCompatibility(candidateRatings, p.role_id),
  }))
}

/**
 * Get skills the candidate has rated that are NOT in the poste's role categories.
 * These are "bonus" skills that show additional value beyond the role requirements.
 */
export function getBonusSkills(
  candidateRatings: Record<string, number>,
  posteRoleId: string,
): { skillId: string; skillLabel: string; categoryLabel: string; score: number }[] {
  const db = getDb()

  // Get the role's category IDs
  const roleCats = db.prepare(
    'SELECT category_id FROM role_categories WHERE role_id = ?'
  ).all(posteRoleId) as { category_id: string }[]
  const roleCatIds = new Set(roleCats.map(c => c.category_id))

  // Get all skills with their category info
  const allSkills = db.prepare(
    'SELECT s.id, s.label, s.category_id, c.label as category_label FROM skills s JOIN categories c ON c.id = s.category_id'
  ).all() as { id: string; label: string; category_id: string; category_label: string }[]

  // Find skills rated by candidate that are NOT in the role's categories
  const bonusSkills: { skillId: string; skillLabel: string; categoryLabel: string; score: number }[] = []
  for (const skill of allSkills) {
    if (roleCatIds.has(skill.category_id)) continue
    const rating = candidateRatings[skill.id]
    if (rating != null && rating > 0) {
      bonusSkills.push({
        skillId: skill.id,
        skillLabel: skill.label,
        categoryLabel: skill.category_label,
        score: rating,
      })
    }
  }

  return bonusSkills.sort((a, b) => b.score - a.score)
}

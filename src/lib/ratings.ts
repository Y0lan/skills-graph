import type { SkillCategory, Skill } from '@/data/skill-catalog'
import { teamMembers } from '@/data/team-roster'

export interface MemberRatings {
  ratings: Record<string, number>
  experience: Record<string, number>
  skippedCategories: string[]
  declinedCategories: string[]
  submittedAt: string | null
}

export type AllRatings = Record<string, MemberRatings>

// ─── Team Average per Skill ──────────────────────────────
// Exclude 0 (unknown) and -1 (not submitted). Skipped categories (-2) excluded.
export function teamAveragePerSkill(
  skillId: string,
  allRatings: AllRatings,
): number {
  const values: number[] = []
  for (const memberData of Object.values(allRatings)) {
    const val = memberData.ratings[skillId]
    if (val !== undefined && val > 0) {
      values.push(val)
    }
  }
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

// ─── Category Average (for overview radars) ──────────────
// For a member or team: average of all skill ratings in a category where value > 0
export function categoryAverage(
  category: SkillCategory,
  ratings: Record<string, number>,
): number {
  const values: number[] = []
  for (const skill of category.skills) {
    const val = ratings[skill.id]
    if (val !== undefined && val > 0) {
      values.push(val)
    }
  }
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function teamCategoryAverage(
  category: SkillCategory,
  allRatings: AllRatings,
): number {
  const teamAvgs = category.skills.map((s) => teamAveragePerSkill(s.id, allRatings))
  const nonZero = teamAvgs.filter((v) => v > 0)
  if (nonZero.length === 0) return 0
  return nonZero.reduce((a, b) => a + b, 0) / nonZero.length
}

// ─── Category Summary ────────────────────────────────────
export interface CategorySummary {
  categoryId: string
  categoryLabel: string
  emoji: string
  avgStrength: number
  coverage: number
  topSkill: { id: string; label: string; avg: number } | null
  weakestSkill: { id: string; label: string; avg: number } | null
}

export function categorySummary(
  category: SkillCategory,
  allRatings: AllRatings,
): CategorySummary {
  // Skill averages
  const skillAvgs = category.skills.map((s) => ({
    id: s.id,
    label: s.label,
    avg: teamAveragePerSkill(s.id, allRatings),
  }))

  const nonZeroAvgs = skillAvgs.filter((s) => s.avg > 0)
  const avgStrength =
    nonZeroAvgs.length > 0
      ? nonZeroAvgs.reduce((a, b) => a + b.avg, 0) / nonZeroAvgs.length
      : 0

  // Coverage: members who have at least one skill in this category rated >= 3
  let coverage = 0
  for (const memberData of Object.values(allRatings)) {
    const hasSkillAt3Plus = category.skills.some((s) => {
      const val = memberData.ratings[s.id]
      return val !== undefined && val >= 3
    })
    if (hasSkillAt3Plus) coverage++
  }

  // Top and weakest
  const sorted = [...nonZeroAvgs].sort((a, b) => b.avg - a.avg)
  const topSkill = sorted.length > 0 ? sorted[0] : null
  const weakestSkill = sorted.length > 0 ? sorted[sorted.length - 1] : null

  return {
    categoryId: category.id,
    categoryLabel: category.label,
    emoji: category.emoji,
    avgStrength,
    coverage,
    topSkill,
    weakestSkill,
  }
}

// ─── Skills Gap Table ────────────────────────────────────
export type RiskColor = 'red' | 'yellow' | 'green'

export interface SkillGapData {
  skillId: string
  skillLabel: string
  categoryId: string
  categoryLabel: string
  teamAvg: number
  countAt3Plus: number
  highestRater: { slug: string; name: string; value: number } | null
  lowestRater: { slug: string; name: string; value: number } | null
  riskColor: RiskColor
}

export function skillsGapData(
  allRatings: AllRatings,
  categories: SkillCategory[],
  skills: Skill[],
): SkillGapData[] {
  const memberLookup = new Map(teamMembers.map((m) => [m.slug, m]))

  return skills.map((skill) => {
    const teamAvg = teamAveragePerSkill(skill.id, allRatings)

    let countAt3Plus = 0
    let highest: { slug: string; value: number } | null = null
    let lowest: { slug: string; value: number } | null = null

    for (const [slug, memberData] of Object.entries(allRatings)) {
      const val = memberData.ratings[skill.id]
      if (val === undefined || val <= 0) continue

      if (val >= 3) countAt3Plus++

      if (!highest || val > highest.value) {
        highest = { slug, value: val }
      }
      if (!lowest || val < lowest.value) {
        lowest = { slug, value: val }
      }
    }

    const riskColor: RiskColor =
      countAt3Plus <= 1 ? 'red' : countAt3Plus <= 3 ? 'yellow' : 'green'

    const cat = categories.find((c) => c.id === skill.categoryId)

    return {
      skillId: skill.id,
      skillLabel: skill.label,
      categoryId: skill.categoryId,
      categoryLabel: cat?.label ?? '',
      teamAvg,
      countAt3Plus,
      highestRater: highest
        ? {
            slug: highest.slug,
            name: memberLookup.get(highest.slug)?.name ?? highest.slug,
            value: highest.value,
          }
        : null,
      lowestRater: lowest
        ? {
            slug: lowest.slug,
            name: memberLookup.get(lowest.slug)?.name ?? lowest.slug,
            value: lowest.value,
          }
        : null,
      riskColor,
    }
  })
}

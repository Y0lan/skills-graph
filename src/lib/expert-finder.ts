import type { TeamMemberAggregateResponse } from '@/lib/types'

export interface ExpertResult {
  slug: string
  name: string
  role: string
  team: string
  averageScore: number
  skillScores: Record<string, number | null>
  matchCount: number
  totalSelected: number
}

/**
 * Rank team members by their scores on a set of selected skills.
 *
 * - Only includes members who have submitted (`submittedAt !== null`).
 * - For each selected skill, looks up the member's rating from `member.skillRatings`.
 *   If not found the entry is `null` (excluded from the average, NOT counted as 0).
 * - `matchCount` = number of non-null skill scores.
 * - `averageScore` = arithmetic mean of non-null skill scores.
 * - Results are sorted by `averageScore` descending, then `matchCount` descending.
 */
export function rankMembersBySkills(
  members: TeamMemberAggregateResponse[],
  selectedSkillIds: string[],
): ExpertResult[] {
  if (selectedSkillIds.length === 0) return []

  const results: ExpertResult[] = []

  for (const member of members) {
    // Only include members who have submitted their ratings
    if (!member.submittedAt) continue

    const skillScores: Record<string, number | null> = {}
    let sum = 0
    let matchCount = 0

    for (const skillId of selectedSkillIds) {
      const rating = member.skillRatings[skillId]
      if (rating !== undefined && rating !== null) {
        skillScores[skillId] = rating
        sum += rating
        matchCount++
      } else {
        skillScores[skillId] = null
      }
    }

    const averageScore = matchCount > 0 ? sum / matchCount : 0

    results.push({
      slug: member.slug,
      name: member.name,
      role: member.role,
      team: member.team,
      averageScore,
      skillScores,
      matchCount,
      totalSelected: selectedSkillIds.length,
    })
  }

  // Sort: highest averageScore first, then highest matchCount first
  results.sort((a, b) => {
    if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore
    return b.matchCount - a.matchCount
  })

  return results
}

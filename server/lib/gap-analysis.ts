import type { SkillCategory } from '../../src/data/skill-catalog.js'

export type GapSeverity = 'missing' | 'below' | 'critical'

export interface RoleGap {
  categoryId: string
  categoryLabel: string
  rating: number | null
  severity: GapSeverity
}

/**
 * Compute role-relevant gaps for a candidate.
 *
 * Averages skill ratings per role category and classifies categories below
 * `threshold` as gaps. Categories with no rated skills are `missing`.
 * Returns up to `maxGaps` worst categories, missing first, then ascending rating.
 */
export function computeRoleGaps(
  ratings: Record<string, number>,
  categories: SkillCategory[],
  roleCategoryIds: string[],
  threshold = 3,
  maxGaps = 3,
): RoleGap[] {
  const relevantSet = new Set(roleCategoryIds)
  const gaps: RoleGap[] = []

  for (const cat of categories) {
    if (!relevantSet.has(cat.id)) continue

    const skillRatings: number[] = cat.skills
      .map((s: { id: string }) => ratings[s.id])
      .filter((v: number | undefined): v is number => typeof v === 'number' && v > 0)

    if (skillRatings.length === 0) {
      gaps.push({ categoryId: cat.id, categoryLabel: cat.label, rating: null, severity: 'missing' })
      continue
    }

    const avg = skillRatings.reduce((a: number, b: number) => a + b, 0) / skillRatings.length
    if (avg < threshold) {
      gaps.push({
        categoryId: cat.id,
        categoryLabel: cat.label,
        rating: Math.round(avg * 10) / 10,
        severity: avg <= 1.5 ? 'critical' : 'below',
      })
    }
  }

  gaps.sort((a, b) => {
    if (a.severity === 'missing' && b.severity !== 'missing') return -1
    if (b.severity === 'missing' && a.severity !== 'missing') return 1
    return (a.rating ?? 0) - (b.rating ?? 0)
  })

  return gaps.slice(0, maxGaps)
}

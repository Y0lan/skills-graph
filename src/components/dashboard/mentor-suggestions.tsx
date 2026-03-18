import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useCatalog } from '@/hooks/use-catalog'
import { rankMembersBySkills } from '@/lib/expert-finder'
import { shortLabel } from '@/lib/utils'
import type { CategoryAggregateResponse, TeamMemberAggregateResponse } from '@/lib/types'

interface MentorSuggestionsProps {
  memberId: string
  categories: CategoryAggregateResponse[]
  teamMembers: TeamMemberAggregateResponse[]
}

interface MentorGroup {
  categoryId: string
  categoryLabel: string
  gap: number
  mentors: { slug: string; name: string; role: string; averageScore: number }[]
}

export default function MentorSuggestions({ memberId, categories, teamMembers }: MentorSuggestionsProps) {
  const { categoryById } = useCatalog()

  const mentorGroups = useMemo(() => {
    const gapCategories = categories
      .filter(c => c.gap > 0)
      .sort((a, b) => b.gap - a.gap)

    const groups: MentorGroup[] = []

    for (const cat of gapCategories) {
      const catalogCat = categoryById.get(cat.categoryId)
      if (!catalogCat) continue

      const skillIds = catalogCat.skills.map(s => s.id)
      if (skillIds.length === 0) continue

      const ranked = rankMembersBySkills(
        teamMembers.filter(m => m.slug !== memberId),
        skillIds,
      )

      // Filter to experts: average >= 3.5 on category skills
      const mentors = ranked
        .filter(r => r.averageScore >= 3.5 && r.matchCount > 0)
        .slice(0, 3)
        .map(r => ({
          slug: r.slug,
          name: r.name,
          role: r.role,
          averageScore: r.averageScore,
        }))

      groups.push({
        categoryId: cat.categoryId,
        categoryLabel: cat.categoryLabel,
        gap: cat.gap,
        mentors,
      })
    }

    return groups
  }, [memberId, categories, teamMembers, categoryById])

  if (mentorGroups.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Users className="h-4 w-4" />
        Mentors & experts suggérés
      </h3>
      <div className="space-y-3">
        {mentorGroups.map(group => (
          <div key={group.categoryId} className="rounded-md border px-3 py-2.5">
            <p className="text-sm font-medium mb-2">
              {shortLabel(group.categoryLabel)}
              <span className="ml-2 text-xs font-normal text-red-500 tabular-nums">
                (écart: -{group.gap.toFixed(1)})
              </span>
            </p>
            {group.mentors.length > 0 ? (
              <div className="space-y-1.5">
                {group.mentors.map(mentor => (
                  <div key={mentor.slug} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                    <div>
                      <Link to={`/dashboard/${mentor.slug}`} className="text-sm font-medium text-primary hover:underline">
                        {mentor.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{mentor.role}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {mentor.averageScore.toFixed(1)}/5 moy.
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Pas de mentor identifié — consultez un expert externe
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

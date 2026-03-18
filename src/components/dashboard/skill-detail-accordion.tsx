import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useCatalog } from '@/hooks/use-catalog'
import { shortLabel, cn } from '@/lib/utils'
import type { CategoryAggregateResponse, TeamMemberAggregateResponse, TeamCategoryAggregateResponse } from '@/lib/types'

interface SkillDetailAccordionProps {
  memberId: string
  categories: CategoryAggregateResponse[]
  teamMembers: TeamMemberAggregateResponse[]
  teamCategories: TeamCategoryAggregateResponse[]
}

function strengthColor(avg: number): string {
  if (avg >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (avg >= 3) return 'text-sky-600 dark:text-sky-400'
  if (avg >= 2) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function SkillDetailAccordion({ memberId, categories, teamMembers, teamCategories }: SkillDetailAccordionProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { categoryById } = useCatalog()

  const memberData = teamMembers.find(m => m.slug === memberId)

  const toggle = (catId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Détail par catégorie
      </h3>
      <div className="space-y-1">
        {categories.map(cat => {
          const isOpen = expanded.has(cat.categoryId)
          const catalogCat = categoryById.get(cat.categoryId)
          const teamCat = teamCategories.find(tc => tc.categoryId === cat.categoryId)
          const skills = catalogCat?.skills ?? []

          // Split: rated skills first, unrated (0) at the bottom
          const ratedSkills = skills.filter(s => {
            const rating = memberData?.skillRatings[s.id]
            return rating !== undefined && rating > 0
          })
          const unratedSkills = skills.filter(s => {
            const rating = memberData?.skillRatings[s.id]
            return rating === undefined || rating === 0
          })

          return (
            <div key={cat.categoryId} className="rounded-md border">
              <button
                onClick={() => toggle(cat.categoryId)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-90')} />
                  {catalogCat?.emoji && <span>{catalogCat.emoji}</span>}
                  {shortLabel(cat.categoryLabel)}
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', strengthColor(cat.avgRank))}>
                  {cat.avgRank.toFixed(1)}/5
                </span>
              </button>

              {isOpen && (
                <div className="border-t px-3 pb-3 pt-2 space-y-4">
                  {ratedSkills.map(skill => {
                    const rating = memberData?.skillRatings[skill.id] ?? 0
                    const teamAvg = teamCat?.skillAverages[skill.id]
                    return (
                      <SkillRow
                        key={skill.id}
                        label={skill.label}
                        rating={rating}
                        teamAvg={teamAvg}
                        descriptors={skill.descriptors}
                      />
                    )
                  })}

                  {unratedSkills.length > 0 && (
                    <div className="space-y-2 opacity-50">
                      {unratedSkills.map(skill => {
                        const teamAvg = teamCat?.skillAverages[skill.id]
                        return (
                          <div key={skill.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{skill.label}</span>
                            <span className="text-xs text-muted-foreground">
                              Non évalué
                              {teamAvg !== undefined && (
                                <span className="ml-2">(équipe: {teamAvg.toFixed(1)})</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {skills.length === 0 && (
                    <p className="text-sm text-muted-foreground">Aucune compétence dans cette catégorie.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SkillRow({ label, rating, teamAvg, descriptors }: {
  label: string
  rating: number
  teamAvg?: number
  descriptors: { level: number; label: string; description: string }[]
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums">
          <span className={cn('font-semibold', strengthColor(rating))}>{rating}/5</span>
          {teamAvg !== undefined && (
            <span className="text-muted-foreground ml-2 text-xs">(équipe: {teamAvg.toFixed(1)})</span>
          )}
        </span>
      </div>
      {descriptors.length > 0 && (
        <div className="ml-1 space-y-0.5">
          {[...descriptors]
            .sort((a, b) => a.level - b.level)
            .map((d, i) => {
              const acquired = d.level <= rating
              return (
                <div key={d.level} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 mt-0.5">
                    {i < descriptors.length - 1 ? '├─' : '└─'}
                  </span>
                  <span className={cn(
                    acquired ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60',
                  )}>
                    {acquired ? '✅' : '⬜'} Niveau {d.level}: {d.description}
                  </span>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

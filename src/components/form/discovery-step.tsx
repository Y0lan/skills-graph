import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import SkillRatingRow from './skill-rating-row'

interface SkillDef {
  id: string
  label: string
  categoryId: string
  descriptors: Array<{ level: number; label: string; description: string }>
}

interface CategoryDef {
  id: string
  label: string
  emoji: string
  skills: SkillDef[]
}

interface CategoryGroup {
  pole: string
  label: string
  categories: CategoryDef[]
}

interface DiscoveryStepProps {
  groups: CategoryGroup[]
  ratings: Record<string, number>
  declinedCategories: string[]
  onRate: (skillId: string, value: number) => void
  onDecline: (categoryId: string) => void
  onUndecline: (categoryId: string) => void
  onContinue: () => void
}

const poleColors: Record<string, string> = {
  legacy: 'text-[#EC8C32]',
  java_modernisation: 'text-[#1B6179]',
  fonctionnel: 'text-[#F0B800]',
  transverse: 'text-muted-foreground',
}

export default function DiscoveryStep({
  groups,
  ratings,
  declinedCategories,
  onRate,
  onDecline,
  onUndecline,
  onContinue,
}: DiscoveryStepProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  )
  const [checkedSkills, setCheckedSkills] = useState<Set<string>>(() => {
    // Pre-check skills that already have ratings > 0
    const alreadyRated = new Set<string>()
    for (const [skillId, value] of Object.entries(ratings)) {
      if (value > 0) alreadyRated.add(skillId)
    }
    return alreadyRated
  })

  const toggleExpand = useCallback(
    (categoryId: string) => {
      const isDeclined = declinedCategories.includes(categoryId)
      if (isDeclined) {
        onUndecline(categoryId)
      }
      setExpandedCategories((prev) => {
        const next = new Set(prev)
        if (next.has(categoryId)) {
          next.delete(categoryId)
        } else {
          next.add(categoryId)
        }
        return next
      })
    },
    [declinedCategories, onUndecline],
  )

  const handleDecline = useCallback(
    (e: React.MouseEvent, categoryId: string) => {
      e.stopPropagation()
      onDecline(categoryId)
      setExpandedCategories((prev) => {
        const next = new Set(prev)
        next.delete(categoryId)
        return next
      })
    },
    [onDecline],
  )

  const toggleSkillCheck = useCallback((skillId: string) => {
    setCheckedSkills((prev) => {
      const next = new Set(prev)
      if (next.has(skillId)) {
        next.delete(skillId)
      } else {
        next.add(skillId)
      }
      return next
    })
  }, [])

  const selectCategorySkills = useCallback((category: CategoryDef) => {
    onUndecline(category.id)
    setExpandedCategories((prev) => new Set([...prev, category.id]))
    setCheckedSkills((prev) => {
      const next = new Set(prev)
      for (const skill of category.skills) {
        next.add(skill.id)
      }
      return next
    })
  }, [onUndecline])

  const getRatedCountForCategory = useCallback(
    (category: CategoryDef): number => {
      return category.skills.filter(
        (s) => ratings[s.id] !== undefined && ratings[s.id] > 0,
      ).length
    },
    [ratings],
  )

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
      {groups.map((group) => (
        <div key={group.pole} className="space-y-3">
          <h2
            className={cn(
              'text-sm font-semibold uppercase tracking-wider',
              poleColors[group.pole] ?? 'text-muted-foreground',
            )}
          >
            {group.label}
          </h2>

          <div className="space-y-2">
            {group.categories.map((category) => {
              const isExpanded = expandedCategories.has(category.id)
              const isDeclined = declinedCategories.includes(category.id)
              const ratedCount = getRatedCountForCategory(category)
              const previewSkills = category.skills
                .slice(0, 3)
                .map((s) => s.label)
                .join(', ')

              return (
                <Card
                  key={category.id}
                  className={cn(
                    'transition-all duration-200',
                    isDeclined && 'opacity-50 bg-muted/30',
                  )}
                >
                  <CardContent>
                    <div className="flex w-full items-start gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        onClick={() => toggleExpand(category.id)}
                      >
                        <span className="mt-0.5 shrink-0 text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {category.label}
                            </span>
                            {ratedCount > 0 && (
                              <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary">
                                {ratedCount}
                              </span>
                            )}
                          </span>
                          {!isExpanded && (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {previewSkills}
                            </span>
                          )}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            selectCategorySkills(category)
                          }}
                        >
                          Tout noter
                        </Button>
                        {!isDeclined && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={(e) => handleDecline(e, category.id)}
                          >
                            Passer
                          </Button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 border-t pt-3">
                        <div className="space-y-3">
                          {category.skills.map((skill) => {
                            const isChecked = checkedSkills.has(skill.id)
                            const skillObj = {
                              id: skill.id,
                              label: skill.label,
                              categoryId: skill.categoryId,
                              descriptors: skill.descriptors,
                            }

                            return (
                              <div key={skill.id} className="space-y-2">
                                <button
                                  type="button"
                                  className="flex items-center gap-2 text-left"
                                  onClick={() => toggleSkillCheck(skill.id)}
                                >
                                  <span
                                    className={cn(
                                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                      isChecked
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border',
                                    )}
                                  >
                                    {isChecked && (
                                      <Check
                                        className="size-3"
                                        strokeWidth={3}
                                      />
                                    )}
                                  </span>
                                  <span className="text-sm">{skill.label}</span>
                                </button>

                                {isChecked && (
                                  <div className="ml-6">
                                    <SkillRatingRow
                                      skill={skillObj}
                                      value={ratings[skill.id]}
                                      onChange={(value) =>
                                        onRate(skill.id, value)
                                      }
                                    />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}

      <Button className="w-full" onClick={onContinue}>
        Continuer vers le r&eacute;capitulatif
      </Button>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTooltip, TooltipWithBounds } from '@visx/tooltip'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCatalog } from '@/hooks/use-catalog'
import { shortLabel } from '@/lib/utils'
import type { TeamMemberAggregateResponse } from '@/lib/types'

interface SkillHeatmapProps {
  members: TeamMemberAggregateResponse[]
}

interface TooltipData {
  member: string
  skill: string
  category: string
  value: number
}

function heatmapBg(value: number): string {
  if (value === 0) return 'bg-muted/20'
  if (value <= 1) return 'bg-red-500/30'
  if (value <= 2) return 'bg-orange-400/35'
  if (value <= 3) return 'bg-amber-400/35'
  if (value <= 4) return 'bg-emerald-400/30'
  return 'bg-emerald-500/40'
}

function heatmapText(value: number): string {
  if (value === 0) return 'text-muted-foreground/50'
  if (value <= 2) return 'text-red-300'
  if (value <= 3) return 'text-amber-300'
  return 'text-emerald-300'
}

export default function SkillHeatmap({ members }: SkillHeatmapProps) {
  const { categories } = useCatalog()

  const submitted = useMemo(
    () => members.filter((m) => m.submittedAt !== null),
    [members],
  )

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(categories.slice(0, 2).map((c) => c.id)),
  )

  const [sortSkillId, setSortSkillId] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>()

  // Sort members per-category: by specific skill column if clicked,
  // otherwise by category average (best first)
  const membersSortedByCategory = useMemo(() => {
    const result: Record<string, TeamMemberAggregateResponse[]> = {}
    for (const cat of categories) {
      const skillIds = cat.skills.map((s) => s.id)
      // Check if user clicked a skill in this category
      const activeSkillInCat = sortSkillId && skillIds.includes(sortSkillId) ? sortSkillId : null

      result[cat.id] = [...submitted].sort((a, b) => {
        if (activeSkillInCat) {
          const aVal = a.skillRatings?.[activeSkillInCat] ?? 0
          const bVal = b.skillRatings?.[activeSkillInCat] ?? 0
          return sortDir === 'desc' ? bVal - aVal : aVal - bVal
        }
        // Default: sort by category average, best first
        const aAvg = a.categoryAverages?.[cat.id] ?? 0
        const bAvg = b.categoryAverages?.[cat.id] ?? 0
        return bAvg - aAvg
      })
    }
    return result
  }, [submitted, categories, sortSkillId, sortDir])

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  const expandAll = () => setExpandedCategories(new Set(categories.map((c) => c.id)))
  const collapseAll = () => setExpandedCategories(new Set())

  const handleHeaderClick = (skillId: string) => {
    if (sortSkillId === skillId) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortSkillId(skillId)
      setSortDir('desc')
    }
  }

  if (submitted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-lg font-semibold">Aucune donnée</p>
        <p className="mt-2 text-muted-foreground">
          Les membres de l'équipe n'ont pas encore soumis leurs évaluations.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="font-medium">Échelle :</span>
          {[
            { label: '1', cls: 'bg-red-500/30' },
            { label: '2', cls: 'bg-orange-400/35' },
            { label: '3', cls: 'bg-amber-400/35' },
            { label: '4', cls: 'bg-emerald-400/30' },
            { label: '5', cls: 'bg-emerald-500/40' },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span className={`inline-block h-3 w-3 rounded-sm ${item.cls}`} />
              {item.label}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="text-xs text-muted-foreground hover:text-foreground">
            Tout déplier
          </button>
          <span className="text-xs text-muted-foreground">|</span>
          <button onClick={collapseAll} className="text-xs text-muted-foreground hover:text-foreground">
            Tout replier
          </button>
        </div>
      </div>

      {/* Category sections */}
      {categories.map((cat) => {
        const isExpanded = expandedCategories.has(cat.id)
        return (
          <div key={cat.id} className="rounded-lg border overflow-hidden">
            {/* Category header — always visible */}
            <button
              onClick={() => toggleCategory(cat.id)}
              className="flex w-full items-center gap-2 bg-muted/30 px-4 py-2.5 text-left text-sm font-semibold hover:bg-muted/50 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              {cat.label}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {cat.skills.length} compétences
              </span>
            </button>

            {/* Skill grid */}
            {isExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="sticky left-0 z-10 bg-background px-1.5 py-2 text-center font-medium text-muted-foreground w-8">
                        #
                      </th>
                      <th className="sticky left-[32px] z-10 bg-background px-3 py-2 text-left font-medium text-muted-foreground min-w-[140px]">
                        Membre
                      </th>
                      <th className="px-2 py-2 text-center font-medium text-muted-foreground min-w-[50px]">
                        Moy.
                      </th>
                      {cat.skills.map((skill) => {
                        const isActive = sortSkillId === skill.id
                        return (
                          <th
                            key={skill.id}
                            onClick={() => handleHeaderClick(skill.id)}
                            className={`cursor-pointer px-1 py-2 text-center font-medium min-w-[70px] max-w-[100px] transition-colors ${
                              isActive
                                ? 'text-primary bg-primary/5'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                            title={skill.label}
                          >
                            <span className="block leading-tight">
                              {shortLabel(skill.label)}
                            </span>
                            {isActive && (
                              <span className="text-[10px]">{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>
                            )}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(membersSortedByCategory[cat.id] ?? []).map((member, rowIdx) => (
                      <tr
                        key={member.slug}
                        className={rowIdx % 2 === 0 ? 'bg-muted/5' : ''}
                      >
                        <td className="sticky left-0 z-10 bg-background px-1.5 py-1.5 text-center text-muted-foreground tabular-nums">
                          {rowIdx + 1}
                        </td>
                        <td className="sticky left-[32px] z-10 bg-background px-3 py-1.5 font-medium whitespace-nowrap border-r">
                          <Link to={`/dashboard/${member.slug}`} className="hover:underline text-primary">
                            {member.name}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-xs border-r">
                          {(member.categoryAverages?.[cat.id] ?? 0).toFixed(1)}
                        </td>
                        {cat.skills.map((skill) => {
                          const value = member.skillRatings?.[skill.id] ?? 0
                          return (
                            <td key={skill.id} className="px-1 py-1.5 text-center">
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded ${heatmapBg(value)} ${heatmapText(value)} font-semibold tabular-nums cursor-default`}
                                onMouseEnter={(e) => {
                                  showTooltip({
                                    tooltipData: {
                                      member: member.name,
                                      skill: skill.label,
                                      category: cat.label,
                                      value,
                                    },
                                    tooltipLeft: e.clientX,
                                    tooltipTop: e.clientY,
                                  })
                                }}
                                onMouseLeave={() => hideTooltip()}
                              >
                                {value || '—'}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={{ position: 'fixed', pointerEvents: 'none', zIndex: 50 }}
          className="!rounded-md !border !border-border !bg-popover !px-3 !py-2 !text-sm !shadow-md"
        >
          <p className="mb-1 font-medium text-popover-foreground">
            {tooltipData.member}
          </p>
          <p className="text-muted-foreground">
            {tooltipData.skill}
          </p>
          <p className="mt-1 font-semibold text-popover-foreground">
            Niveau : {tooltipData.value || '—'} / 5
          </p>
        </TooltipWithBounds>
      )}
    </div>
  )
}

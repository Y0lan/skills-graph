import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, shortLabel } from '@/lib/utils'
import type { TeamCategoryAggregateResponse } from '@/lib/types'
import { useCatalog } from '@/hooks/use-catalog'

interface CategorySummaryCardsProps {
  categories: TeamCategoryAggregateResponse[]
  categoryTargets: Record<string, number>
}

/**
 * Bar color based on how the team average compares to the target.
 * Green if avg >= target, amber if within 1, red if gap > 1.
 */
function barColorClass(avg: number, target: number): string {
  const gap = target - avg
  if (gap <= 0) return 'bg-emerald-500 dark:bg-emerald-400'
  if (gap <= 1) return 'bg-amber-500 dark:bg-amber-400'
  return 'bg-red-500 dark:bg-red-400'
}

const strengthColor = (avg: number): string => {
  if (avg >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (avg >= 3) return 'text-sky-600 dark:text-sky-400'
  if (avg >= 2) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function barBgColorClass(avg: number): string {
  if (avg >= 4) return 'bg-emerald-500 dark:bg-emerald-400'
  if (avg >= 3) return 'bg-sky-500 dark:bg-sky-400'
  if (avg >= 2) return 'bg-amber-500 dark:bg-amber-400'
  return 'bg-red-500 dark:bg-red-400'
}

export default function CategorySummaryCards({
  categories,
  categoryTargets,
}: CategorySummaryCardsProps) {
  const { categories: skillCategories } = useCatalog()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (catId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Synthèse par catégorie</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Moy.</TableHead>
                <TableHead className="text-right">Objectif</TableHead>
                <TableHead className="text-right">Min / Max</TableHead>
                <TableHead className="w-40">Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => {
                const catInfo = skillCategories.find((c) => c.id === cat.categoryId)
                const skills = catInfo?.skills ?? []
                const target = categoryTargets[cat.categoryId] ?? 3
                const avgPct = Math.min((cat.teamAvgRank / 5) * 100, 100)
                const targetPct = Math.min((target / 5) * 100, 100)

                return (
                  <React.Fragment key={cat.categoryId}>
                  <TableRow>
                    <TableCell>
                      <button
                        onClick={() => toggle(cat.categoryId)}
                        className="flex items-center gap-1.5 font-medium text-left hover:text-primary"
                      >
                        <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', expanded.has(cat.categoryId) && 'rotate-90')} />
                        {cat.categoryLabel}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-bold tabular-nums ${strengthColor(cat.teamAvgRank)}`}>
                        {cat.teamAvgRank.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {target.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cat.minRank.toFixed(1)} — {cat.maxRank.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <div className="relative h-4 w-full overflow-visible rounded bg-secondary">
                        <div
                          className={`h-full rounded transition-all ${barColorClass(cat.teamAvgRank, target)}`}
                          style={{ width: `${avgPct}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2"
                          style={{ left: `${targetPct}%` }}
                        >
                          <div className="relative -ml-px h-6 w-1 rounded-sm bg-foreground/60 border border-background" />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded.has(cat.categoryId) && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30 px-6 py-3">
                        <div className="space-y-1.5">
                          {skills.map(skill => {
                            const avg = cat.skillAverages[skill.id] ?? 0
                            const pct = (avg / 5) * 100
                            return (
                              <div key={skill.id} className="flex items-center gap-3 text-sm">
                                <span className="w-40 truncate text-muted-foreground">{shortLabel(skill.label)}</span>
                                <div className="h-3 flex-1 overflow-hidden rounded bg-secondary">
                                  <div className={cn('h-full rounded', barBgColorClass(avg))} style={{ width: `${pct}%` }} />
                                </div>
                                <span className={cn('w-10 text-right tabular-nums text-xs font-semibold', strengthColor(avg))}>
                                  {avg.toFixed(1)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </React.Fragment>
                )
              })}
            </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

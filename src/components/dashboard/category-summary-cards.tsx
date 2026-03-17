import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Info } from 'lucide-react'
import type { TeamCategoryAggregateResponse } from '@/lib/types'
import { useCatalog } from '@/hooks/use-catalog'

interface CategorySummaryCardsProps {
  categories: TeamCategoryAggregateResponse[]
  categoryTargets: Record<string, number>
  onFindExpert?: (categoryId: string) => void
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

export default function CategorySummaryCards({
  categories,
  categoryTargets,
  onFindExpert,
}: CategorySummaryCardsProps) {
  const { categories: skillCategories } = useCatalog()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Synthèse par catégorie</CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Moy.</TableHead>
                <TableHead className="text-right">Objectif</TableHead>
                <TableHead className="text-right">Min / Max</TableHead>
                <TableHead className="w-32">Distribution</TableHead>
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
                  <TableRow key={cat.categoryId}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {onFindExpert ? (
                          <button
                            onClick={() => onFindExpert(cat.categoryId)}
                            className="font-medium text-left hover:text-primary hover:underline"
                          >
                            {cat.categoryLabel}
                          </button>
                        ) : (
                          <span className="font-medium">{cat.categoryLabel}</span>
                        )}
                        <Tooltip>
                          <TooltipTrigger className="rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground">
                            <Info className="h-3 w-3" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" align="start" className="max-w-xs">
                            <ul className="space-y-0.5">
                              {skills.map((s) => (
                                <li key={s.id}>{s.label}</li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      </div>
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
                      <div className="relative h-1.5 w-full overflow-visible rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full transition-all ${barColorClass(cat.teamAvgRank, target)}`}
                          style={{ width: `${avgPct}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2"
                          style={{ left: `${targetPct}%` }}
                        >
                          <div className="relative -ml-px h-3 w-0.5 rounded-full bg-foreground/70" />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}

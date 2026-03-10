import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Info } from 'lucide-react'
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

export default function CategorySummaryCards({
  categories,
  categoryTargets,
}: CategorySummaryCardsProps) {
  const { categories: skillCategories } = useCatalog()
  return (
    <TooltipProvider>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((cat) => {
        const catInfo = skillCategories.find((c) => c.id === cat.categoryId)
        const emoji = catInfo?.emoji ?? ''
        const skills = catInfo?.skills ?? []
        const target = categoryTargets[cat.categoryId] ?? 3
        const avgPct = Math.min((cat.teamAvgRank / 5) * 100, 100)
        const targetPct = Math.min((target / 5) * 100, 100)

        return (
          <Card key={cat.categoryId} className="overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-accent/30 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {emoji} {cat.categoryLabel}
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger className="rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-xs">
                    <ul className="space-y-0.5">
                      {skills.map((s) => (
                        <li key={s.id}>{s.label}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Moyenne équipe</span>
                <span
                  className={`text-lg font-bold tabular-nums ${strengthColor(cat.teamAvgRank)}`}
                >
                  {cat.teamAvgRank.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Objectif</span>
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {target.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Min / Max</span>
                <span className="font-medium tabular-nums">
                  {cat.minRank.toFixed(1)} — {cat.maxRank.toFixed(1)}
                </span>
              </div>
              {/* Distribution bar with target marker */}
              <div className="space-y-1">
                <div className="relative h-2 w-full overflow-visible rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all ${barColorClass(cat.teamAvgRank, target)}`}
                    style={{ width: `${avgPct}%` }}
                  />
                  {/* Target marker — thin vertical line */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{ left: `${targetPct}%` }}
                  >
                    <div className="relative -ml-px h-4 w-0.5 rounded-full bg-foreground/70" />
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0</span>
                  <span>5</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
    </TooltipProvider>
  )
}

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { TeamCategoryAggregateResponse, TeamMemberAggregateResponse } from '@/lib/types'

interface SkillsAtRiskProps {
  members: TeamMemberAggregateResponse[]
  categories: TeamCategoryAggregateResponse[]
  /** Pôle filter to scope which members count as experts. Null/all = whole team. */
  poleFilter?: string | null
  /** Threshold above which a rating counts as "expert". Default 4 (out of 5). */
  expertThreshold?: number
  onFindExpert?: (categoryId: string) => void
}

/**
 * Shows categories where the team has a single-point-of-failure:
 * 0 or 1 members at the expert threshold (default ≥ 4/5). The recruiter's
 * recruiting-priority list, with the categories where bus-factor is critical.
 *
 * If everything has 2+ experts, the section hides itself rather than printing
 * a "all clear" card — UI clutter for the most-common case.
 */
export default function SkillsAtRisk({
  members,
  categories,
  poleFilter,
  expertThreshold = 4,
  onFindExpert,
}: SkillsAtRiskProps) {
  const risks = useMemo(() => {
    const scoped = poleFilter && poleFilter !== 'all'
      ? members.filter(m => m.pole === poleFilter)
      : members
    return categories
      .map(cat => {
        const expertCount = scoped.filter(
          m => (m.categoryAverages[cat.categoryId] ?? 0) >= expertThreshold,
        ).length
        return {
          categoryId: cat.categoryId,
          categoryLabel: cat.categoryLabel,
          targetRank: cat.targetRank,
          teamAvgRank: cat.teamAvgRank,
          expertCount,
        }
      })
      .filter(r => r.expertCount <= 1 && r.targetRank >= expertThreshold)
      .sort((a, b) => {
        if (a.expertCount !== b.expertCount) return a.expertCount - b.expertCount
        return b.targetRank - a.targetRank
      })
  }, [members, categories, poleFilter, expertThreshold])

  if (risks.length === 0) return null

  return (
    <Card className="border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/15 dark:border-amber-900/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Compétences à risque
          <Badge variant="outline" className="ml-1 text-[10px]">{risks.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Catégories ciblées au moins à {expertThreshold}/5 mais où moins de 2 personnes atteignent ce niveau.
          Couverture critique — un départ et le savoir-faire disparaît.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          {risks.slice(0, 8).map(r => (
            <li key={r.categoryId} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate" title={r.categoryLabel}>{r.categoryLabel}</span>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  className={
                    r.expertCount === 0
                      ? 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40 text-[10px]'
                      : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[10px]'
                  }
                >
                  {r.expertCount} expert{r.expertCount !== 1 ? 's' : ''}
                </Badge>
                {onFindExpert && r.expertCount > 0 && (
                  <button
                    onClick={() => onFindExpert(r.categoryId)}
                    className="text-xs text-primary hover:underline whitespace-nowrap font-medium"
                    aria-label={`Voir l'expert pour ${r.categoryLabel}`}
                  >
                    voir →
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

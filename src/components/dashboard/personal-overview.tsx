import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import VisxRadarChart from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import { shortLabel } from '@/lib/utils'
import type { MemberAggregateResponse, TeamMemberAggregateResponse } from '@/lib/types'

interface PersonalOverviewProps {
  aggregate: MemberAggregateResponse & { hasRatings?: boolean }
  teamMembers?: TeamMemberAggregateResponse[]
  onFindExpert?: (categoryId: string) => void
}

export default function PersonalOverview({ aggregate, teamMembers, onFindExpert }: PersonalOverviewProps) {
  const { memberId, memberName, submittedAt, categories, topGaps, topStrengths } = aggregate
  const hasRatings = aggregate.hasRatings ?? categories.some((c) => c.avgRank > 0)
  const [view, setView] = useChartView()
  const [compareSlug, setCompareSlug] = useState<string | null>(null)

  // Empty state: no ratings at all
  if (!hasRatings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Votre profil — {memberName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-lg font-semibold">Aucune évaluation soumise</p>
            <p className="mt-2 text-muted-foreground">
              Commencez votre auto-évaluation pour voir votre radar personnel.
            </p>
            <Link
              to={`/form/${memberId}`}
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Démarrer l'évaluation
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isDraft = !submittedAt

  const data = categories.map((cat) => ({
    label: shortLabel(cat.categoryLabel),
    value: cat.avgRank,
    fullMark: 5,
  }))

  const compareTarget = compareSlug
    ? teamMembers?.find(m => m.slug === compareSlug)
    : null

  const overlayData = categories.map((cat) => ({
    label: shortLabel(cat.categoryLabel),
    value: compareTarget
      ? (compareTarget.categoryAverages[cat.categoryId] ?? 0)
      : cat.teamAvgRank,
    fullMark: 5,
  }))

  const overlayLabel = compareTarget ? compareTarget.name : 'Moyenne équipe'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>Votre profil — {memberName}</CardTitle>
            {isDraft && (
              <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                Brouillon
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {teamMembers && teamMembers.length > 0 && (
              <Select value={compareSlug ?? ''} onValueChange={(v) => setCompareSlug(v || null)}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Comparer avec : Moyenne équipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Moyenne équipe</SelectItem>
                  {teamMembers.filter(m => m.slug !== memberId && m.submittedAt).map(m => (
                    <SelectItem key={m.slug} value={m.slug}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ChartViewToggle view={view} onChange={setView} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Deterministic + LLM summary block */}
        {topStrengths && topStrengths.length > 0 && (
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-1">
            {aggregate.profileSummary && (
              <p className="text-muted-foreground italic">{aggregate.profileSummary}</p>
            )}
            <p>
              <span className="font-semibold text-green-600 dark:text-green-400">Points forts</span>
              {' : '}{topStrengths.map(s => shortLabel(s.categoryLabel)).join(', ')}.
            </p>
            {topGaps.length > 0 && (
              <p>
                <span className="font-semibold text-red-500 dark:text-red-400">Axes d'amélioration</span>
                {' : '}{topGaps.map(g => shortLabel(g.categoryLabel)).join(', ')}.
              </p>
            )}
          </div>
        )}

        {view === 'radar' ? (
          <VisxRadarChart
            data={data}
            overlay={overlayData}
            height={400}
            primaryLabel="Vous"
            overlayLabel={overlayLabel}
            showOverlayToggle
            showExport
          />
        ) : (
          <BarComparisonChart
            data={data}
            overlay={overlayData}
            primaryLabel="Vous"
            overlayLabel={overlayLabel}
          />
        )}

        {topGaps.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Principaux écarts vs cible
            </h3>
            <div className="space-y-2">
              {topGaps.map((gap) => (
                <div
                  key={gap.categoryId}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-medium">{gap.categoryLabel}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Actuel : <span className="font-semibold tabular-nums">{gap.avgRank.toFixed(1)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Cible : <span className="font-semibold tabular-nums">{gap.targetRank}</span>
                    </span>
                    <span className="font-semibold tabular-nums text-red-500">
                      -{gap.gap.toFixed(1)}
                    </span>
                    {onFindExpert && (
                      <button
                        onClick={() => onFindExpert(gap.categoryId)}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Trouver un expert →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isDraft && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            Votre évaluation n'a pas encore été soumise.{' '}
            <Link
              to={`/form/${memberId}`}
              className="font-medium underline hover:no-underline"
            >
              Reprendre l'évaluation
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

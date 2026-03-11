import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import VisxRadarChart from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import type { MemberAggregateResponse } from '@/lib/types'

interface PersonalOverviewProps {
  aggregate: MemberAggregateResponse & { hasRatings?: boolean }
}

export default function PersonalOverview({ aggregate }: PersonalOverviewProps) {
  const { memberId, memberName, submittedAt, categories, topGaps } = aggregate
  const hasRatings = aggregate.hasRatings ?? categories.some((c) => c.avgRank > 0)
  const [view, setView] = useChartView()

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
    label: cat.categoryLabel.replace(/\s*\(.*\)$/, ''),
    value: cat.avgRank,
    fullMark: 5,
  }))

  const overlayData = categories.map((cat) => ({
    label: cat.categoryLabel.replace(/\s*\(.*\)$/, ''),
    value: cat.teamAvgRank,
    fullMark: 5,
  }))

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
          <ChartViewToggle view={view} onChange={setView} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {view === 'radar' ? (
          <VisxRadarChart
            data={data}
            overlay={overlayData}
            height={400}
            primaryLabel="Vous"
            overlayLabel="Moyenne équipe"
            showOverlayToggle
            showExport
          />
        ) : (
          <BarComparisonChart
            data={data}
            overlay={overlayData}
            primaryLabel="Vous"
            overlayLabel="Moyenne équipe"
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

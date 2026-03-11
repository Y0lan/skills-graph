import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import VisxRadarChart from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import { useCatalog } from '@/hooks/use-catalog'
import type { TeamCategoryAggregateResponse } from '@/lib/types'

interface TeamOverviewProps {
  categories: TeamCategoryAggregateResponse[]
  teamSize: number
  submittedCount: number
}

export default function TeamOverview({
  categories,
  teamSize,
  submittedCount,
}: TeamOverviewProps) {
  const { categories: skillCategories } = useCatalog()
  const [view, setView] = useChartView()

  const data = skillCategories.map((cat) => {
    const agg = categories.find((c) => c.categoryId === cat.id)
    return {
      label: cat.label.replace(/\s*\(.*\)$/, ''),
      value: agg?.teamAvgRank ?? 0,
      fullMark: 5,
    }
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Vue d'ensemble de l'équipe</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {submittedCount}/{teamSize} évaluations soumises
            </span>
            <ChartViewToggle view={view} onChange={setView} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === 'radar' ? (
          <VisxRadarChart data={data} height={400} />
        ) : (
          <BarComparisonChart data={data} />
        )}
      </CardContent>
    </Card>
  )
}

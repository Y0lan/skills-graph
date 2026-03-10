import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import RadarChart from '@/components/radar-chart'
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
  const data = skillCategories.map((cat) => {
    const agg = categories.find((c) => c.categoryId === cat.id)
    return {
      label: `${cat.emoji} ${cat.label}`,
      value: agg?.teamAvgRank ?? 0,
      fullMark: 5,
    }
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Vue d'ensemble de l'équipe</CardTitle>
          <span className="text-sm text-muted-foreground">
            {submittedCount}/{teamSize} évaluations soumises
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <RadarChart data={data} height={400} />
      </CardContent>
    </Card>
  )
}

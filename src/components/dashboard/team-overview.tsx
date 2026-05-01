import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import VisxRadarChart from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import { useCatalog } from '@/hooks/use-catalog'
import { shortLabel } from '@/lib/utils'
import { usePoleMappings, buildPoleLayout } from '@/lib/pole-segments'
import type { TeamCategoryAggregateResponse } from '@/lib/types'

interface TeamOverviewProps {
  categories: TeamCategoryAggregateResponse[]
  teamSize: number
  submittedCount: number
  poleFilter?: string | null
}

export default function TeamOverview({
  categories,
  teamSize,
  submittedCount,
  poleFilter,
}: TeamOverviewProps) {
  const { categories: skillCategories } = useCatalog()
  const [view, setView] = useChartView()
  const poleMappings = usePoleMappings()

  const { data, segments } = useMemo(() => {
    const mappings = poleMappings ?? {}

    if (poleFilter) {
      // Single pole selected — no segments, just show that pole's categories.
      const poleCatIds = new Set(mappings[poleFilter] ?? [])
      const filtered = skillCategories.filter(cat => poleCatIds.has(cat.id))
      return {
        data: filtered.map(cat => {
          const agg = categories.find(c => c.categoryId === cat.id)
          return { label: shortLabel(cat.label), value: agg?.teamAvgRank ?? 0, fullMark: 5 }
        }),
        segments: undefined,
      }
    }

    // "Tous les pôles" — sort by pole group and build colored segments via shared helper.
    const layout = buildPoleLayout(categories.map(c => c.categoryId), poleMappings)
    const byId = new Map(skillCategories.map(c => [c.id, c]))
    const sortedData = layout.order
      .map(id => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .map(cat => {
        const agg = categories.find(c => c.categoryId === cat.id)
        return { label: shortLabel(cat.label), value: agg?.teamAvgRank ?? 0, fullMark: 5 }
      })

    return { data: sortedData, segments: layout.segments }
  }, [poleFilter, skillCategories, categories, poleMappings])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Vue d'ensemble de l'équipe</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {submittedCount}/{teamSize} évaluations complètes
            </span>
            <ChartViewToggle view={view} onChange={setView} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Pole legend when showing all poles */}
        {!poleFilter && segments && (
          <div className="flex items-center justify-center gap-4 mb-3">
            {segments.map(seg => (
              <div key={seg.label} className="flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-muted-foreground">{seg.label}</span>
              </div>
            ))}
          </div>
        )}
        {view === 'radar' ? (
          <VisxRadarChart data={data} height={400} segments={segments} />
        ) : (
          <BarComparisonChart data={data} />
        )}
      </CardContent>
    </Card>
  )
}

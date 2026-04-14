import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarSegment } from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import { useCatalog } from '@/hooks/use-catalog'
import { shortLabel } from '@/lib/utils'
import { POLE_CATEGORY_IDS, POLE_HEX, POLE_LABELS } from '@/lib/constants'
import type { TeamCategoryAggregateResponse } from '@/lib/types'

interface TeamOverviewProps {
  categories: TeamCategoryAggregateResponse[]
  teamSize: number
  submittedCount: number
  poleFilter?: string | null
}

/** Order in which poles appear on the radar when "Tous les pôles" is selected */
const POLE_ORDER = ['java_modernisation', 'fonctionnel', 'legacy'] as const

export default function TeamOverview({
  categories,
  teamSize,
  submittedCount,
  poleFilter,
}: TeamOverviewProps) {
  const { categories: skillCategories } = useCatalog()
  const [view, setView] = useChartView()

  const { data, segments } = useMemo(() => {
    if (poleFilter) {
      // Single pole selected — no segments, just show pole categories
      const poleCatIds = new Set(POLE_CATEGORY_IDS[poleFilter] ?? [])
      const filtered = skillCategories.filter(cat => poleCatIds.has(cat.id))
      return {
        data: filtered.map(cat => {
          const agg = categories.find(c => c.categoryId === cat.id)
          return { label: shortLabel(cat.label), value: agg?.teamAvgRank ?? 0, fullMark: 5 }
        }),
        segments: undefined,
      }
    }

    // "Tous les pôles" — sort by pole group and build colored segments
    const allCatIds = new Set(categories.map(c => c.categoryId))
    // Assign each category to its primary pole (first pole that claims it, in POLE_ORDER)
    const catToPole = new Map<string, string>()
    const usedCats = new Set<string>()

    for (const pole of POLE_ORDER) {
      for (const catId of POLE_CATEGORY_IDS[pole] ?? []) {
        if (allCatIds.has(catId) && !usedCats.has(catId)) {
          catToPole.set(catId, pole)
          usedCats.add(catId)
        }
      }
    }
    // Any remaining categories not in any pole
    for (const cat of skillCategories) {
      if (allCatIds.has(cat.id) && !usedCats.has(cat.id)) {
        catToPole.set(cat.id, '__other')
        usedCats.add(cat.id)
      }
    }

    // Sort categories by pole group
    const sorted = [...skillCategories]
      .filter(cat => allCatIds.has(cat.id))
      .sort((a, b) => {
        const pa = catToPole.get(a.id) ?? '__other'
        const pb = catToPole.get(b.id) ?? '__other'
        const ia = POLE_ORDER.indexOf(pa as typeof POLE_ORDER[number])
        const ib = POLE_ORDER.indexOf(pb as typeof POLE_ORDER[number])
        const oa = ia >= 0 ? ia : POLE_ORDER.length
        const ob = ib >= 0 ? ib : POLE_ORDER.length
        return oa - ob
      })

    const sortedData = sorted.map(cat => {
      const agg = categories.find(c => c.categoryId === cat.id)
      return { label: shortLabel(cat.label), value: agg?.teamAvgRank ?? 0, fullMark: 5 }
    })

    // Build segments from consecutive runs of the same pole
    const segs: RadarSegment[] = []
    let segStart = 0
    let currentPole = catToPole.get(sorted[0]?.id) ?? '__other'

    for (let i = 1; i <= sorted.length; i++) {
      const pole = i < sorted.length ? (catToPole.get(sorted[i].id) ?? '__other') : '__done'
      if (pole !== currentPole) {
        if (currentPole !== '__other' && POLE_HEX[currentPole]) {
          segs.push({
            from: segStart,
            to: i,
            color: POLE_HEX[currentPole],
            label: POLE_LABELS[currentPole] ?? currentPole,
          })
        }
        segStart = i
        currentPole = pole
      }
    }

    return { data: sortedData, segments: segs.length > 0 ? segs : undefined }
  }, [poleFilter, skillCategories, categories])

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

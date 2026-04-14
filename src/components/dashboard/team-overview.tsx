import { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarSegment } from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import { useCatalog } from '@/hooks/use-catalog'
import { shortLabel } from '@/lib/utils'
import { POLE_HEX, POLE_LABELS } from '@/lib/constants'
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

  // Fetch pole→category mappings from API
  const [poleMappings, setPoleMappings] = useState<Record<string, string[]> | null>(null)
  useEffect(() => {
    fetch('/api/catalog/pole-mappings')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPoleMappings(d) })
      .catch(() => {})
  }, [])

  const { data, segments } = useMemo(() => {
    const POLE_CATEGORY_IDS = poleMappings ?? {}

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

    // Determine which categories are exclusive to one pole vs shared/transverse
    // A category is "exclusive" if it belongs to exactly one pole
    // Shared categories (in 2+ poles) go to __transverse
    const catToPole = new Map<string, string>()
    const usedCats = new Set<string>()

    // First pass: find exclusive categories per pole (in POLE_ORDER)
    for (const pole of POLE_ORDER) {
      for (const catId of POLE_CATEGORY_IDS[pole] ?? []) {
        if (!allCatIds.has(catId) || usedCats.has(catId)) continue
        // Check if this category is exclusive to this pole
        const poles = Object.entries(POLE_CATEGORY_IDS)
          .filter(([, ids]) => ids.includes(catId))
          .map(([p]) => p)
        if (poles.length === 1) {
          catToPole.set(catId, pole)
          usedCats.add(catId)
        }
      }
    }
    // Second pass: shared categories (in 2+ poles) → transverse
    for (const pole of POLE_ORDER) {
      for (const catId of POLE_CATEGORY_IDS[pole] ?? []) {
        if (!allCatIds.has(catId) || usedCats.has(catId)) continue
        catToPole.set(catId, '__transverse')
        usedCats.add(catId)
      }
    }
    // Remaining categories not in any pole → transverse
    for (const cat of skillCategories) {
      if (allCatIds.has(cat.id) && !usedCats.has(cat.id)) {
        catToPole.set(cat.id, '__transverse')
        usedCats.add(cat.id)
      }
    }

    // Sort: pole-exclusive categories grouped together, transverse at the end
    const groupOrder = [...POLE_ORDER, '__transverse'] as const
    const sorted = [...skillCategories]
      .filter(cat => allCatIds.has(cat.id))
      .sort((a, b) => {
        const pa = catToPole.get(a.id) ?? '__transverse'
        const pb = catToPole.get(b.id) ?? '__transverse'
        const oa = groupOrder.indexOf(pa as typeof groupOrder[number])
        const ob = groupOrder.indexOf(pb as typeof groupOrder[number])
        return (oa >= 0 ? oa : groupOrder.length) - (ob >= 0 ? ob : groupOrder.length)
      })

    const sortedData = sorted.map(cat => {
      const agg = categories.find(c => c.categoryId === cat.id)
      return { label: shortLabel(cat.label), value: agg?.teamAvgRank ?? 0, fullMark: 5 }
    })

    // Build segments from consecutive runs of the same pole
    const segs: RadarSegment[] = []
    let segStart = 0
    let currentPole = catToPole.get(sorted[0]?.id) ?? '__transverse'

    for (let i = 1; i <= sorted.length; i++) {
      const pole = i < sorted.length ? (catToPole.get(sorted[i].id) ?? '__transverse') : '__done'
      if (pole !== currentPole) {
        if (POLE_HEX[currentPole]) {
          segs.push({
            from: segStart,
            to: i,
            color: POLE_HEX[currentPole],
            label: currentPole === '__transverse' ? 'Transverse' : (POLE_LABELS[currentPole] ?? currentPole),
          })
        }
        segStart = i
        currentPole = pole
      }
    }

    return { data: sortedData, segments: segs.length > 0 ? segs : undefined }
  }, [poleFilter, skillCategories, categories, poleMappings])

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

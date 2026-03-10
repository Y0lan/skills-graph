import { useState, useRef, useCallback } from 'react'
import {
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useCurrentPng } from 'recharts-to-png'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface RadarDataPoint {
  label: string
  value: number
  fullMark: number
}

interface RadarChartProps {
  data: RadarDataPoint[]
  overlay?: RadarDataPoint[]
  height?: number
  compact?: boolean
  /** Label for the primary series */
  primaryLabel?: string
  /** Label for the overlay series */
  overlayLabel?: string
  /** Whether to show a toggle for the overlay */
  showOverlayToggle?: boolean
  /** Whether to show export buttons */
  showExport?: boolean
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function CustomTooltip({ active, payload, primaryLabel, overlayLabel }: any) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0]?.payload
  if (!data) return null

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{data.label}</p>
      {data.value !== undefined && (
        <p className="text-muted-foreground">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--color-chart-1)' }}
          />
          {primaryLabel ?? 'Score'} : <span className="font-semibold text-popover-foreground">{data.value.toFixed(1)}</span>
        </p>
      )}
      {data.overlay !== undefined && data.overlay !== null && (
        <p className="text-muted-foreground">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--color-chart-3)' }}
          />
          {overlayLabel ?? 'Moyenne équipe'} : <span className="font-semibold text-popover-foreground">{data.overlay.toFixed(1)}</span>
        </p>
      )}
    </div>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function RadarChart({
  data,
  overlay,
  height = 350,
  compact = false,
  primaryLabel,
  overlayLabel,
  showOverlayToggle = false,
  showExport = false,
}: RadarChartProps) {
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [getPng, { ref: pngRef }] = useCurrentPng()
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // T045: PNG export
  const handlePngExport = useCallback(async () => {
    const png = await getPng()
    if (png) {
      const a = document.createElement('a')
      a.href = png
      a.download = 'radar-chart.png'
      a.click()
    }
  }, [getPng])

  // T046: SVG export
  const handleSvgExport = useCallback(() => {
    const container = chartContainerRef.current
    if (!container) return
    const svg = container.querySelector('svg')
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'radar-chart.svg'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // Merge data and overlay into one array for Recharts
  const merged = data.map((d, i) => ({
    label: d.label,
    value: d.value,
    overlay: overlay && overlayVisible ? (overlay[i]?.value ?? undefined) : undefined,
    fullMark: d.fullMark,
  }))

  const hasOverlay = overlay && overlay.length > 0

  return (
    <div ref={chartContainerRef}>
      <div className="mb-2 flex items-center justify-between">
        {showOverlayToggle && hasOverlay ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={overlayVisible}
              onChange={(e) => setOverlayVisible(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[var(--color-chart-3)]"
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: 'var(--color-chart-3)' }}
            />
            {overlayLabel ?? 'Moyenne équipe'}
          </label>
        ) : (
          <div />
        )}
        {showExport && !compact && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handlePngExport} className="gap-1.5 text-xs">
              <Download className="h-3 w-3" />
              PNG
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSvgExport} className="gap-1.5 text-xs">
              <Download className="h-3 w-3" />
              SVG
            </Button>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height} ref={pngRef}>
        <RechartsRadarChart data={merged} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="var(--color-border)" strokeOpacity={0.6} />
          <PolarAngleAxis
            dataKey="label"
            tick={{
              fontSize: compact ? 9 : 11,
              fill: 'var(--color-muted-foreground)',
            }}
          />
          <PolarRadiusAxis
            domain={[0, 5]}
            tickCount={6}
            tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
            axisLine={false}
          />
          <Radar
            name={primaryLabel ?? 'Moyenne équipe'}
            dataKey="value"
            stroke="var(--color-chart-1)"
            fill="var(--color-chart-1)"
            fillOpacity={0.35}
            strokeWidth={2.5}
          />
          {hasOverlay && overlayVisible && (
            <Radar
              name={overlayLabel ?? 'Vous'}
              dataKey="overlay"
              stroke="var(--color-chart-3)"
              fill="var(--color-chart-3)"
              fillOpacity={0.25}
              strokeWidth={2.5}
              strokeDasharray="5 5"
            />
          )}
          {!compact && (
            <Tooltip
              content={
                <CustomTooltip
                  primaryLabel={primaryLabel}
                  overlayLabel={overlayLabel}
                />
              }
            />
          )}
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  )
}

import { useState, useRef, useCallback, useMemo } from 'react'
import { Group } from '@visx/group'
import { scaleLinear } from '@visx/scale'
import { Point } from '@visx/point'
import { Line, LineRadial } from '@visx/shape'
import { Text } from '@visx/text'
import { useTooltip, TooltipWithBounds } from '@visx/tooltip'
import { ParentSize } from '@visx/responsive'
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
  primaryLabel?: string
  overlayLabel?: string
  showOverlayToggle?: boolean
  showExport?: boolean
}

interface TooltipData {
  label: string
  value: number
  overlay?: number
}

const LEVELS = 5
const MAX_VALUE = 5

function getAngleSlice(count: number) {
  return (Math.PI * 2) / count
}

function polarToCartesian(angle: number, radius: number): Point {
  return new Point({
    x: radius * Math.cos(angle - Math.PI / 2),
    y: radius * Math.sin(angle - Math.PI / 2),
  })
}

function getTextAnchor(angle: number): 'start' | 'middle' | 'end' {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  if (a < 0.15 || a > Math.PI * 2 - 0.15) return 'middle'
  if (Math.abs(a - Math.PI) < 0.15) return 'middle'
  if (a > Math.PI) return 'end'
  return 'start'
}

function getVerticalAnchor(angle: number): 'start' | 'middle' | 'end' {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  if (a < 0.4) return 'end'
  if (a > Math.PI * 2 - 0.4) return 'end'
  if (Math.abs(a - Math.PI) < 0.4) return 'start'
  return 'middle'
}

export default function VisxRadarChart({
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
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartSvgRef = useRef<HTMLDivElement>(null)
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>()

  const hasOverlay = overlay && overlay.length > 0

  const handlePngExport = useCallback(() => {
    const container = chartSvgRef.current
    if (!container) return
    const svg = container.querySelector('svg')
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = 'radar-chart.png'
      a.click()
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [])

  const handleSvgExport = useCallback(() => {
    const container = chartSvgRef.current
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

  return (
    <div ref={chartContainerRef} className="w-full" style={{ position: 'relative' }}>
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
      <div ref={chartSvgRef} className="w-full" style={{ height }}>
        <ParentSize>
          {({ width: parentWidth }) => (
            <RadarSvg
              data={data}
              overlay={hasOverlay && overlayVisible ? overlay : undefined}
              width={parentWidth}
              height={height}
              compact={compact}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
            />
          )}
        </ParentSize>
      </div>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={{ position: 'fixed', pointerEvents: 'none' }}
          className="!rounded-md !border !border-border !bg-popover !px-3 !py-2 !text-sm !shadow-md"
        >
          <p className="mb-1 font-medium text-popover-foreground">
            {tooltipData.label}
          </p>
          <p className="text-muted-foreground">
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: 'var(--color-chart-1)' }}
            />
            {primaryLabel ?? 'Score'} :{' '}
            <span className="font-semibold text-popover-foreground">
              {tooltipData.value.toFixed(1)}
            </span>
          </p>
          {tooltipData.overlay !== undefined && (
            <p className="text-muted-foreground">
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: 'var(--color-chart-3)' }}
              />
              {overlayLabel ?? 'Moyenne équipe'} :{' '}
              <span className="font-semibold text-popover-foreground">
                {tooltipData.overlay.toFixed(1)}
              </span>
            </p>
          )}
        </TooltipWithBounds>
      )}
    </div>
  )
}

function RadarSvg({
  data,
  overlay,
  width,
  height,
  compact,
  showTooltip,
  hideTooltip,
}: {
  data: RadarDataPoint[]
  overlay?: RadarDataPoint[]
  width: number
  height: number
  compact: boolean
  showTooltip?: (args: { tooltipData: TooltipData; tooltipLeft: number; tooltipTop: number }) => void
  hideTooltip?: () => void
}) {
  const numAxes = data.length
  const angleSlice = getAngleSlice(numAxes)

  // Adaptive sizing based on mode
  const labelWidth = compact ? 50 : 110
  const labelMargin = compact ? 14 : 24
  // Reserve more outer space for long wrapped labels
  const outerMargin = compact ? 40 : 80
  const maxRadius = Math.max(Math.min(width, height) / 2 - outerMargin, 20)

  const radiusScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, MAX_VALUE],
        range: [0, maxRadius],
      }),
    [maxRadius],
  )

  const cx = width / 2
  const cy = height / 2

  const gridCircles = Array.from({ length: LEVELS }, (_, i) => i + 1)

  // Data polygon
  const dataPoints = data.map((d, i) => {
    const angle = angleSlice * i
    const r = radiusScale(Math.min(d.value, MAX_VALUE))
    return polarToCartesian(angle, r)
  })
  const dataPath = dataPoints.map((p) => `${cx + p.x},${cy + p.y}`).join(' ')

  // Overlay polygon
  const overlayPoints = overlay
    ? overlay.map((d, i) => {
        const angle = angleSlice * i
        const r = radiusScale(Math.min(d.value, MAX_VALUE))
        return polarToCartesian(angle, r)
      })
    : null
  const overlayPath = overlayPoints
    ? overlayPoints.map((p) => `${cx + p.x},${cy + p.y}`).join(' ')
    : null

  if (width <= 0 || height <= 0) return null

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Graphique radar avec ${numAxes} axes`}
    >
      <Group top={cy} left={cx}>
        {/* Concentric grid rings */}
        {gridCircles.map((level) => (
          <LineRadial
            key={level}
            data={Array.from({ length: numAxes + 1 }, (_, i) => [
              angleSlice * (i % numAxes),
              radiusScale(level),
            ] as [number, number])}
            angle={(d) => d[0] - Math.PI / 2}
            radius={(d) => d[1]}
            fill="none"
            stroke="var(--color-border)"
            strokeOpacity={0.6}
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {data.map((_, i) => {
          const angle = angleSlice * i
          const end = polarToCartesian(angle, maxRadius)
          return (
            <Line
              key={`axis-${i}`}
              from={{ x: 0, y: 0 }}
              to={{ x: end.x, y: end.y }}
              stroke="var(--color-border)"
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          )
        })}

        {/* Radius tick labels */}
        {!compact &&
          gridCircles.map((level) => (
            <Text
              key={`tick-${level}`}
              x={4}
              y={-radiusScale(level)}
              fontSize={9}
              fill="var(--color-muted-foreground)"
              textAnchor="start"
              dy="0.35em"
            >
              {level}
            </Text>
          ))}
      </Group>

      {/* Data polygon */}
      <polygon
        points={dataPath}
        fill="var(--color-chart-1)"
        fillOpacity={0.35}
        stroke="var(--color-chart-1)"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />

      {/* Overlay polygon */}
      {overlayPath && (
        <polygon
          points={overlayPath}
          fill="var(--color-chart-3)"
          fillOpacity={0.25}
          stroke="var(--color-chart-3)"
          strokeWidth={2.5}
          strokeDasharray="5 5"
          strokeLinejoin="round"
        />
      )}

      {/* Data point dots + hover targets */}
      {data.map((d, i) => {
        const angle = angleSlice * i
        const r = radiusScale(Math.min(d.value, MAX_VALUE))
        const pt = polarToCartesian(angle, r)
        return (
          <g key={`dot-${i}`}>
            <circle
              cx={cx + pt.x}
              cy={cy + pt.y}
              r={compact ? 2 : 3}
              fill="var(--color-chart-1)"
              stroke="var(--color-background)"
              strokeWidth={1.5}
            />
            {showTooltip && hideTooltip && (
              <circle
                cx={cx + pt.x}
                cy={cy + pt.y}
                r={12}
                fill="transparent"
                cursor="pointer"
                onMouseEnter={(e) => {
                  showTooltip({
                    tooltipData: {
                      label: d.label,
                      value: d.value,
                      overlay: overlay?.[i]?.value,
                    },
                    tooltipLeft: e.clientX,
                    tooltipTop: e.clientY,
                  })
                }}
                onMouseLeave={() => hideTooltip()}
              />
            )}
          </g>
        )
      })}

      {/* Axis labels with @visx/text word-wrap */}
      {data.map((d, i) => {
        const angle = angleSlice * i
        const labelR = maxRadius + labelMargin
        const pt = polarToCartesian(angle, labelR)
        return (
          <Text
            key={`label-${i}`}
            x={cx + pt.x}
            y={cy + pt.y}
            textAnchor={getTextAnchor(angle)}
            verticalAnchor={getVerticalAnchor(angle)}
            width={labelWidth}
            fontSize={compact ? 8 : 11}
            fill="var(--color-muted-foreground)"
            lineHeight="1.2em"
            style={{ fontFamily: 'inherit' }}
          >
            {d.label}
          </Text>
        )
      })}
    </svg>
  )
}

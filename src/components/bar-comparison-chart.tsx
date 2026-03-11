import { useMemo } from 'react'
import { Group } from '@visx/group'
import { scaleLinear } from '@visx/scale'
import { Bar } from '@visx/shape'
import { Text } from '@visx/text'
import { useTooltip, TooltipWithBounds } from '@visx/tooltip'
import { ParentSize } from '@visx/responsive'

export interface BarDataPoint {
  label: string
  value: number
  fullMark: number
}

interface BarComparisonChartProps {
  data: BarDataPoint[]
  overlay?: BarDataPoint[]
  primaryLabel?: string
  overlayLabel?: string
}

interface TooltipData {
  label: string
  value: number
  overlay?: number
}

const MAX_VALUE = 5
const LABEL_WIDTH = 260
const BAR_HEIGHT = 20
const BAR_GAP = 4
const GROUP_GAP = 16
const RIGHT_PADDING = 40
const TOP_PADDING = 8

export default function BarComparisonChart({
  data,
  overlay,
  primaryLabel,
  overlayLabel,
}: BarComparisonChartProps) {
  const hasOverlay = overlay && overlay.length > 0
  const rowHeight = hasOverlay ? BAR_HEIGHT * 2 + BAR_GAP + GROUP_GAP : BAR_HEIGHT + GROUP_GAP
  const computedHeight = TOP_PADDING + data.length * rowHeight + 24

  return (
    <div className="w-full" style={{ height: computedHeight, position: 'relative' }}>
      <ParentSize>
        {({ width }) => (
          <BarChartSvg
            data={data}
            overlay={overlay}
            width={width}
            height={computedHeight}
            primaryLabel={primaryLabel}
            overlayLabel={overlayLabel}
          />
        )}
      </ParentSize>
    </div>
  )
}

function BarChartSvg({
  data,
  overlay,
  width,
  height,
  primaryLabel,
  overlayLabel,
}: {
  data: BarDataPoint[]
  overlay?: BarDataPoint[]
  width: number
  height: number
  primaryLabel?: string
  overlayLabel?: string
}) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>()

  const hasOverlay = overlay && overlay.length > 0
  const rowHeight = hasOverlay ? BAR_HEIGHT * 2 + BAR_GAP + GROUP_GAP : BAR_HEIGHT + GROUP_GAP
  const barAreaWidth = width - LABEL_WIDTH - RIGHT_PADDING

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, MAX_VALUE],
        range: [0, Math.max(barAreaWidth, 0)],
      }),
    [barAreaWidth],
  )

  if (width <= 0 || height <= 0) return null

  return (
    <>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Graphique à barres horizontales avec ${data.length} entrées`}
      >
        {/* Scale reference lines */}
        {[1, 2, 3, 4, 5].map((tick) => (
          <g key={tick}>
            <line
              x1={LABEL_WIDTH + xScale(tick)}
              y1={TOP_PADDING}
              x2={LABEL_WIDTH + xScale(tick)}
              y2={height - 20}
              stroke="var(--color-border)"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <Text
              x={LABEL_WIDTH + xScale(tick)}
              y={height - 4}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-muted-foreground)"
            >
              {tick}
            </Text>
          </g>
        ))}

        {data.map((d, i) => {
          const y = TOP_PADDING + i * rowHeight
          const barW = xScale(Math.min(d.value, MAX_VALUE))
          const overlayValue = overlay?.[i]?.value
          const overlayW = overlayValue !== undefined ? xScale(Math.min(overlayValue, MAX_VALUE)) : 0
          const labelY = hasOverlay ? y + BAR_HEIGHT + BAR_GAP / 2 : y + BAR_HEIGHT / 2

          return (
            <Group key={`row-${i}`}>
              {/* Label — left-aligned, full text with wrap */}
              <Text
                x={LABEL_WIDTH - 10}
                y={labelY}
                textAnchor="end"
                verticalAnchor="middle"
                width={LABEL_WIDTH - 16}
                fontSize={11}
                fill="var(--color-foreground)"
                lineHeight="1.3em"
                style={{ fontFamily: 'inherit' }}
              >
                {d.label}
              </Text>

              {/* Primary bar */}
              <Bar
                x={LABEL_WIDTH}
                y={y}
                width={Math.max(barW, 2)}
                height={BAR_HEIGHT}
                fill="var(--color-chart-1)"
                fillOpacity={0.7}
                rx={3}
                cursor="pointer"
                onMouseEnter={(e) => {
                  showTooltip({
                    tooltipData: { label: d.label, value: d.value, overlay: overlayValue },
                    tooltipLeft: (e as unknown as React.MouseEvent).clientX,
                    tooltipTop: (e as unknown as React.MouseEvent).clientY,
                  })
                }}
                onMouseLeave={() => hideTooltip()}
              />
              <Text
                x={LABEL_WIDTH + barW + 6}
                y={y + BAR_HEIGHT / 2}
                verticalAnchor="middle"
                fontSize={10}
                fill="var(--color-muted-foreground)"
                fontWeight={600}
              >
                {d.value.toFixed(1)}
              </Text>

              {/* Overlay bar */}
              {hasOverlay && overlayValue !== undefined && (
                <>
                  <Bar
                    x={LABEL_WIDTH}
                    y={y + BAR_HEIGHT + BAR_GAP}
                    width={Math.max(overlayW, 2)}
                    height={BAR_HEIGHT}
                    fill="var(--color-chart-3)"
                    fillOpacity={0.6}
                    rx={3}
                    cursor="pointer"
                    onMouseEnter={(e) => {
                      showTooltip({
                        tooltipData: { label: d.label, value: d.value, overlay: overlayValue },
                        tooltipLeft: (e as unknown as React.MouseEvent).clientX,
                        tooltipTop: (e as unknown as React.MouseEvent).clientY,
                      })
                    }}
                    onMouseLeave={() => hideTooltip()}
                  />
                  <Text
                    x={LABEL_WIDTH + overlayW + 6}
                    y={y + BAR_HEIGHT + BAR_GAP + BAR_HEIGHT / 2}
                    verticalAnchor="middle"
                    fontSize={10}
                    fill="var(--color-muted-foreground)"
                    fontWeight={600}
                  >
                    {overlayValue.toFixed(1)}
                  </Text>
                </>
              )}
            </Group>
          )
        })}

        {/* Legend */}
        {hasOverlay && (
          <g>
            <rect x={LABEL_WIDTH} y={height - 18} width={10} height={10} rx={2} fill="var(--color-chart-1)" fillOpacity={0.7} />
            <Text x={LABEL_WIDTH + 14} y={height - 13} verticalAnchor="middle" fontSize={9} fill="var(--color-muted-foreground)">
              {primaryLabel ?? 'Score'}
            </Text>
            <rect x={LABEL_WIDTH + 80} y={height - 18} width={10} height={10} rx={2} fill="var(--color-chart-3)" fillOpacity={0.6} />
            <Text x={LABEL_WIDTH + 94} y={height - 13} verticalAnchor="middle" fontSize={9} fill="var(--color-muted-foreground)">
              {overlayLabel ?? 'Moyenne équipe'}
            </Text>
          </g>
        )}
      </svg>

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
    </>
  )
}

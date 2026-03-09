import {
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

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
}

export default function RadarChart({
  data,
  overlay,
  height = 350,
  compact = false,
}: RadarChartProps) {
  // Merge data and overlay into one array for Recharts
  const merged = data.map((d, i) => ({
    label: d.label,
    value: d.value,
    overlay: overlay?.[i]?.value ?? undefined,
    fullMark: d.fullMark,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadarChart data={merged} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="var(--color-border)" />
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
          name="Team Average"
          dataKey="value"
          stroke="var(--color-chart-1)"
          fill="var(--color-chart-1)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        {overlay && (
          <Radar
            name="You"
            dataKey="overlay"
            stroke="var(--color-chart-3)"
            fill="var(--color-chart-3)"
            fillOpacity={0.15}
            strokeWidth={2}
            strokeDasharray="5 5"
          />
        )}
        {!compact && <Tooltip />}
      </RechartsRadarChart>
    </ResponsiveContainer>
  )
}

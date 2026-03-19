import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp } from 'lucide-react'
import type { SkillChange } from '@/lib/types'

/** Custom Recharts tooltip that respects dark/light theme via CSS vars */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{label}</p>
      <p>Niveau {payload[0].value}</p>
    </div>
  )
}

interface SkillProgressionChartProps {
  changes: SkillChange[]
  skillId: string
  skillName: string
}

export function SkillProgressionChart({ changes, skillId, skillName }: SkillProgressionChartProps) {
  const data = useMemo(() => {
    return changes
      .filter(c => c.skillId === skillId)
      .map(c => ({
        date: c.changedAt.split('T')[0],
        level: c.newLevel,
      }))
  }, [changes, skillId])

  if (data.length === 0) return null

  if (data.length === 1) {
    return (
      <div className="mt-2 mb-1">
        <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-primary/40 shrink-0" />
          <span>
            Niveau initial validé le {data[0].date} — <span className="font-semibold">● {data[0].level}/5</span>.
            {' '}Mettez à jour pour voir la courbe de progression.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 mb-1">
      <p className="text-[11px] text-muted-foreground mb-1">{skillName} — progression</p>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis
            domain={[0, 5]}
            ticks={[0, 1, 2, 3, 4, 5]}
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="level"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Inline sparkline showing trend (last 5 data points) */
export function SkillSparkline({ changes, skillId }: { changes: SkillChange[]; skillId: string }) {
  const data = useMemo(() => {
    return changes
      .filter(c => c.skillId === skillId)
      .slice(-5)
      .map(c => ({ level: c.newLevel }))
  }, [changes, skillId])

  if (data.length === 0) return null

  if (data.length === 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
      </span>
    )
  }

  return (
    <div className="inline-block align-middle" style={{ width: 64, height: 20 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <Line
            type="monotone"
            dataKey="level"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Category-level sparkline aggregated from skill changes */
export function CategorySparkline({ changes, skillIds }: { changes: SkillChange[]; skillIds: string[] }) {
  const data = useMemo(() => {
    if (skillIds.length === 0) return []
    const skillIdSet = new Set(skillIds)
    const relevant = changes.filter(c => skillIdSet.has(c.skillId))
    if (relevant.length === 0) return []

    // Build running average: for each change event, compute category avg at that point
    const latestLevel: Record<string, number> = {}
    const points: { level: number }[] = []

    for (const c of relevant) {
      latestLevel[c.skillId] = c.newLevel
      const levels = Object.values(latestLevel)
      const avg = levels.reduce((a, b) => a + b, 0) / levels.length
      points.push({ level: Math.round(avg * 10) / 10 })
    }

    return points.slice(-5)
  }, [changes, skillIds])

  if (data.length < 2) return null

  return (
    <div className="inline-block align-middle" style={{ width: 40, height: 16 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <Line
            type="monotone"
            dataKey="level"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

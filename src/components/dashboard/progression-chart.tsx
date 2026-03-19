import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
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

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
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
            Niveau initial validé le {formatShortDate(data[0].date)} — <span className="font-semibold">{data[0].level}/5</span>.
            {' '}Mettez à jour pour voir la progression.
          </span>
        </div>
      </div>
    )
  }

  const first = data[0]
  const last = data[data.length - 1]
  const delta = last.level - first.level

  return (
    <div className="mt-2 mb-1 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatShortDate(first.date)}</span>
        <span className="text-foreground font-semibold tabular-nums">{first.level}/5</span>
        <span>→</span>
        <span>{formatShortDate(last.date)}</span>
        <span className="text-foreground font-semibold tabular-nums">{last.level}/5</span>
        {delta !== 0 && (
          <span className={cn(
            'font-semibold',
            delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
          )}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -24 }}>
          <YAxis
            domain={[0, 5]}
            ticks={[1, 3, 5]}
            tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="stepAfter"
            dataKey="level"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--color-primary)' }}
            activeDot={{ r: 6 }}
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
            stroke="var(--color-primary)"
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

  if (data.length === 0) return null

  if (data.length === 1) {
    return (
      <span className="inline-flex items-center">
        <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
      </span>
    )
  }

  return (
    <div className="inline-block align-middle" style={{ width: 40, height: 16 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <Line
            type="monotone"
            dataKey="level"
            stroke="var(--color-primary)"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

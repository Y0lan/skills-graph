import { useMemo } from 'react'
import { POLE_HEX, POLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { TeamMemberAggregateResponse } from '@/lib/types'

interface PoleScoreboardProps {
  members: TeamMemberAggregateResponse[]
  poleFilter?: string | null
  onSelectPole?: (pole: string) => void
}

const POLE_DISPLAY_ORDER = ['java_modernisation', 'fonctionnel', 'legacy', '__transverse'] as const

/** Average of a member's non-zero category averages — same definition as
 * TeamMembersGrid so a member's score on the scoreboard matches their row. */
function memberOverallAvg(member: TeamMemberAggregateResponse): number {
  const scores = Object.values(member.categoryAverages).filter(v => v > 0)
  if (scores.length === 0) return 0
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

/**
 * One card per pôle: count of members + average score across the pôle.
 * Cards are clickable and act as a quick-filter for the pôle dropdown,
 * giving the recruiter a "where do we stand by pôle" answer in one glance
 * without forcing them to read the 18-axis radar.
 *
 * Members with no assigned pôle are bucketed under "__transverse" so
 * direction / management folks still appear in the count.
 */
export default function PoleScoreboard({ members, poleFilter, onSelectPole }: PoleScoreboardProps) {
  const stats = useMemo(() => {
    const byPole = new Map<string, { count: number; submitted: number; sumAvg: number }>()
    for (const m of members) {
      const pole = m.pole ?? '__transverse'
      const prev = byPole.get(pole) ?? { count: 0, submitted: 0, sumAvg: 0 }
      prev.count += 1
      const score = memberOverallAvg(m)
      if (score > 0) {
        prev.submitted += 1
        prev.sumAvg += score
      }
      byPole.set(pole, prev)
    }
    return POLE_DISPLAY_ORDER
      .map(pole => {
        const e = byPole.get(pole)
        return {
          pole,
          label: pole === '__transverse' ? 'Transverse' : (POLE_LABELS[pole] ?? pole),
          count: e?.count ?? 0,
          submitted: e?.submitted ?? 0,
          avg: e && e.submitted > 0 ? e.sumAvg / e.submitted : 0,
        }
      })
      .filter(s => s.count > 0)
  }, [members])

  if (stats.length === 0) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(s => {
        const isActive = poleFilter === s.pole || (poleFilter === null && s.pole === '__transverse' && false)
        const Tag = onSelectPole ? 'button' : 'div'
        const color = POLE_HEX[s.pole] ?? POLE_HEX.__transverse
        return (
          <Tag
            key={s.pole}
            type={onSelectPole ? 'button' : undefined}
            onClick={onSelectPole ? () => onSelectPole(s.pole === '__transverse' ? 'all' : s.pole) : undefined}
            className={cn(
              'rounded-lg border p-4 text-left transition-colors min-w-0',
              onSelectPole && 'hover:bg-muted/40 cursor-pointer',
              isActive && 'ring-2 ring-primary',
            )}
            style={{ borderLeftColor: color, borderLeftWidth: 4 }}
          >
            <p className="text-xs font-medium text-muted-foreground truncate">{s.label}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">
              {s.avg > 0 ? s.avg.toFixed(1) : <span className="text-muted-foreground">—</span>}
              {s.avg > 0 && <span className="text-xs text-muted-foreground ml-1 font-normal">/5</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {s.submitted}/{s.count} membre{s.count > 1 ? 's' : ''} évalué{s.submitted > 1 ? 's' : ''}
            </p>
          </Tag>
        )
      })}
    </div>
  )
}

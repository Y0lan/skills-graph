import { useMemo } from 'react'
import { History } from 'lucide-react'
import InitialsBadge from '@/components/ui/initials-badge'
import { formatActor, formatEventTimestamp } from '@/lib/recruitment-events'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

/**
 * "Modifié il y a 12 min par Franck" passive presence indicator.
 *
 * Why: Sinapse has ~10 active recruiters; real-time multi-user presence
 * (Liveblocks/Yjs) costs 800+ LOC + a paid service for collisions that
 * happen ~2× per year. A static "last activity" line covers 95% of the
 * "is someone else looking at this?" concern at 1% of the cost.
 *
 * What we surface: the most recent activity across the candidature's
 * events — note add, note edit, status change, document upload, email
 * lifecycle, etc. The indicator picks the latest by `updated_at` (when
 * present, for edited notes) or `created_at` (everything else).
 *
 * What we explicitly skip: deliverability signals (email_open / click /
 * delivered) — those fire automatically from the Resend webhook, so
 * surfacing them as "Modifié par yolan" would be wrong (yolan didn't do
 * anything; the candidate clicked an email).
 */
export interface CandidateLastEditIndicatorProps {
  events: CandidatureEvent[]
}

const DELIVERABILITY_TYPES = new Set(['email_open', 'email_clicked', 'email_delivered', 'email_complained', 'email_delay'])

export default function CandidateLastEditIndicator({ events }: CandidateLastEditIndicatorProps) {
  const latest = useMemo(() => {
    let best: { event: CandidatureEvent; ts: string } | null = null
    for (const e of events) {
      if (DELIVERABILITY_TYPES.has(e.type)) continue
      const ts = e.updatedAt ?? e.createdAt
      if (!ts) continue
      if (!best || ts.localeCompare(best.ts) > 0) {
        best = { event: e, ts }
      }
    }
    return best
  }, [events])

  if (!latest) return null

  const { relative } = formatEventTimestamp(latest.ts)
  const actor = formatActor(latest.event.createdBy)
  const wasEdited = !!latest.event.updatedAt
  const verb = wasEdited ? 'Modifié' : 'Activité'

  return (
    <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
      <History className="h-3 w-3" aria-hidden />
      <InitialsBadge name={actor} size="sm" className="!h-4 !w-4 !text-[8px]" />
      <span>{verb} {relative} par <span className="text-foreground/80">{actor}</span></span>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Clock, Mail, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateTimeHuman, parseAppDate } from '@/lib/constants'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

interface Props {
  events: CandidatureEvent[]
  /** Disabled when another mutation is in flight (revertingStatus, sendingNow, etc.). */
  disabled?: boolean
  onSendNow: () => void
  onCancel: () => void
}

function parseSnapshot(s: string | null): { messageId?: string; scheduledAt?: string; statut?: string; to?: string; cancelledScheduleId?: string } {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

/**
 * Banner shown on a candidature card when a candidate-facing email is queued
 * at Resend but hasn't fired yet. Live mm:ss countdown plus "Envoyer
 * maintenant" / "Annuler" so the recruiter can fast-track or undo before
 * the 10-minute window closes.
 *
 * Returns null when no pending scheduled email exists.
 */
export default function ScheduledEmailBanner({ events, disabled, onSendNow, onCancel }: Props) {
  // tick drives re-renders for the countdown; reading Date.now() in render
  // is impure so we capture `now` once per tick instead.
  const [now, setNow] = useState(() => Date.now())

  // Find the most recent email_scheduled event that hasn't been superseded
  // by a later email_sent / email_cancelled / email_failed on the same id,
  // and whose scheduledAt is still in the future. React Compiler memoizes
  // automatically — explicit useMemo would suppress that.
  const pending = (() => {
    const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    for (const e of sorted) {
      if (e.type !== 'email_scheduled') continue
      const snap = parseSnapshot(e.emailSnapshot)
      if (!snap.messageId || !snap.scheduledAt) continue
      const superseded = events.some(o => {
        if (o.type !== 'email_sent' && o.type !== 'email_cancelled' && o.type !== 'email_failed') return false
        if (o.id <= e.id) return false
        const oSnap = parseSnapshot(o.emailSnapshot)
        return oSnap.messageId === snap.messageId || oSnap.cancelledScheduleId === snap.messageId
      })
      if (superseded) continue
      const scheduledMs = parseAppDate(snap.scheduledAt)?.getTime() ?? 0
      if (now >= scheduledMs) continue
      return { event: e, snap, scheduledMs }
    }
    return null
  })()

  useEffect(() => {
    if (!pending) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [pending])

  if (!pending) return null

  const remainingMs = Math.max(0, pending.scheduledMs - now)
  const totalSec = Math.ceil(remainingMs / 1000)
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const ss = String(totalSec % 60).padStart(2, '0')
  const fireTime = formatDateTimeHuman(new Date(pending.scheduledMs).toISOString())

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30 p-3 flex flex-wrap items-center gap-3">
      <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Email programmé à <span className="tabular-nums">{fireTime}</span>
          <span className="ml-2 tabular-nums font-mono text-amber-700 dark:text-amber-300">
            (envoi dans {mm}:{ss})
          </span>
        </p>
        <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
          Vous pouvez envoyer immédiatement ou annuler la transition avant la fin du délai.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          variant="default"
          className="bg-amber-600 hover:bg-amber-700 text-white"
          onClick={onSendNow}
          disabled={disabled}
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" />
          Envoyer maintenant
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={disabled}
          className="border-amber-300 dark:border-amber-700/50"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Annuler
        </Button>
      </div>
    </div>
  )
}

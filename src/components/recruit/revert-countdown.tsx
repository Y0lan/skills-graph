import { useEffect, useMemo, useState } from 'react'
import { Clock, Mail, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STATUT_LABELS } from '@/lib/constants'

/**
 * Revert-window banner with an exact deadline. The previous copy ("{N}min
 * restantes") gave no sense of absolute position in the day — useful when
 * the recruiter interrupts their flow and comes back two minutes later.
 * Now reads "Annulable jusqu'à 14:32" with a progress bar showing how much
 * of the 10-minute Resend cancellation window remains.
 *
 * Props mirror the decisions the caller has already made (emailState +
 * click handlers). The component only owns the visual state: countdown
 * text + bar, re-rendering each minute so the deadline stays honest.
 */
export interface RevertCountdownProps {
  /** ISO timestamp of the last status_change event; the window closes 10
   *  minutes after this instant. */
  lastStatusChangeAt: string
  /** Email state attached to the revert — decides which CTAs render and
   *  what copy to surface. Matches `revertBlock.emailState` upstream. */
  emailState: 'sent' | 'scheduled' | 'none'
  /** Disabled means a sibling request is already inflight (send-now in
   *  progress, revert in progress, or the whole candidature is busy). */
  disabled?: boolean
  sendingNow: boolean
  revertingStatus: boolean
  onSendNow: () => void
  onRevert: () => void
  /** v5.1.x A.4 (issue 2 + design D-copy-3): the previous label "Annuler
   *  la transition" was too abstract — the recruiter wanted to know what
   *  was being undone. We now render `← Revenir à «<prev stage>»`,
   *  pulling the label from STATUT_LABELS. The workspace passes
   *  `previousStatut` from the latest status_change.statutFrom; the
   *  parent gates rendering of <RevertCountdown> on that being non-null
   *  (countdown only renders within the 10-min window after a forward
   *  transition, which always has a previous stage), so the
   *  `'Annuler le passage'` fallback is paranoid-defensive only. */
  previousStatut?: string | null
}

const WINDOW_MS = 10 * 60 * 1000

export default function RevertCountdown({
  lastStatusChangeAt, emailState, disabled, sendingNow, revertingStatus, onSendNow, onRevert, previousStatut,
}: RevertCountdownProps) {
  const prevLabel = previousStatut && STATUT_LABELS[previousStatut]
    ? STATUT_LABELS[previousStatut]
    : null
  // `nowMs` is the wall clock sampled every 30s. Re-rendering every second
  // would spin for no visual gain and drain idle-tab batteries; 30s keeps
  // the progress bar honest without churn. The React compiler flags
  // `Date.now()` at render as impure — stashing it in state with an
  // interval-updated useEffect is the lint-clean shape.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const { pct, minutesLeft, deadline } = useMemo(() => {
    const startMs = new Date(lastStatusChangeAt + (lastStatusChangeAt.includes('Z') ? '' : 'Z')).getTime()
    const endMs = startMs + WINDOW_MS
    const remaining = Math.max(0, endMs - nowMs)
    return {
      pct: Math.max(0, Math.min(100, (remaining / WINDOW_MS) * 100)),
      minutesLeft: Math.max(1, Math.ceil(remaining / 60_000)),
      deadline: new Date(endMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    }
  }, [lastStatusChangeAt, nowMs])

  const hint =
    emailState === 'scheduled'
      ? `Email programmé, sera envoyé à ${deadline}`
      : emailState === 'sent'
        ? 'Email déjà envoyé — annuler ne le rappellera pas'
        : 'Aucun email attaché à cette transition'

  return (
    <div
      role="status"
      className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-sm"
    >
      <div className="flex items-center flex-wrap gap-2">
        <Clock className="h-4 w-4 text-amber-600" aria-hidden />
        <span className="font-medium">
          Annulable jusqu'à {deadline}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          · {minutesLeft} min restante{minutesLeft > 1 ? 's' : ''}
        </span>
        <span className="text-xs text-muted-foreground">· {hint}</span>
        <div className="flex items-center gap-1 ml-auto">
          {emailState === 'scheduled' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 border-primary/40 text-primary hover:bg-primary/10"
              disabled={disabled}
              onClick={onSendNow}
            >
              <Mail className="h-3 w-3" />
              {sendingNow ? 'Envoi…' : 'Envoyer maintenant'}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-8 max-w-[18rem]"
            disabled={disabled}
            onClick={onRevert}
            title={prevLabel ? `Revenir à ${prevLabel}` : undefined}
            aria-label={prevLabel ? `Revenir à ${prevLabel}` : 'Annuler le passage'}
          >
            <RotateCcw className="h-3 w-3 shrink-0" />
            {revertingStatus
              ? 'Annulation…'
              : prevLabel
                ? (
                  <>
                    <span className="shrink-0">Revenir à</span>
                    <span className="max-w-[14ch] truncate inline-block align-middle">«&nbsp;{prevLabel}&nbsp;»</span>
                  </>
                )
                : 'Annuler le passage'}
          </Button>
        </div>
      </div>
      <div
        className="h-1 w-full rounded-full bg-muted overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="h-full bg-amber-500/60 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

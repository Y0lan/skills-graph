import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronRight, X, RotateCcw, Mail, Copy } from 'lucide-react'
import { STATUT_LABELS, NEXT_ACTION } from '@/lib/constants'
import { toast } from 'sonner'
import type { CandidatureInfo, CandidatureEvent, AllowedTransitions } from '@/hooks/use-candidate-data'

const PIPELINE_STAGES = [
  'postule',
  'preselectionne',
  'skill_radar_envoye',
  'skill_radar_complete',
  'entretien_1',
  'aboro',
  'entretien_2',
  'proposition',
  'embauche',
] as const

export interface CandidateActionRailProps {
  candidature: CandidatureInfo
  events: CandidatureEvent[]
  allowedTransitions: AllowedTransitions | null
  candidate: {
    id: string
    submittedAt: string | null
    expiresAt: string
  }
  /** True when `isPending && statut === 'skill_radar_envoye'` — shows the
   *  "Copier le lien Skill Radar" utility. */
  showCopyLink: boolean
  busyId: string | null
  changingStatus: boolean
  onOpenTransition: (candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[], currentStatut?: string) => void
  onRevert: (candidatureId: string, emailState: 'sent' | 'scheduled' | 'none') => void
  onSendNow: (candidatureId: string) => void
  onReopen: (candidateId: string) => void
}

/** Sticky right action rail for the selected candidature.
 *
 *  Content order (top → bottom):
 *    1. Stage header (Étape N/9 + label)
 *    2. Primary "next action" CTA (first non-refuse allowed transition)
 *    3. Secondary actions (other forward + skip transitions)
 *    4. Destructive zone (Refuse — terminal)
 *    5. Revert / Send-now block (conditional — within 10-min window)
 *    6. Utilities (Copier lien, Rouvrir)
 *
 *  The rail lives in a sticky container (`sticky top-16`) so it stays
 *  visible while the recruiter scrolls through scores / documents /
 *  history. Editorial visual: hairline dividers, eyebrow labels, no
 *  shadows. Matches the pipeline page's KPI strip vocabulary. */
export default function CandidateActionRail({
  candidature: c,
  events,
  allowedTransitions,
  candidate,
  showCopyLink,
  busyId,
  changingStatus,
  onOpenTransition,
  onRevert,
  onSendNow,
  onReopen,
}: CandidateActionRailProps) {
  const stageIndex = PIPELINE_STAGES.indexOf(c.statut as (typeof PIPELINE_STAGES)[number])
  const stageNum = stageIndex >= 0 ? stageIndex + 1 : null
  const isTerminalState = c.statut === 'embauche' || c.statut === 'refuse'

  // Revert window detection — mirrors the current inline block on the
  // detail page verbatim, including the initial-entry sentinel and
  // terminal+email-scheduled gate.
  const revertBlock = useMemo(() => {
    const statusChanges = events
      .filter(e => e.type === 'status_change' && e.statutTo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (b.id ?? 0) - (a.id ?? 0))
    const lastStatusChange = statusChanges[0]
    if (!lastStatusChange) return null

    // Initial-entry sentinel: self-loop "postule → postule" that marks
    // candidature creation. Only suppressed when it's the SOLE row.
    const isInitialSentinel =
      lastStatusChange.statutFrom != null
      && lastStatusChange.statutFrom === lastStatusChange.statutTo
      && statusChanges.length === 1
    if (isInitialSentinel) return null

    const ageMs = Date.now() - new Date(lastStatusChange.createdAt + 'Z').getTime()
    if (ageMs > 10 * 60 * 1000) return null

    const lastStatusTs = new Date(lastStatusChange.createdAt + 'Z').getTime()
    const postStatusEmailEvents = events
      .filter(e =>
        (e.type === 'email_scheduled' || e.type === 'email_sent' || e.type === 'email_cancelled' || e.type === 'email_failed') &&
        new Date(e.createdAt + 'Z').getTime() >= lastStatusTs - 1000
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latestEmailEvent = postStatusEmailEvents[0]
    const emailState: 'sent' | 'scheduled' | 'none' =
      latestEmailEvent?.type === 'email_sent' ? 'sent'
      : latestEmailEvent?.type === 'email_scheduled' ? 'scheduled'
      : 'none'

    // Terminal statuses are only revertable when the email is still
    // scheduled (we can yank it from Resend). If already sent → block.
    const isTerminal = lastStatusChange.statutTo === 'embauche' || lastStatusChange.statutTo === 'refuse'
    if (isTerminal && emailState !== 'scheduled') return null

    const minutesLeft = Math.max(1, Math.round((10 * 60 * 1000 - ageMs) / 60000))
    return { emailState, minutesLeft }
  }, [events])

  const forward = (allowedTransitions?.allowedTransitions ?? []).filter(s => s !== 'refuse')
  const skips = allowedTransitions?.skipTransitions ?? []
  const hasRefuse = (allowedTransitions?.allowedTransitions ?? []).includes('refuse')
  const primary = forward[0]
  const others = forward.slice(1)

  const busy = busyId === c.id

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/evaluate/${candidate.id}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        const ta = document.createElement('textarea')
        ta.value = link
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('execCommand failed')
      }
      toast.success('Lien du Skill Radar copié')
    } catch {
      toast.error(`Copie impossible — voici le lien : ${link}`, { duration: 15000 })
    }
  }

  return (
    <aside
      aria-label="Actions pour cette candidature"
      className="sticky top-16 space-y-5 text-sm"
    >
      {/* Stage header */}
      <div>
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {stageNum ? `Étape ${stageNum} sur 9` : 'Étape terminale'}
        </p>
        <p
          className="text-xl font-bold mt-0.5 tracking-tight"
          style={{ fontFamily: "'Raleway Variable', sans-serif" }}
        >
          {STATUT_LABELS[c.statut] ?? c.statut}
        </p>
        {!isTerminalState && NEXT_ACTION[c.statut] && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {NEXT_ACTION[c.statut]}
          </p>
        )}
      </div>

      {/* Primary action */}
      {primary && (
        <Button
          size="sm"
          className="w-full justify-start gap-2 h-9"
          disabled={changingStatus}
          onClick={() => onOpenTransition(c.id, primary, false, [], c.statut)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
          {STATUT_LABELS[primary] ?? primary}
        </Button>
      )}

      {/* Secondary actions (non-refuse + skip) */}
      {(others.length > 0 || skips.length > 0) && (
        <div className="space-y-1.5 pt-1 border-t">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase pt-3">
            Autres transitions
          </p>
          {others.map(s => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              className="w-full justify-start gap-2 h-8"
              disabled={changingStatus}
              onClick={() => onOpenTransition(c.id, s, false, [], c.statut)}
            >
              <ChevronRight className="h-3 w-3" />
              {STATUT_LABELS[s] ?? s}
            </Button>
          ))}
          {skips.map(st => (
            <Button
              key={st.statut}
              size="sm"
              variant="ghost"
              className="w-full justify-start gap-2 h-8 text-muted-foreground"
              disabled={changingStatus}
              onClick={() => onOpenTransition(c.id, st.statut, true, st.skipped, c.statut)}
              title={`Sauter : ${st.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')}`}
            >
              {STATUT_LABELS[st.statut] ?? st.statut}
              <span className="text-[10px] ml-auto truncate">
                (sauter {st.skipped.length})
              </span>
            </Button>
          ))}
        </div>
      )}

      {/* Destructive zone */}
      {hasRefuse && (
        <div className="pt-3 border-t">
          <Button
            size="sm"
            variant="destructive"
            className="w-full justify-start gap-2 h-8"
            disabled={changingStatus}
            onClick={() => onOpenTransition(c.id, 'refuse', false, [], c.statut)}
          >
            <X className="h-3 w-3" />
            Refuser
          </Button>
        </div>
      )}

      {/* Revert window */}
      {revertBlock && (
        <div className="pt-3 border-t space-y-1.5">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Fenêtre d'annulation ({revertBlock.minutesLeft}min)
          </p>
          {revertBlock.emailState === 'scheduled' && (
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start gap-2 h-8 border-primary/40 text-primary hover:bg-primary/10"
              disabled={busy}
              onClick={() => onSendNow(c.id)}
              title="Envoyer l'email maintenant sans attendre la fin des 10 minutes"
            >
              <Mail className="h-3 w-3" />
              Envoyer l'email maintenant
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className={`w-full justify-start gap-2 h-8 ${
              revertBlock.emailState === 'sent' ? 'text-amber-600 dark:text-amber-400'
              : revertBlock.emailState === 'scheduled' ? 'text-primary'
              : 'text-muted-foreground'
            }`}
            disabled={busy}
            onClick={() => onRevert(c.id, revertBlock.emailState)}
            title={
              revertBlock.emailState === 'sent' ? "L'email a déjà été envoyé — le candidat l'a reçu"
              : revertBlock.emailState === 'scheduled' ? "L'email sera annulé avant envoi"
              : undefined
            }
          >
            <RotateCcw className="h-3 w-3" />
            Annuler la dernière transition
            {revertBlock.emailState === 'sent' && (
              <span className="text-[10px] font-medium ml-auto">(email envoyé)</span>
            )}
            {revertBlock.emailState === 'scheduled' && (
              <span className="text-[10px] font-medium ml-auto">(email programmé)</span>
            )}
          </Button>
        </div>
      )}

      {/* Utilities */}
      {(showCopyLink || candidate.submittedAt) && (
        <div className="pt-3 border-t space-y-1.5">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Utilitaires
          </p>
          {showCopyLink && (
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start gap-2 h-8"
              onClick={handleCopyLink}
              title="Copier le lien Skill Radar (utile sans email)"
            >
              <Copy className="h-3 w-3" />
              Copier le lien Skill Radar
            </Button>
          )}
          {candidate.submittedAt && (
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start gap-2 h-8"
              onClick={() => onReopen(candidate.id)}
            >
              <RotateCcw className="h-3 w-3" />
              Rouvrir l'évaluation
            </Button>
          )}
        </div>
      )}
    </aside>
  )
}

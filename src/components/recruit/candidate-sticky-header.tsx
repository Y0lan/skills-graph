import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import InitialsBadge from '@/components/ui/initials-badge'
import { STATUT_LABELS, STATUT_COLORS } from '@/lib/constants'
import type { AllowedTransitions, CandidatureInfo } from '@/hooks/use-candidate-data'

/**
 * Compact fixed bar that slides in once the identity strip has scrolled
 * off the top. Preserves the three pieces the recruiter needs while deep
 * in the historique or documents: who (name + small avatar), where (the
 * current statut), and what (the primary forward action as a one-click
 * button).
 *
 * The primary CTA is derived from `allowedTransitions.allowedTransitions[0]`
 * minus the refuse path — never from the static `NEXT_ACTION` map, because
 * that map is UI guidance, not the authoritative state machine. If the
 * backend says no forward transition is allowed (terminal state, waiting
 * on candidate), the CTA slot renders the current status instead with no
 * button — a dead CTA is worse than no CTA.
 */
export interface CandidateStickyHeaderProps {
  candidateName: string
  candidature: CandidatureInfo | null
  allowedTransitions: AllowedTransitions | null
  onOpenTransition: (candidatureId: string, targetStatut: string, currentStatut: string) => void
  /** Disable the CTA while a transition request is inflight. */
  changingStatus: boolean
}

export default function CandidateStickyHeader({
  candidateName, candidature, allowedTransitions, onOpenTransition, changingStatus,
}: CandidateStickyHeaderProps) {
  if (!candidature) return null
  const forward = (allowedTransitions?.allowedTransitions ?? []).filter(s => s !== 'refuse')
  const primary = forward[0] ?? null

  return (
    <div
      className="sticky top-12 z-40 bg-background/90 backdrop-blur-md border-b shadow-sm"
    >
      <div className="mx-auto max-w-5xl px-4 py-2 flex items-center gap-3">
        <InitialsBadge name={candidateName} size="sm" />
        <span
          className="font-semibold text-sm truncate"
          style={{ fontFamily: "'Raleway Variable', sans-serif" }}
        >
          {candidateName}
        </span>
        <Badge
          variant="secondary"
          className={`text-[10px] shrink-0 ${STATUT_COLORS[candidature.statut] ?? ''}`}
        >
          {STATUT_LABELS[candidature.statut] ?? candidature.statut}
        </Badge>
        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
          {candidature.posteTitre}
        </span>
        <div className="ml-auto">
          {primary ? (
            <Button
              size="sm"
              onClick={() => onOpenTransition(candidature.id, primary, candidature.statut)}
              disabled={changingStatus}
              className="h-8 gap-1.5 text-xs"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              {STATUT_LABELS[primary] ?? primary}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground italic">Aucune action disponible</span>
          )}
        </div>
      </div>
    </div>
  )
}

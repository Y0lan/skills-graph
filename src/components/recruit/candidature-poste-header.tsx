import { ChevronRight, Clock, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { STATUT_COLORS, STATUT_LABELS, formatDateTimeHuman, isStatut } from '@/lib/constants'
import CandidateLastEditIndicator from './candidate-last-edit-indicator'
import { NextCriticalFactPill } from './stage-fiches/next-critical-fact-pill'
import CanalToggle from './canal-toggle'
import type { AllowedTransitions, CandidatureInfo, CandidatureEvent } from '@/hooks/use-candidate-data'

/**
 * Top-of-page candidature header: poste title (the BIG identifier the
 * recruiter scans first), statut badge, canal + creation date, presence
 * indicator, and the v5.1 next-critical-fact pill.
 *
 * Lifted out of <CandidatureWorkspace> per recruiter feedback (post-v5.2):
 * "j'aimerais voir ça tout en haut pour voir du premier coup d'oeil à
 * quoi il a postulé". The workspace's own header now only carries the
 * operational bits (Rouvrir l'évaluation button).
 *
 * Pure presentation — no state-managing callbacks.
 */

export interface CandidaturePosteHeaderProps {
  candidature: CandidatureInfo
  candidateName?: string
  candidateLocation?: string | null
  isPending: boolean
  submitted: boolean
  analysed: boolean
  events: CandidatureEvent[]
  /** v5.1 SSE signal that bumps when stage_data_changed fires for this
   *  candidature — forwarded to NextCriticalFactPill. */
  stageDataRefetchSignal?: number
  /** Optional one-click forward action for the sticky detail header. */
  allowedTransitions?: AllowedTransitions | null
  /** Required when `allowedTransitions` is provided. Called with the
   *  primary forward statut (refuse filtered out). */
  onOpenTransition?: (candidatureId: string, targetStatut: string, currentStatut: string) => void
  /** Disables the CTA while a transition request is inflight. */
  changingStatus?: boolean
}

export default function CandidaturePosteHeader({
  candidature: c,
  candidateName,
  candidateLocation,
  isPending,
  submitted,
  analysed,
  events,
  stageDataRefetchSignal,
  allowedTransitions,
  onOpenTransition,
  changingStatus,
}: CandidaturePosteHeaderProps) {
  const awaitingRadar = isPending && c.statut === 'skill_radar_envoye'
  // The backend state machine is authoritative. Refuse is not a forward CTA.
  const primaryForward = (allowedTransitions?.allowedTransitions ?? []).find(s => s !== 'refuse') ?? null

  return (
    <div className="flex items-center gap-3 flex-wrap mb-3">
      <div className="min-w-0">
        <h2
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: "'Raleway Variable', sans-serif" }}
        >
          {c.posteTitre}
        </h2>
        {candidateName && (
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground/90">{candidateName}</span>
            {candidateLocation && (
              <>
                <span className="text-muted-foreground/50" aria-hidden>·</span>
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{candidateLocation}</span>
              </>
            )}
          </p>
        )}
      </div>

      {awaitingRadar ? (
        <Badge
          variant="secondary"
          className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          title="Le Skill Radar a été envoyé au candidat, on attend qu'il complète l'auto-évaluation"
        >
          <Clock className="mr-1 h-3 w-3" />
          Skill Radar envoyé · en attente
        </Badge>
      ) : (
        <Badge variant="secondary" className={`text-xs ${STATUT_COLORS[c.statut] ?? ''}`}>
          {STATUT_LABELS[c.statut] ?? c.statut}
        </Badge>
      )}
      {!awaitingRadar && analysed && (
        <Badge variant="default" className="bg-[#1B6179] text-xs">Analyse</Badge>
      )}
      {!awaitingRadar && submitted && !analysed && (
        <Badge variant="default" className="bg-primary text-xs">Skill Radar soumis</Badge>
      )}

      <CanalToggle
        candidatureId={c.id}
        canal={c.canal as 'cabinet' | 'site' | 'candidature_directe' | 'reseau'}
      />

      <span className="text-xs text-muted-foreground">
        {formatDateTimeHuman(c.createdAt)}
      </span>

      <CandidateLastEditIndicator events={events} />

      {isStatut(c.statut) && (
        <NextCriticalFactPill
          candidatureId={c.id}
          statut={c.statut}
          refetchSignal={stageDataRefetchSignal}
        />
      )}

      {primaryForward && onOpenTransition && (
        <Button
          size="sm"
          onClick={() => onOpenTransition(c.id, primaryForward, c.statut)}
          disabled={changingStatus}
          className="ml-auto h-8 gap-1.5 text-xs"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          {STATUT_LABELS[primaryForward] ?? primaryForward}
        </Button>
      )}
    </div>
  )
}

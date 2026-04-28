import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { STATUT_COLORS, STATUT_LABELS, formatDateTime, isStatut } from '@/lib/constants'
import CandidateLastEditIndicator from './candidate-last-edit-indicator'
import { NextCriticalFactPill } from './stage-fiches/next-critical-fact-pill'
import CanalToggle from './canal-toggle'
import type { CandidatureInfo, CandidatureEvent } from '@/hooks/use-candidate-data'

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
  isPending: boolean
  submitted: boolean
  analysed: boolean
  events: CandidatureEvent[]
  /** v5.1 SSE signal that bumps when stage_data_changed fires for this
   *  candidature — forwarded to NextCriticalFactPill. */
  stageDataRefetchSignal?: number
}

export default function CandidaturePosteHeader({
  candidature: c,
  isPending,
  submitted,
  analysed,
  events,
  stageDataRefetchSignal,
}: CandidaturePosteHeaderProps) {
  const awaitingRadar = isPending && c.statut === 'skill_radar_envoye'

  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      <h2
        className="text-xl font-bold tracking-tight"
        style={{ fontFamily: "'Raleway Variable', sans-serif" }}
      >
        {c.posteTitre}
      </h2>

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
        {formatDateTime(c.createdAt)}
      </span>

      <CandidateLastEditIndicator events={events} />

      {isStatut(c.statut) && (
        <NextCriticalFactPill
          candidatureId={c.id}
          statut={c.statut}
          refetchSignal={stageDataRefetchSignal}
        />
      )}
    </div>
  )
}

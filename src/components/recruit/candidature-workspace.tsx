import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Sparkles, ChevronRight, X, RotateCcw, Mail, Copy, Clock } from 'lucide-react'
import { STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, NEXT_ACTION, formatDateTime } from '@/lib/constants'
import { toast } from 'sonner'
import CandidatePipelineStepper from './candidate-pipeline-stepper'
import CandidateScoreSummary from './candidate-score-summary'
import CandidateEmailsCard from './candidate-emails-card'
import CandidateDocumentsPanel from './candidate-documents-panel'
import CandidateNotesSection from './candidate-notes-section'
import AboroProfileSection from './aboro-profile-section'
import CandidateHistoryByStage from './candidate-history-by-stage'
import ScheduledEmailBanner from './scheduled-email-banner'
import FitReport from './fit-report'
import MultiPosteCard from './multi-poste-card'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import type { CandidatureInfo, CandidatureEvent, CandidatureDocument, CandidateDetail, AboroProfile as AboroProfileType, MultiPosteEntry, BonusSkill, AllowedTransitions } from '@/hooks/use-candidate-data'

interface GapEntry {
  skill: string
  category: string
  candidateScore: number
  teamAvg: number
  gap: number
}

export interface CandidatureWorkspaceProps {
  candidature: CandidatureInfo
  candidate: CandidateDetail
  events: CandidatureEvent[]
  setEvents: React.Dispatch<React.SetStateAction<CandidatureEvent[]>>
  documents: CandidatureDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<CandidatureDocument[]>>
  setCandidatureDataMap: React.Dispatch<React.SetStateAction<Record<string, import('@/hooks/use-candidate-data').CandidatureData>>>
  notes: string
  setNotes: React.Dispatch<React.SetStateAction<string>>
  aboroProfile: AboroProfileType | null
  setAboroProfile: React.Dispatch<React.SetStateAction<AboroProfileType | null>>
  allowedTransitions: AllowedTransitions | null
  candidateRadar: RadarDataPoint[]
  teamRadar: RadarDataPoint[]
  gapAnalysis: (GapEntry | null)[]
  bonusSkills: BonusSkill[]
  multiPosteCompatibility: MultiPosteEntry[]
  analyzing: boolean
  onGenerateAnalysis: () => void
  sendingNow: string | null
  revertingStatus: string | null
  changingStatus: boolean
  onOpenTransition: (candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[], currentStatut?: string) => void
  onRevert: (candidatureId: string, emailState: 'sent' | 'scheduled' | 'none') => void
  onSendNow: (candidatureId: string) => void
}

/** Main workspace for the selected candidature. Flat scroll layout —
 *  no tabs hiding content, no sticky rail. Actions sit next to scores
 *  like the original design, because "see scores, decide, click" is the
 *  natural flow and hiding actions in a sidebar didn't communicate.
 *
 *  Order (top → bottom):
 *    1. Candidature header row (poste title + statut + canal/date +
 *       inline utility buttons: Copier lien / Rouvrir)
 *    2. Alerts (scheduled email banner + soft skill alerts)
 *    3. Pipeline stepper (big, visual, always-present "where are they")
 *    4. 2-col grid: Scores (4 bars) on left, Next action + other
 *       transitions on right
 *    5. Revert window block (conditional, below the 2-col)
 *    6. Email tracking
 *    7. Documents (full panel, inline, no disclosure)
 *    8. Analyse IA section (below the fold if !submitted):
 *       - 2-col: Notes + Aboro (left) / Radar + FitReport + MultiPoste (right)
 *       - Candidat vs équipe gap table (full width, with intro sentence)
 *       - Bonus skills
 *    9. Historique complet (per-stage accordion). */
export default function CandidatureWorkspace(props: CandidatureWorkspaceProps) {
  const {
    candidature: c,
    candidate,
    events,
    setEvents,
    documents,
    setDocuments,
    setCandidatureDataMap,
    notes,
    setNotes,
    aboroProfile,
    setAboroProfile,
    allowedTransitions,
    candidateRadar,
    teamRadar,
    gapAnalysis,
    bonusSkills,
    multiPosteCompatibility,
    analyzing,
    onGenerateAnalysis,
    sendingNow,
    revertingStatus,
    changingStatus,
    onOpenTransition,
    onRevert,
    onSendNow,
  } = props

  const isPending = !candidate.submittedAt
  const submitted = !!candidate.submittedAt
  const analysed = submitted && !!candidate.aiReport
  const awaitingRadar = isPending && c.statut === 'skill_radar_envoye'
  const isTerminal = c.statut === 'embauche' || c.statut === 'refuse'

  // Revert window detection — same logic as the original, extracted here.
  const revertBlock = useMemo(() => {
    const statusChanges = events
      .filter(e => e.type === 'status_change' && e.statutTo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (b.id ?? 0) - (a.id ?? 0))
    const lastStatusChange = statusChanges[0]
    if (!lastStatusChange) return null

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

    const terminalGuardFails = (lastStatusChange.statutTo === 'embauche' || lastStatusChange.statutTo === 'refuse') && emailState !== 'scheduled'
    if (terminalGuardFails) return null

    const minutesLeft = Math.max(1, Math.round((10 * 60 * 1000 - ageMs) / 60000))
    return { emailState, minutesLeft }
  }, [events])

  const forward = (allowedTransitions?.allowedTransitions ?? []).filter(s => s !== 'refuse')
  const skips = allowedTransitions?.skipTransitions ?? []
  const hasRefuse = (allowedTransitions?.allowedTransitions ?? []).includes('refuse')
  const primary = forward[0] ?? null
  const others = forward.slice(1)
  const busy = revertingStatus === c.id || sendingNow === c.id

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

  const handleReopen = async () => {
    const res = await fetch(`/api/evaluate/${candidate.id}/reopen`, {
      method: 'POST',
      credentials: 'include',
    })
    if (res.ok) {
      toast.success('Évaluation rouverte — le candidat peut modifier ses réponses')
      window.location.reload()
    } else {
      toast.error("Erreur lors de la réouverture")
    }
  }

  const canCopyLink = !submitted
    && new Date(candidate.expiresAt) >= new Date()
    && (c.statut === 'postule' || c.statut === 'preselectionne' || c.statut === 'skill_radar_envoye')

  return (
    <div className="space-y-6">
      {/* ── 1. Candidature header row ──────────────────────
          Poste title, statut badge, metadata, plus the two inline
          utility buttons (Copy link / Rouvrir) so they're visible
          at a glance instead of hidden in a rail. */}
      <div className="flex items-center gap-3 flex-wrap">
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

        <span className="text-xs text-muted-foreground">
          {CANAL_LABELS[c.canal] ?? c.canal} · {formatDateTime(c.createdAt)}
        </span>

        <div className="flex items-center gap-1 ml-auto">
          {canCopyLink && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-1.5 h-7 text-xs"
              title="Copier le lien d'évaluation Skill Radar"
            >
              <Copy className="h-3 w-3" />
              Copier le lien
            </Button>
          )}
          {submitted && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReopen}
              className="gap-1.5 h-7 text-xs"
            >
              <RotateCcw className="h-3 w-3" />
              Rouvrir l'évaluation
            </Button>
          )}
        </div>
      </div>

      {/* ── 2. Alerts band ─────────────────────────────────
          Pending email banner + soft skill alerts. Only renders
          when something's actually pending. */}
      <ScheduledEmailBanner
        events={events}
        disabled={changingStatus || revertingStatus === c.id || sendingNow === c.id}
        onSendNow={() => onSendNow(c.id)}
        onCancel={() => onRevert(c.id, 'scheduled')}
      />

      {c.softSkillAlerts && c.softSkillAlerts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.softSkillAlerts.map((a, i) => (
            <Badge
              key={i}
              variant="outline"
              className="text-[10px] border-amber-500 text-amber-600"
            >
              {'⚠'} {a.message}
            </Badge>
          ))}
        </div>
      )}

      {/* ── 3. Pipeline stepper — big and visual ─────────── */}
      <CandidatePipelineStepper candidature={c} events={events} />

      {/* ── 4. Scores + Actions (2-col) ─────────────────────
          Classic recruiter flow: see score bars, decide, click
          action. The actions column makes the next step
          unmistakably a BUTTON, not a side-note. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3">
            Scores de compatibilité
          </p>
          <CandidateScoreSummary
            tauxPoste={c.tauxPoste}
            tauxEquipe={c.tauxEquipe}
            tauxSoft={c.tauxSoft}
            candidatureId={c.id}
          />
        </div>

        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3">
            Prochaine action
          </p>
          {isTerminal ? (
            <p className="text-sm text-muted-foreground">
              Candidature en état terminal — aucune action disponible.
            </p>
          ) : !allowedTransitions || (forward.length === 0 && skips.length === 0 && !hasRefuse) ? (
            <p className="text-sm text-muted-foreground">Aucune action disponible</p>
          ) : (
            <div className="space-y-2">
              {NEXT_ACTION[c.statut] && (
                <p className="text-xs text-muted-foreground mb-2">
                  Recommandé : {NEXT_ACTION[c.statut]}
                </p>
              )}

              {primary && (
                <Button
                  size="default"
                  onClick={() => onOpenTransition(c.id, primary, false, [], c.statut)}
                  disabled={changingStatus}
                  className="w-full justify-start gap-2 h-10 text-sm font-medium"
                >
                  <ChevronRight className="h-4 w-4" />
                  {STATUT_LABELS[primary] ?? primary}
                </Button>
              )}

              {(others.length > 0 || skips.length > 0) && (
                <div className="pt-1 space-y-1.5">
                  {others.map(s => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenTransition(c.id, s, false, [], c.statut)}
                      disabled={changingStatus}
                      className="w-full justify-start gap-2"
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
                      onClick={() => onOpenTransition(c.id, st.statut, true, st.skipped, c.statut)}
                      disabled={changingStatus}
                      className="w-full justify-start gap-2 text-muted-foreground"
                      title={`Sauter : ${st.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')}`}
                    >
                      {STATUT_LABELS[st.statut] ?? st.statut}
                      <span className="text-[10px] ml-auto">
                        (sauter {st.skipped.length})
                      </span>
                    </Button>
                  ))}
                </div>
              )}

              {hasRefuse && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onOpenTransition(c.id, 'refuse', false, [], c.statut)}
                  disabled={changingStatus}
                  className="w-full justify-start gap-2 mt-2"
                >
                  <X className="h-3 w-3" />
                  Refuser la candidature
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Revert window (conditional) ──────────────────
          Full-width callout when recruiter is still inside the
          10-minute undo window. Includes Send Now (inline) + Annuler. */}
      {revertBlock && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 flex items-center flex-wrap gap-2 text-sm">
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="font-medium">
            Fenêtre d'annulation : {revertBlock.minutesLeft}min restantes
          </span>
          {revertBlock.emailState === 'scheduled' && (
            <span className="text-xs text-muted-foreground">
              · Email programmé, sera envoyé à la fin de la fenêtre
            </span>
          )}
          {revertBlock.emailState === 'sent' && (
            <span className="text-xs text-muted-foreground">
              · Email déjà envoyé — annuler ne le rappellera pas
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {revertBlock.emailState === 'scheduled' && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 border-primary/40 text-primary hover:bg-primary/10"
                disabled={busy}
                onClick={() => onSendNow(c.id)}
              >
                <Mail className="h-3 w-3" />
                {sendingNow === c.id ? 'Envoi…' : 'Envoyer maintenant'}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 h-8"
              disabled={busy}
              onClick={() => onRevert(c.id, revertBlock.emailState)}
            >
              <RotateCcw className="h-3 w-3" />
              {revertingStatus === c.id ? 'Annulation…' : 'Annuler la transition'}
            </Button>
          </div>
        </div>
      )}

      {/* ── 6. Email tracking — inline, always visible ────── */}
      <CandidateEmailsCard events={events} />

      {/* ── 7. Documents — full panel inline ──────────────── */}
      <div className="pt-4 border-t">
        <CandidateDocumentsPanel
          candidatureId={c.id}
          documents={documents}
          setDocuments={setDocuments}
          setEvents={setEvents}
          setCandidatureDataMap={setCandidatureDataMap}
          currentStatut={c.statut}
        />
      </div>

      {/* ── 8. Analyse (below the fold, only if submitted) ── */}
      {isPending ? (
        <Card className="mt-2">
          <CardContent className="p-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-3 text-sm font-medium">En attente de l'évaluation</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Le candidat n'a pas encore soumis son Skill Radar.
            </p>
            {canCopyLink && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="mt-3 gap-1.5"
              >
                <Copy className="h-3 w-3" />
                Copier le lien pour lui renvoyer
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 2-col: Notes + Aboro | Radar + FitReport + MultiPoste */}
          <div className="pt-4 border-t grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <CandidateNotesSection
                candidateId={candidate.id}
                candidatureId={c.id}
                notes={c.notesDirecteur ?? notes}
                onNotesChange={setNotes}
              />
              <AboroProfileSection
                candidateId={candidate.id}
                aboroProfile={aboroProfile}
                hasCandidatures={true}
                onProfileUpdated={setAboroProfile}
              />
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Radar — Candidat vs équipe</CardTitle>
                </CardHeader>
                <CardContent>
                  <VisxRadarChart
                    data={candidateRadar}
                    overlay={teamRadar}
                    primaryLabel={candidate.name}
                    overlayLabel="Moyenne équipe"
                    showOverlayToggle
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Analyse IA</CardTitle>
                  {!candidate.aiReport && !analyzing && (
                    <Button onClick={onGenerateAnalysis} size="sm">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Générer l'analyse
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {candidate.aiReport ? (
                    <FitReport report={candidate.aiReport} />
                  ) : analyzing ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                      <span className="text-sm text-muted-foreground">Analyse en cours… (15-30 secondes)</span>
                    </div>
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground text-center">
                      Cliquez sur « Générer l'analyse » pour obtenir un rapport IA comparant ce candidat à l'équipe.
                    </p>
                  )}
                </CardContent>
              </Card>

              {multiPosteCompatibility.length > 0 && (
                <MultiPosteCard entries={multiPosteCompatibility} />
              )}
            </div>
          </div>

          {/* Candidat vs équipe — gap table with intro sentence so the
              recruiter understands what they're looking at. */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Candidat vs équipe</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Compare le niveau du candidat à la moyenne de l'équipe actuelle, par compétence.
                Écart positif = le candidat est au-dessus ; négatif = l'équipe est plus forte.
              </p>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Compétence</th>
                      <th className="pb-2 px-3 font-medium text-center whitespace-nowrap w-20">Candidat</th>
                      <th className="pb-2 px-3 font-medium text-center whitespace-nowrap w-16">Équipe</th>
                      <th className="pb-2 pl-3 font-medium text-center whitespace-nowrap w-14">Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gapAnalysis
                      .filter((g): g is GapEntry => g !== null)
                      .slice(0, 20)
                      .map((g, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-4">{g.skill}</td>
                          <td className="py-2 px-3 text-center font-mono tabular-nums">{g.candidateScore}</td>
                          <td className="py-2 px-3 text-center font-mono tabular-nums text-muted-foreground">{g.teamAvg}</td>
                          <td className="py-2 pl-3 text-center tabular-nums">
                            <span className={g.gap > 0 ? 'text-emerald-600 font-medium' : g.gap < 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                              {g.gap > 0 ? '+' : ''}{g.gap}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Bonus skills — only when any. Label is clear: outside
              the poste's requirements but the candidate scored on them. */}
          {bonusSkills && bonusSkills.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Compétences bonus (hors fiche de poste)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {bonusSkills.map(s => (
                  <Badge key={s.skillId} variant="outline" className="text-[10px]">
                    + {s.skillLabel} {s.score}/5
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 9. Historique complet ──────────────────────────
          Rendered outside isPending because early-stage transitions
          and notes/docs exist before the candidate ever submits. */}
      <div className="pt-4 border-t">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3">
          Historique complet
        </p>
        <CandidateHistoryByStage events={events} documents={documents} currentStatut={c.statut} />
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Sparkles, ChevronRight, X, RotateCcw, Clock, Copy } from 'lucide-react'
import {
  STATUT_LABELS,
  transitionConsequence,
} from '@/lib/constants'
import { toast } from 'sonner'
import CandidatePipelineStepper from './candidate-pipeline-stepper'
import CandidateScoreSummary from './candidate-score-summary'
import CandidateDocumentsPanel from './candidate-documents-panel'
import CandidateNotesSection from './candidate-notes-section'
// CandidateApplicationMessage hoisted to the page level (A.3) so the
// candidate's intake message sits between IdentityStrip and the
// candidature workspace, where the recruiter is already focused on
// the person's voice.
import AboroProfileSection from './aboro-profile-section'
import CandidateHistoryByStage from './candidate-history-by-stage'
import NoteEditDialog from './note-edit-dialog'
import DocumentStageReassignDialog from './document-stage-reassign-dialog'
// CandidateLastEditIndicator now lives in <CandidaturePosteHeader> at the page level.
import TimelineFilterChips from './timeline-filter-chips'
import { useTimelineFilter } from '@/hooks/use-timeline-filter'
import ScheduledEmailBanner from './scheduled-email-banner'
import FitReport from './fit-report'
import MultiPosteCard from './multi-poste-card'
import VisxRadarChart from '@/components/visx-radar-chart'
import QuickNoteComposer from './quick-note-composer'
import RevertCountdown from './revert-countdown'
import DocumentSlotSummary from './document-slot-summary'
import EvaluationDisclosure from './evaluation-disclosure'
import GapSynthesis, { type GapEntry } from './gap-synthesis'
// NextCriticalFactPill + isStatut moved into CandidaturePosteHeader (page level).
import RemindersPanel from './reminders-panel'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import type {
  CandidatureInfo, CandidatureEvent, CandidatureDocument, CandidateDetail,
  AboroProfile as AboroProfileType, MultiPosteEntry, BonusSkill, AllowedTransitions,
} from '@/hooks/use-candidate-data'

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
  currentUserSlug: string
  currentUserName?: string | null
  /** v5.1 — bumped by the page-level SSE handler when a fiche is mutated
   *  for this candidature in another tab. NextCriticalFactPill and
   *  CandidateHistoryByStage both forward it to their fiche children to
   *  trigger a refetch. */
  stageDataRefetchSignal?: number
}

const HISTORY_ANCHOR = 'historique-complet'
const DOCUMENTS_ANCHOR = 'documents-complet'

/**
 * Main workspace for the selected candidature. Flat scroll, editorial
 * hierarchy. The recruiter sees "where are they + what next" in the first
 * two screens, then digs into evidence and history on demand.
 *
 * Order (top → bottom):
 *   1. Candidature header row (poste + statut + inline utility buttons)
 *   2. Alerts band (scheduled email banner + soft-skill alerts)
 *   3. Pipeline stepper with "Action suivante" derived from
 *      allowedTransitions
 *   4. Scores + Actions 2-col. Every action button carries a consequence
 *      line so the recruiter knows what email will fire.
 *   5. Revert countdown (conditional, within 10 min of last status change)
 *   6. Journal récent + quick note composer — the trail surface the user
 *      explicitly asked to improve ("tracabilité peu optimal")
 *   7. Notes d'entretien (always available; previously hidden until submit)
 *   8. Document slot summary + full panel (anchor-linked)
 *   9. Évaluation détaillée disclosure — radar, fit report, gap synthesis,
 *      bonus skills, multi-poste compatibility, all packed behind one
 *      toggle so scores-first scan stays calm
 *  10. Historique complet (per-stage accordion, current-only open)
 *  11. Aboro profile (conditional)
 */
export default function CandidatureWorkspace(props: CandidatureWorkspaceProps) {
  const {
    candidature: c,
    candidate,
    events,
    setEvents,
    documents,
    setDocuments,
    setCandidatureDataMap,
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
    currentUserSlug,
    currentUserName,
    stageDataRefetchSignal,
  } = props

  const isPending = !candidate.submittedAt
  const submitted = !!candidate.submittedAt
  // `analysed` and `awaitingRadar` are now consumed by <CandidaturePosteHeader>
  // at the page level. Keep `isPending` + `submitted` here for the in-workspace
  // rails (handleReopen + scoring tiles + EvaluationDisclosure copy).
  const isTerminal = c.statut === 'embauche' || c.statut === 'refuse'

  /**
   * v5.1.x A.6 (codex Y6): the legacy 4-field "Notes d'entretien" form
   * (forces / vigilance / recommandation / libre) was the v4 evaluation
   * surface, superseded by per-stage fiches in v5. Hide its disclosure
   * entirely when the JSON blob has no actual content — empty `"{}"` and
   * empty strings shouldn't count as "data worth migrating". Combined
   * with a stage gate (skip at postule/preselectionne where the fields
   * never made sense), new candidates never see it at all.
   */
  const hasLegacyNoteContent = useMemo(() => {
    const raw = c.notesDirecteur
    if (!raw || !raw.trim()) return false
    // v4 stored JSON. Pre-v4 stored plain text — CandidateNotesSection's
    // parseNotes() falls back to treating raw text as the `libre` field
    // for back-compat (see candidate-notes-section.tsx:21-35). Mirror
    // that here so candidates with legacy plain-text notes can still
    // see + migrate them. JSON shape is the modern case; raw-non-JSON
    // is the legacy case; both count as "has content worth showing".
    try {
      const parsed = JSON.parse(raw) as { forces?: string; vigilance?: string; recommandation?: string; libre?: string }
      return [parsed.forces, parsed.vigilance, parsed.recommandation, parsed.libre]
        .some(v => typeof v === 'string' && v.trim().length > 0)
    } catch {
      // Not JSON → treat as legacy plain-text note (libre).
      return true
    }
  }, [c.notesDirecteur])

  /**
   * Revert-window detection — same logic as before. Extracted once from the
   * workspace so Journal récent can show a live preview of the email state
   * without recomputing it.
   */
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
        new Date(e.createdAt + 'Z').getTime() >= lastStatusTs - 1000,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latestEmailEvent = postStatusEmailEvents[0]
    const emailState: 'sent' | 'scheduled' | 'none' =
      latestEmailEvent?.type === 'email_sent' ? 'sent'
      : latestEmailEvent?.type === 'email_scheduled' ? 'scheduled'
      : 'none'

    // Backend explicitly rejects terminal revert when no pending scheduled
    // email remains (422 at recruitment.ts revert-status). Don't surface a
    // button that would 422 — the candidate has already received the
    // terminal email and the audit trail can't be rewritten.
    const terminalGuardFails = (lastStatusChange.statutTo === 'embauche' || lastStatusChange.statutTo === 'refuse') && emailState !== 'scheduled'
    if (terminalGuardFails) return null

    // v5.1.x A.4 + codex final-review: when the latest status_change is
    // the intake seed (statutFrom === null, statutTo === 'postule'),
    // the backend rejects revert with 409 "Premier événement — rien à
    // annuler". Don't render a button that can't work. The
    // `isInitialSentinel` guard above already drops the case where
    // statutFrom === statutTo, but a real intake row has statutFrom=null,
    // which falls through. Bail out here so RevertCountdown never sees
    // a null previousStatut in production.
    if (lastStatusChange.statutFrom == null) return null

    return {
      emailState,
      lastStatusChangeAt: lastStatusChange.createdAt,
      previousStatut: lastStatusChange.statutFrom,
    }
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
      toast.error('Erreur lors de la réouverture')
    }
  }

  const canCopyLink = !submitted
    && new Date(candidate.expiresAt) >= new Date()
    && (c.statut === 'postule' || c.statut === 'preselectionne' || c.statut === 'skill_radar_envoye')

  const handleJumpToDocuments = () => {
    const el = document.getElementById(DOCUMENTS_ANCHOR)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Append-only event helpers — used by the quick-note composer for the
  // optimistic round trip. We update both the flat state (the journal +
  // history both read from `events`) and the per-candidature map
  // (authoritative after a candidature switch) so a switch + come-back
  // doesn't lose the optimistic row.
  const prependEvent = (event: CandidatureEvent) => {
    setEvents(prev => [event, ...prev])
    setCandidatureDataMap(prev => {
      const entry = prev[c.id] ?? { events: [], allowedTransitions: null, documents: [] }
      return { ...prev, [c.id]: { ...entry, events: [event, ...entry.events] } }
    })
  }
  const replaceTempEvent = (tempId: number, real: CandidatureEvent) => {
    setEvents(prev => prev.map(e => e.id === tempId ? real : e))
    setCandidatureDataMap(prev => {
      const entry = prev[c.id]
      if (!entry) return prev
      return { ...prev, [c.id]: { ...entry, events: entry.events.map(e => e.id === tempId ? real : e) } }
    })
  }
  const rollbackTempEvent = (tempId: number) => {
    setEvents(prev => prev.filter(e => e.id !== tempId))
    setCandidatureDataMap(prev => {
      const entry = prev[c.id]
      if (!entry) return prev
      return { ...prev, [c.id]: { ...entry, events: entry.events.filter(e => e.id !== tempId) } }
    })
  }
  // Kept as a fallback for callers that don't drive the optimistic path.
  const handleNotePublished = prependEvent

  // v4.5: in-place note edit + per-doc stage reassignment.
  // Both surfaces are dialogs; the workspace owns their open/close
  // state so the historique can be a pure presentational layer.
  const [editingNote, setEditingNote] = useState<CandidatureEvent | null>(null)
  const [reassigningDoc, setReassigningDoc] = useState<CandidatureDocument | null>(null)
  // v4.6: client-side filter for the historique timeline. Persisted
  // per-candidature in localStorage via the helper hook, so the
  // recruiter's choice survives tab reloads (matches the eval-
  // disclosure pattern shipped in v4).
  const [timelineFilter, setTimelineFilter] = useTimelineFilter(c.id)
  const replaceEvent = (real: CandidatureEvent) => {
    setEvents(prev => prev.map(e => e.id === real.id ? real : e))
    setCandidatureDataMap(prev => {
      const entry = prev[c.id]
      if (!entry) return prev
      return { ...prev, [c.id]: { ...entry, events: entry.events.map(e => e.id === real.id ? real : e) } }
    })
  }
  const replaceDocumentEventId = (docId: string, eventId: number | null) => {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, event_id: eventId } : d))
    setCandidatureDataMap(prev => {
      const entry = prev[c.id]
      if (!entry) return prev
      return { ...prev, [c.id]: { ...entry, documents: entry.documents.map(d => d.id === docId ? { ...d, event_id: eventId } : d) } }
    })
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Operational utility row ────────────────────
          Posture header (poste title + statut + canal + date +
          presence + next-critical-fact pill) lives at the page level
          now — see <CandidaturePosteHeader> in candidate-detail-page.tsx.
          This row keeps only the operational button(s) the workspace
          owns (Rouvrir l'évaluation), and is hidden entirely when
          there's nothing to render. */}
      {submitted && (
        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReopen}
            className="gap-1.5 h-7 text-xs"
          >
            <RotateCcw className="h-3 w-3" />
            Rouvrir l'évaluation
          </Button>
        </div>
      )}

      {/* ── 1.35 Reminders panel (v5.2) ──
          Recruiter-set "rappel-moi le 30/04 sur Pierre". The
          daily-recap cron emails Guillaume a digest of due reminders +
          auto-derived alerts (entretien tomorrow, proposition
          deadline due, embauche arrival in NC). */}
      <RemindersPanel candidatureId={c.id} />

      {/* ── 1.4 DOSSIER status bar (hoisted v5.1.x A.7) ──
          Compact one-liner ("✓ CV ✓ Lettre — Rapport Aboro optionnel —
          Gérer →") right under the header row so the recruiter sees doc
          completeness BEFORE the command bar tells them what to do next.
          The full <CandidateDocumentsPanel> stays anchored at
          #DOCUMENTS_ANCHOR further down for actual upload/manage. */}
      <DocumentSlotSummary documents={documents} onJumpToPanel={handleJumpToDocuments} />

      {/* ── 1.5 Command bar — prominent next-action ──
          v4.6: lifted from a junior-designer mockup. The same primary
          + refuse actions live further down next to the scores, but
          surfacing them at the top removes the "scroll to find what
          to do" friction the founder flagged. The CTA is derived from
          `allowedTransitions[0]` so a terminal candidature or one
          waiting on the candidate doesn't display a dead button.
          Refuse renders only when `allowedTransitions` includes it. */}
      {!isTerminal && (primary || hasRefuse) && (
        <div className="rounded-md border bg-card p-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Prochaine action recommandée
            </p>
            <p className="text-sm text-foreground mt-0.5">
              {primary
                ? <>Faire avancer vers <span className="font-semibold">{STATUT_LABELS[primary] ?? primary}</span></>
                : <span className="italic text-muted-foreground">Aucune avance possible — uniquement refus disponible</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* v5.1.x A.5 (codex Y5 + design D-copy-1): auto-eval CTA hoisted
                from inside the score tiles into the command bar so it sits
                next to where the recruiter actually scans for "what to do
                next". Icon-only at <sm to avoid 3-button overflow on
                mobile. The clipboard icon already says "copy" — label
                drops the verb ("Lien Skill Radar") to save 6 chars. */}
            {canCopyLink && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                title="Copier le lien du formulaire d'auto-évaluation"
                aria-label="Copier le lien du formulaire d'auto-évaluation"
                onClick={handleCopyLink}
                className="gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Lien Skill Radar</span>
              </Button>
            )}
            {primary && (
              <Button
                size="default"
                onClick={() => onOpenTransition(c.id, primary, false, [], c.statut)}
                disabled={changingStatus}
                className="gap-2"
              >
                <ChevronRight className="h-4 w-4" />
                {STATUT_LABELS[primary] ?? primary}
              </Button>
            )}
            {hasRefuse && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenTransition(c.id, 'refuse', false, [], c.statut)}
                disabled={changingStatus}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3 mr-1" />
                Refuser
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── 2. Alerts band ─────────────────────────── */}
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
              ⚠ {a.message}
            </Badge>
          ))}
        </div>
      )}

      {/* ── 3. Pipeline stepper ────────────────────── */}
      <CandidatePipelineStepper
        candidature={c}
        events={events}
        allowedTransitions={allowedTransitions}
        onStepClick={(statut, intent) => {
          if (intent === 'navigate') {
            // Done / refused steps: scroll the historique to that stage.
            // The accordion's defaultOpen logic keeps the current stage
            // open; the stage they clicked may be collapsed — that's
            // fine, the scroll lands them at the section header.
            const el = document.getElementById(HISTORY_ANCHOR)
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else if (intent === 'advance') {
            // Future allowed step: open the transition dialog targeted at
            // that statut. Same code path as the primary CTA below the
            // scores — just a different entry.
            onOpenTransition(c.id, statut, false, [], c.statut)
          }
        }}
      />

      {/* ── 4. Scores + Actions ──────────────────────
          Two columns on desktop, stacks on mobile. Primary CTA is big
          and explicit; every alt/skip/refuse button shows a consequence
          line so the recruiter knows exactly what email (if any) will
          fire. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 pt-2 border-t">
        <div>
          <CandidateScoreSummary
            tauxGlobal={c.tauxGlobal}
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
            <p className="text-sm text-muted-foreground italic">
              Candidature en état terminal — aucune action disponible.
            </p>
          ) : !allowedTransitions || (forward.length === 0 && skips.length === 0 && !hasRefuse) ? (
            <p className="text-sm text-muted-foreground">Aucune action disponible</p>
          ) : (
            <div className="space-y-3">
              {primary && (
                <div>
                  <Button
                    size="default"
                    onClick={() => onOpenTransition(c.id, primary, false, [], c.statut)}
                    disabled={changingStatus}
                    className="w-full justify-start gap-2 h-10 text-sm font-medium"
                  >
                    <ChevronRight className="h-4 w-4" />
                    {STATUT_LABELS[primary] ?? primary}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1 ml-1">
                    {transitionConsequence(primary)}
                  </p>
                </div>
              )}

              {(others.length > 0 || skips.length > 0) && (
                <div className="pt-1 space-y-2">
                  {others.map(s => (
                    <div key={s}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenTransition(c.id, s, false, [], c.statut)}
                        disabled={changingStatus}
                        className="w-full justify-start gap-2"
                      >
                        <ChevronRight className="h-3 w-3" />
                        {STATUT_LABELS[s] ?? s}
                      </Button>
                      <p className="text-[10px] text-muted-foreground mt-0.5 ml-1">
                        {transitionConsequence(s)}
                      </p>
                    </div>
                  ))}
                  {skips.map(st => {
                    const skippedLabels = st.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')
                    return (
                      <div key={st.statut}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenTransition(c.id, st.statut, true, st.skipped, c.statut)}
                          disabled={changingStatus}
                          className="w-full justify-start gap-2 text-muted-foreground border border-dashed border-border"
                          title={`Sauter : ${skippedLabels}`}
                        >
                          {STATUT_LABELS[st.statut] ?? st.statut}
                          <span className="text-[10px] ml-auto">· saute {skippedLabels}</span>
                        </Button>
                        <p className="text-[10px] text-muted-foreground mt-0.5 ml-1">
                          Saute {skippedLabels} · {transitionConsequence(st.statut).toLowerCase()}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}

              {hasRefuse && (
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onOpenTransition(c.id, 'refuse', false, [], c.statut)}
                    disabled={changingStatus}
                    className="w-full justify-start gap-2"
                  >
                    <X className="h-3 w-3" />
                    Refuser la candidature
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-1">
                    {transitionConsequence('refuse')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Revert countdown (conditional) ────── */}
      {revertBlock && (
        <RevertCountdown
          lastStatusChangeAt={revertBlock.lastStatusChangeAt}
          emailState={revertBlock.emailState}
          previousStatut={revertBlock.previousStatut}
          disabled={busy}
          sendingNow={sendingNow === c.id}
          revertingStatus={revertingStatus === c.id}
          onSendNow={() => onSendNow(c.id)}
          onRevert={() => onRevert(c.id, revertBlock.emailState)}
        />
      )}

      {/* ── 6. Quick note composer (page-level) ──
          v4.5: dropped the separate "Journal récent" 5-row strip.
          The historique below is now THE timeline surface, with
          per-stage composers inside each accordion. This top-level
          composer lets the recruiter drop a quick note pinned to the
          current statut without expanding any stage. */}
      <QuickNoteComposer
        candidatureId={c.id}
        currentUserSlug={currentUserSlug}
        currentUserName={currentUserName}
        onPublished={handleNotePublished}
        onOptimisticPrepend={prependEvent}
        onReplaceTemp={replaceTempEvent}
        onRollbackTemp={rollbackTempEvent}
        placeholder={`Note rapide pour l'étape « ${STATUT_LABELS[c.statut] ?? c.statut} »…`}
      />

      {/* ── 7. Notes d'évaluation (legacy 4-field form, gated + collapsed) ──
          v5.1.x A.6 (codex Y6 + design D-copy-2): only render when the
          candidature actually has parsed legacy content AND we're at
          a stage where filling Forces / Vigilance / Recommandation
          made historical sense. New candidates never see this; legacy
          candidates with empty `notesDirecteur` don't either. Summary
          text is now a plain label, not a misleading instruction. */}
      {hasLegacyNoteContent && !['postule', 'preselectionne'].includes(c.statut) && (
        <details className="rounded-2xl border border-border/40 bg-muted/20">
          <summary className="cursor-pointer select-none px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors">
            Anciennes notes structurées
          </summary>
          <div className="px-1 pb-1">
            <CandidateNotesSection
              candidateId={candidate.id}
              candidatureId={c.id}
              notes={c.notesDirecteur ?? ''}
              onNotesChange={setNotes}
            />
          </div>
        </details>
      )}

      {/* ── 8. Documents: full panel (slot summary lives at top of workspace, A.7) ── */}
      <div id={DOCUMENTS_ANCHOR} className="scroll-mt-24">
        <CandidateDocumentsPanel
          candidatureId={c.id}
          documents={documents}
          setDocuments={setDocuments}
          setEvents={setEvents}
          setCandidatureDataMap={setCandidatureDataMap}
          currentStatut={c.statut}
        />
      </div>

      {/* ── 9. Évaluation détaillée disclosure ────── */}
      {isPending ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Clock className="mx-auto h-7 w-7 text-muted-foreground/50" />
            <h3 className="mt-3 text-sm font-medium">En attente de l'évaluation</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Radar, analyse IA et écarts sont disponibles après soumission du Skill Radar.
              {canCopyLink && ' Le lien d\'auto-évaluation se trouve sous les scores.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <EvaluationDisclosure
          candidatureId={c.id}
          defaultOpen={false}
          summary="Radar · Analyse IA · Candidat vs équipe · Compétences bonus"
        >
          <div className="grid gap-4 lg:grid-cols-2">
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
                    <span className="text-sm text-muted-foreground">Analyse en cours… (15-30 s)</span>
                  </div>
                ) : (
                  <p className="py-4 text-sm text-muted-foreground text-center">
                    Cliquez sur « Générer l'analyse » pour obtenir un rapport IA comparant ce candidat à l'équipe.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {multiPosteCompatibility.length > 0 && (
            <MultiPosteCard entries={multiPosteCompatibility} />
          )}

          <GapSynthesis gapAnalysis={gapAnalysis} />

          {bonusSkills && bonusSkills.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-2">
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
        </EvaluationDisclosure>
      )}

      {/* ── 10. Aboro profile (conditional) ─────── */}
      {!isPending && (
        <AboroProfileSection
          candidateId={candidate.id}
          aboroProfile={aboroProfile}
          hasCandidatures={true}
          onProfileUpdated={setAboroProfile}
        />
      )}

      {/* ── 11. Historique complet ────────────────
          v4.5: per-stage note composer hooks + edit pencil on note rows.
          The composer pins each note to its stage so retroactive notes
          attach to the right step in the pipeline. */}
      <div id={HISTORY_ANCHOR} className="pt-4 border-t scroll-mt-24">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Historique complet
          </p>
          {/* v4.6: filter chips. Pure client-side narrowing, persisted
              per-candidature so the recruiter's preference survives
              tab reloads. Composer + manual notes keep working under
              every filter so capture isn't blocked by view. */}
          <TimelineFilterChips
            value={timelineFilter}
            onChange={setTimelineFilter}
          />
        </div>
        <CandidateHistoryByStage
          events={events}
          documents={documents}
          currentStatut={c.statut}
          composer={{
            candidatureId: c.id,
            currentUserSlug,
            currentUserName,
            onPublished: handleNotePublished,
            onOptimisticPrepend: prependEvent,
            onReplaceTemp: replaceTempEvent,
            onRollbackTemp: rollbackTempEvent,
          }}
          onEditNote={setEditingNote}
          onReassignDoc={setReassigningDoc}
          filter={timelineFilter}
          candidatureId={c.id}
          stageDataRefetchSignal={stageDataRefetchSignal}
        />
      </div>

      {/* v4.5 dialogs — owned at the workspace level so the historique
          stays presentational. */}
      <NoteEditDialog
        open={!!editingNote}
        onOpenChange={(open) => { if (!open) setEditingNote(null) }}
        event={editingNote}
        candidatureId={c.id}
        onSaved={(real) => { replaceEvent(real); setEditingNote(null) }}
      />
      <DocumentStageReassignDialog
        open={!!reassigningDoc}
        onOpenChange={(open) => { if (!open) setReassigningDoc(null) }}
        doc={reassigningDoc}
        events={events}
        currentStatut={c.statut}
        onReassigned={(docId, eventId) => { replaceDocumentEventId(docId, eventId); setReassigningDoc(null) }}
      />
    </div>
  )
}

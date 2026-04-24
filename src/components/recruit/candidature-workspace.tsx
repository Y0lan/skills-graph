import { useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, ChevronRight } from 'lucide-react'
import { STATUT_LABELS, formatDateTime } from '@/lib/constants'
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
import type { CandidatureInfo, CandidatureEvent, CandidatureDocument, CandidateDetail, AboroProfile as AboroProfileType, MultiPosteEntry, BonusSkill } from '@/hooks/use-candidate-data'

interface GapEntry {
  skill: string
  category: string
  candidateScore: number
  teamAvg: number
  gap: number
}

type EvidenceTab = 'scores' | 'radar' | 'fit' | 'gaps'

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
  onSendNow: (candidatureId: string) => void
  onRevertScheduled: (candidatureId: string) => void
  /** Renders at the top of the "Profil IA détaillé" disclosure when the
   *  candidate has an aiProfile. The page passes the CandidateProfileCard. */
  profileDisclosure?: ReactNode
}

/** Main workspace for the SELECTED candidature. Renders in the left
 *  column of the 2-column page layout (rail on the right). Everything
 *  below the identity strip lives here, reorganized into 7 sections:
 *
 *   1. Status band (pipeline stepper + last-event summary)
 *   2. Alerts band (scheduled email banner + soft skill alerts) —
 *      conditional
 *   3. Evidence tabs (Scores always visible; Radar / Analyse IA / Écarts
 *      are lazy-rendered tabs)
 *   4. Communications (CandidateEmailsCard)
 *   5. Documents (slot checklist + full panel disclosure)
 *   6. Notes + Aboro (2-col, per-candidature notes + behavioral profile)
 *   7. Historique complet (per-stage accordion, outside isPending gate)
 *   8. Profil IA détaillé (disclosure at the bottom — optional)
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
    notes,
    setNotes,
    aboroProfile,
    setAboroProfile,
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
    onSendNow,
    onRevertScheduled,
    profileDisclosure,
  } = props

  const isPending = !candidate.submittedAt
  const submitted = !!candidate.submittedAt
  const analysed = submitted && !!candidate.aiReport

  // Evidence tab: default to Radar when submitted, else Analyse IA (which
  // shows the "generate" CTA), so the recruiter always lands on an
  // actionable tab rather than an empty one.
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>(() =>
    submitted ? 'radar' : (analysed ? 'fit' : 'scores')
  )

  const [documentsExpanded, setDocumentsExpanded] = useState<boolean>(() =>
    typeof window !== 'undefined' && localStorage.getItem('candidate-docs-expanded') === 'true'
  )
  const [profileExpanded, setProfileExpanded] = useState<boolean>(() =>
    typeof window !== 'undefined' && localStorage.getItem('candidate-profile-expanded') === 'true'
  )

  // Last status-change event for the "since" line in the status band.
  const lastStatus = [...events]
    .filter(e => e.type === 'status_change')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (b.id ?? 0) - (a.id ?? 0))[0]

  // Docs slot checklist. Keeps documents visible in BOTH the slot row and
  // the full panel (§Chesterton: history proof lives via event_id link in
  // the full panel — don't remove it to "dedupe").
  const docSlot = (() => {
    const has = (type: string) => documents.some(d => d.type === type && !d.deleted_at)
    return {
      cv: has('cv'),
      lettre: has('lettre'),
      aboro: has('aboro'),
      others: documents.filter(d => !d.deleted_at && !['cv', 'lettre', 'aboro'].includes(d.type)).length,
      pending: documents.some(d => !d.deleted_at && d.scan_status === 'pending'),
    }
  })()

  return (
    <div className="space-y-6">
      {/* ── 1. Status band ─────────────────────────────────── */}
      <div className="space-y-3">
        <CandidatePipelineStepper candidature={c} events={events} />
        {lastStatus && (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            Dernier événement : {formatDateTime(lastStatus.createdAt)} —{' '}
            statut{' '}
            <span className="text-foreground font-medium">
              {STATUT_LABELS[lastStatus.statutTo ?? ''] ?? lastStatus.statutTo}
            </span>
            {lastStatus.createdBy ? ` (${lastStatus.createdBy})` : ''}
          </p>
        )}
      </div>

      {/* ── 2. Alerts band ─────────────────────────────────── */}
      <ScheduledEmailBanner
        events={events}
        disabled={changingStatus || revertingStatus === c.id || sendingNow === c.id}
        onSendNow={() => onSendNow(c.id)}
        onCancel={() => onRevertScheduled(c.id)}
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

      {/* ── 3. Evidence ────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Evidence
          </p>
        </div>

        {/* Score tiles — always visible at the top of Evidence. */}
        <CandidateScoreSummary
          tauxPoste={c.tauxPoste}
          tauxEquipe={c.tauxEquipe}
          tauxSoft={c.tauxSoft}
          candidatureId={c.id}
        />

        {/* Tabs: Radar / Analyse IA / Écarts. Scores (tiles above) is the
            implicit always-on view. */}
        <div role="tablist" aria-label="Evidence views" className="mt-4 inline-flex rounded-md border border-border">
          {([
            { k: 'radar', label: 'Radar', disabled: !submitted },
            { k: 'fit', label: 'Analyse IA', disabled: false },
            { k: 'gaps', label: 'Écarts', disabled: !submitted },
          ] as const).map((t, i) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={evidenceTab === t.k}
              disabled={t.disabled}
              onClick={() => setEvidenceTab(t.k)}
              className={`px-3 h-8 text-xs transition-colors disabled:text-muted-foreground/50 disabled:cursor-not-allowed ${
                evidenceTab === t.k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/40'
              } ${i === 0 ? 'rounded-l-md' : ''} ${i === 2 ? 'rounded-r-md' : ''} ${i === 1 ? 'border-x' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3" role="tabpanel">
          {isPending && (evidenceTab === 'radar' || evidenceTab === 'gaps') ? (
            <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
              Disponible quand le candidat aura soumis son Skill Radar.
            </div>
          ) : evidenceTab === 'radar' ? (
            <div className="border rounded-md p-3">
              <VisxRadarChart
                data={candidateRadar}
                overlay={teamRadar}
                primaryLabel={candidate.name}
                overlayLabel="Moyenne équipe"
                showOverlayToggle
              />
            </div>
          ) : evidenceTab === 'fit' ? (
            <div className="border rounded-md p-4">
              {candidate.aiReport ? (
                <>
                  <FitReport report={candidate.aiReport} />
                  {multiPosteCompatibility.length > 0 && (
                    <div className="mt-4">
                      <MultiPosteCard entries={multiPosteCompatibility} />
                    </div>
                  )}
                </>
              ) : analyzing ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                  <span className="text-muted-foreground">Analyse en cours… (15-30 secondes)</span>
                </div>
              ) : (
                <div className="py-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Générez une analyse IA comparant ce candidat à l'équipe.
                  </p>
                  <Button onClick={onGenerateAnalysis} disabled={analyzing} size="sm">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Générer l'analyse
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* Gaps tab */
            <div className="border rounded-md">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pl-3 pr-4 pt-2 font-medium">Compétence</th>
                      <th className="pb-2 px-3 pt-2 font-medium text-center whitespace-nowrap w-20">Candidat</th>
                      <th className="pb-2 px-3 pt-2 font-medium text-center whitespace-nowrap w-16">Équipe</th>
                      <th className="pb-2 pl-3 pr-3 pt-2 font-medium text-center whitespace-nowrap w-14">Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gapAnalysis
                      .filter((g): g is GapEntry => g !== null)
                      .slice(0, 20)
                      .map((g, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pl-3 pr-4">{g.skill}</td>
                          <td className="py-2 px-3 text-center font-mono tabular-nums">{g.candidateScore}</td>
                          <td className="py-2 px-3 text-center font-mono tabular-nums text-muted-foreground">{g.teamAvg}</td>
                          <td className="py-2 pl-3 pr-3 text-center tabular-nums">
                            <span className={g.gap > 0 ? 'text-emerald-600 font-medium' : g.gap < 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                              {g.gap > 0 ? '+' : ''}{g.gap}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {bonusSkills && bonusSkills.length > 0 && (
                <div className="px-3 py-2 border-t bg-muted/20">
                  <p className="text-[11px] text-muted-foreground mb-1">
                    Compétences bonus (hors poste)
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
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Communications ─────────────────────────────── */}
      <section>
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-2">
          Communications
        </p>
        <CandidateEmailsCard events={events} />
      </section>

      {/* ── 5. Documents ──────────────────────────────────── */}
      <section>
        <button
          type="button"
          onClick={() => {
            const next = !documentsExpanded
            setDocumentsExpanded(next)
            localStorage.setItem('candidate-docs-expanded', String(next))
          }}
          className="w-full flex items-baseline justify-between py-2 border-b hover:bg-muted/20 px-1 rounded transition-colors"
        >
          <span className="flex items-center gap-2">
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${documentsExpanded ? 'rotate-90' : ''}`}
            />
            <span className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Documents
            </span>
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            <span className={docSlot.cv ? 'text-emerald-600' : 'text-muted-foreground/50'}>CV {docSlot.cv ? '✓' : '—'}</span>
            <span className="mx-2">·</span>
            <span className={docSlot.lettre ? 'text-emerald-600' : 'text-muted-foreground/50'}>Lettre {docSlot.lettre ? '✓' : '—'}</span>
            <span className="mx-2">·</span>
            <span className={docSlot.aboro ? 'text-emerald-600' : 'text-muted-foreground/50'}>Aboro {docSlot.aboro ? '✓' : '—'}</span>
            {docSlot.others > 0 && <><span className="mx-2">·</span>Autres ({docSlot.others})</>}
            {docSlot.pending && <span className="ml-2 text-amber-600">· scan en cours</span>}
          </span>
        </button>
        {documentsExpanded && (
          <div className="pt-3">
            <CandidateDocumentsPanel
              candidatureId={c.id}
              documents={documents}
              setDocuments={setDocuments}
              setEvents={setEvents}
              setCandidatureDataMap={setCandidatureDataMap}
              currentStatut={c.statut}
            />
          </div>
        )}
      </section>

      {/* ── 6. Notes + Aboro ──────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
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
      </section>

      {/* ── 7. Historique complet ─────────────────────────── */}
      <section>
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-2">
          Historique complet
        </p>
        <CandidateHistoryByStage events={events} documents={documents} currentStatut={c.statut} />
      </section>

      {/* ── 8. Profil IA détaillé (disclosure) ────────────── */}
      {profileDisclosure && (
        <section>
          <button
            type="button"
            onClick={() => {
              const next = !profileExpanded
              setProfileExpanded(next)
              localStorage.setItem('candidate-profile-expanded', String(next))
            }}
            className="w-full flex items-baseline justify-between py-2 border-b hover:bg-muted/20 px-1 rounded transition-colors"
          >
            <span className="flex items-center gap-2">
              <ChevronRight
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${profileExpanded ? 'rotate-90' : ''}`}
              />
              <span className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                Profil IA détaillé
              </span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              {profileExpanded ? 'Replier' : 'Dérouler'}
            </span>
          </button>
          {profileExpanded && <div className="pt-4">{profileDisclosure}</div>}
        </section>
      )}
    </div>
  )
}

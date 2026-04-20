import { useCallback, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AppHeader from '@/components/app-header'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import FitReport from '@/components/recruit/fit-report'
import MultiPosteCard from '@/components/recruit/multi-poste-card'
import CandidatePipelineStepper from '@/components/recruit/candidate-pipeline-stepper'
import CandidateScoreSummary from '@/components/recruit/candidate-score-summary'
import CandidateDossierCard from '@/components/recruit/candidate-dossier-card'
import CandidateHistoryByStage from '@/components/recruit/candidate-history-by-stage'
import CandidateNotesSection from '@/components/recruit/candidate-notes-section'
import AboroProfileSection from '@/components/recruit/aboro-profile-section'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Loader2, Sparkles, Clock, AlertTriangle, Mail, Phone, Globe, MapPin, AlertCircle, RotateCcw, Upload, X, Calendar, FileText, Wand2 } from 'lucide-react'
import { STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, formatDateTime } from '@/lib/constants'
import { useCandidateData } from '@/hooks/use-candidate-data'
import { useTransitionState } from '@/hooks/use-transition-state'
import { useNavigate } from 'react-router-dom'

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    candidate, setCandidate,
    teamData,
    categories,
    loading,
    candidatures, setCandidatures,
    events, setEvents,
    documents, setDocuments,
    aboroProfile, setAboroProfile,
    allowedTransitions, setAllowedTransitions,
    multiPosteCompatibility,
    bonusSkills,
    notes, setNotes,
    candidatureDataMap,
  } = useCandidateData(id)

  const {
    changingStatus,
    transitionDialog,
    transitionNotes, setTransitionNotes,
    transitionSkipReason, setTransitionSkipReason,
    transitionFile, setTransitionFile,
    transitionSendEmail, setTransitionSendEmail,
    transitionSkipEmailReason, setTransitionSkipEmailReason,
    transitionIncludeReason, setTransitionIncludeReason,
    transitionEmailSubject,
    transitionEmailBody, setTransitionEmailBody,
    transitionEmailExpanded, setTransitionEmailExpanded,
    transitionShowMarkdownPreview, setTransitionShowMarkdownPreview,
    transitionAboroDate, setTransitionAboroDate,
    transitionHasEmailTemplate,
    transitionEmailLoading,
    transitionFileError,
    openTransitionDialog,
    closeTransitionDialog,
    confirmTransition,
  } = useTransitionState(allowedTransitions, setCandidatures, setEvents, setAllowedTransitions)

  const [analyzing, setAnalyzing] = useState(false)
  const [revertingStatus, setRevertingStatus] = useState<string | null>(null)

  const handleRevertStatus = useCallback(async (candidatureId: string) => {
    if (!confirm('Annuler la dernière transition ? La candidature revient au statut précédent. Aucun email n’est envoyé automatiquement.')) return
    setRevertingStatus(candidatureId)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/revert-status`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const { statut } = await res.json() as { statut: string }
      setCandidatures(prev => prev.map(c => c.id === candidatureId ? { ...c, statut } : c))
      // Refresh events + transitions for this candidature
      const [detail, transitions] = await Promise.all([
        fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/recruitment/candidatures/${candidatureId}/transitions`, { credentials: 'include' }).then(r => r.json()),
      ])
      if (detail?.events) setEvents(detail.events)
      if (transitions) setAllowedTransitions(transitions)
      toast.success(`Transition annulée — retour à ${statut}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setRevertingStatus(null)
    }
  }, [setCandidatures, setEvents, setAllowedTransitions])

  // Wrap openTransitionDialog to inject candidate name & role & currentStatut
  const handleOpenTransition = useCallback((candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[], currentStatut?: string) => {
    openTransitionDialog(
      candidatureId,
      targetStatut,
      isSkip,
      skipped,
      candidate?.name ?? '',
      candidate?.role ?? '',
      currentStatut,
    )
  }, [openTransitionDialog, candidate])

  // Fetch sibling candidates for prev/next navigation
  const [siblings, setSiblings] = useState<{ id: string; name: string }[]>([])
  useState(() => {
    fetch('/api/candidates', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((all: { id: string; name: string }[]) => setSiblings(all))
      .catch((err) => {
        console.error('Failed to load sibling candidates:', err)
      })
  })
  const currentIndex = siblings.findIndex(c => c.id === id)
  const prevCandidate = currentIndex > 0 ? siblings[currentIndex - 1] : null
  const nextCandidate = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null

  const generateAnalysis = useCallback(async () => {
    if (!id) return
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/candidates/${id}/analyze`, { method: 'POST' })
      if (!res.ok) throw new Error('Erreur lors de l\'analyse')
      const data = await res.json()
      setCandidate(prev => prev ? { ...prev, aiReport: data.report } : null)
      toast.success('Analyse generee')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setAnalyzing(false)
    }
  }, [id, setCandidate])

  // File drop handler for the transition dialog
  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) setTransitionFile(file)
  }, [setTransitionFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setTransitionFile(file)
  }, [setTransitionFile])

  // Gap analysis: where candidate fills team gaps (memoized)
  const gapAnalysis = useMemo(() => {
    if (!candidate) return []
    return categories.flatMap(cat =>
      cat.skills.map(skill => {
        const candidateScore = candidate.ratings[skill.id] ?? 0
        if (candidateScore === 0) return null
        const memberScores = teamData?.members?.map(m => {
          return m.skillRatings?.[skill.id] ?? 0
        }) ?? []
        const validScores = memberScores.filter(v => v > 0)
        const teamAvg = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0
        const gap = candidateScore - teamAvg
        return { skill: skill.label, category: cat.label, candidateScore, teamAvg: Math.round(teamAvg * 10) / 10, gap: Math.round(gap * 10) / 10 }
      }).filter(Boolean)
    ).sort((a, b) => (b?.gap ?? 0) - (a?.gap ?? 0))
  }, [candidate, categories, teamData])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-2xl font-bold">Candidat introuvable</h1>
            <Link to="/recruit" className="mt-4 inline-block text-primary underline">
              Retour au recrutement
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Compute category-level averages for radar
  const candidateRadar: RadarDataPoint[] = categories.map(cat => {
    const skills = cat.skills.map(s => candidate.ratings[s.id] ?? 0)
    const rated = skills.filter(v => v > 0)
    return {
      label: cat.label.replace(/&/g, '\n&'),
      value: rated.length > 0 ? rated.reduce((a, b) => a + b, 0) / rated.length : 0,
      fullMark: 5,
    }
  })

  const teamRadar: RadarDataPoint[] = categories.map(cat => {
    if (!teamData?.members?.length) return { label: cat.label, value: 0, fullMark: 5 }
    const memberAvgs = teamData.members.map(m => m.categoryAverages?.[cat.id] ?? 0)
    const validAvgs = memberAvgs.filter(v => v > 0)
    return {
      label: cat.label.replace(/&/g, '\n&'),
      value: validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0,
      fullMark: 5,
    }
  })

  const isPending = !candidate.submittedAt

  const showEmailSection = transitionDialog &&
    transitionDialog.targetStatut !== 'skill_radar_complete' &&
    (transitionHasEmailTemplate || transitionEmailLoading)

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 pt-16 pb-8">
        {/* ── BACK + NAVIGATION ── */}
        <div className="flex items-center justify-between mb-4">
          <Link to="/recruit" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          {siblings.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!prevCandidate}
                onClick={() => prevCandidate && navigate(`/recruit/${prevCandidate.id}`)}
                className="gap-1 h-7 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">{prevCandidate?.name ?? 'Prec.'}</span>
              </Button>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {currentIndex + 1}/{siblings.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!nextCandidate}
                onClick={() => nextCandidate && navigate(`/recruit/${nextCandidate.id}`)}
                className="gap-1 h-7 px-2"
              >
                <span className="text-xs hidden sm:inline">{nextCandidate?.name ?? 'Suiv.'}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* ══════════ ABOVE THE FOLD ══════════ */}

        {/* ── 1. IDENTITY HEADER ── */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
              {candidate.name}
              {candidatures.length > 1 && (
                <Badge variant="outline" className="text-[11px] font-normal" title="Ce candidat a plusieurs candidatures actives">
                  {candidatures.length} candidatures
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground">
              {candidatures.length > 0
                ? candidatures.map(c => c.posteTitre).filter(Boolean).join(' · ')
                : candidate.role /* edge case: candidate without any candidature (manual create) */}
            </p>

            {/* Contact info */}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground max-w-full">
              {candidate.email && (
                <a href={`mailto:${candidate.email}`} className="flex items-center gap-1 hover:text-foreground min-w-0 max-w-full">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate" title={candidate.email}>{candidate.email}</span>
                </a>
              )}
              {candidate.telephone && (
                <span className="flex items-center gap-1 min-w-0">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{candidate.telephone}</span>
                </span>
              )}
              {candidate.pays && (
                <span className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{candidate.pays}</span>
                </span>
              )}
              {candidate.linkedinUrl && (
                <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" /> LinkedIn
                </a>
              )}
              {candidate.githubUrl && (
                <a href={candidate.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" /> GitHub
                </a>
              )}
            </div>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {isPending ? (
              <Badge variant="secondary">
                <Clock className="mr-1 h-3 w-3" /> En attente
              </Badge>
            ) : candidate.aiReport ? (
              <Badge variant="default" className="bg-[#1B6179]">Analyse</Badge>
            ) : (
              <Badge variant="default" className="bg-primary">Soumis</Badge>
            )}
            {candidate.canal && (
              <Badge variant="outline" className="text-xs">
                {CANAL_LABELS[candidate.canal] ?? candidate.canal}
              </Badge>
            )}
            {candidate.hasCv && (
              <Badge variant="outline" className="text-xs">CV uploade</Badge>
            )}
            {candidate.submittedAt && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const res = await fetch(`/api/evaluate/${candidate.id}/reopen`, {
                    method: 'POST',
                    credentials: 'include',
                  })
                  if (res.ok) {
                    toast.success('Evaluation rouverte — le candidat peut modifier ses reponses')
                    window.location.reload()
                  } else {
                    toast.error('Erreur lors de la reouverture')
                  }
                }}
                className="gap-1.5 h-7"
              >
                <RotateCcw className="h-3 w-3" />
                Rouvrir
              </Button>
            )}
          </div>
        </div>

        {/* ── 2. PER-CANDIDATURE: STEPPER + SCORES + DOSSIER + ACTIONS ── */}
        {candidatures.map(c => {
          const cData = candidatureDataMap?.[c.id]
          const cEvents = cData?.events ?? events
          const cTransitions = cData?.allowedTransitions ?? allowedTransitions
          const cDocuments = cData?.documents ?? documents

          return (
            <Card key={c.id} className="mt-6">
              <CardContent className="py-5 px-5 space-y-5">
                {/* Candidature context */}
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm font-medium">{c.posteTitre}</p>
                  <Badge variant="secondary" className={`text-xs ${STATUT_COLORS[c.statut] ?? ''}`}>
                    {STATUT_LABELS[c.statut] ?? c.statut}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {CANAL_LABELS[c.canal] ?? c.canal} · {formatDateTime(c.createdAt)}
                  </span>
                </div>

                {/* Soft skill alerts */}
                {c.softSkillAlerts && c.softSkillAlerts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.softSkillAlerts.map((a, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                        {'\u26A0'} {a.message}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Pipeline stepper */}
                <CandidatePipelineStepper candidature={c} events={cEvents} />

                {/* 3-column grid: Dossier | Scores | Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
                  {/* Dossier */}
                  <CandidateDossierCard
                    candidatureId={c.id}
                    documents={cDocuments}
                    setDocuments={setDocuments}
                    setEvents={setEvents}
                    currentStatut={c.statut}
                  />

                  {/* Scores */}
                  <CandidateScoreSummary
                    tauxPoste={c.tauxPoste}
                    tauxEquipe={c.tauxEquipe}
                    tauxSoft={c.tauxSoft}
                    candidatureId={c.id}
                  />

                  {/* Actions */}
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>
                    {cTransitions && (cTransitions.allowedTransitions.length > 0 || cTransitions.skipTransitions.length > 0) ? (
                      <div className="flex flex-col gap-2">
                        {/* Normal forward transitions */}
                        {cTransitions.allowedTransitions.filter(s => s !== 'refuse').map(s => (
                          <Button
                            key={s}
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenTransition(c.id, s, false, [], c.statut)}
                            disabled={changingStatus}
                            className="justify-start gap-2"
                          >
                            <ChevronRight className="h-3 w-3" />
                            {STATUT_LABELS[s] ?? s}
                          </Button>
                        ))}
                        {/* Skip transitions */}
                        {cTransitions.skipTransitions.map(st => (
                          <Button
                            key={st.statut}
                            size="sm"
                            variant="ghost"
                            className="justify-start text-muted-foreground"
                            onClick={() => handleOpenTransition(c.id, st.statut, true, st.skipped, c.statut)}
                            disabled={changingStatus}
                          >
                            {STATUT_LABELS[st.statut] ?? st.statut}
                            <span className="text-[10px] ml-1">(sauter {st.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')})</span>
                          </Button>
                        ))}
                        {/* Refuse */}
                        {cTransitions.allowedTransitions.includes('refuse') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleOpenTransition(c.id, 'refuse', false, [], c.statut)}
                            disabled={changingStatus}
                            className="justify-start gap-2 mt-1"
                          >
                            <X className="h-3 w-3" />
                            Refuser
                          </Button>
                        )}

                        {/* Revert last transition (within 10 min, non-terminal) */}
                        {(() => {
                          const lastStatusChange = cEvents.filter(e => e.type === 'status_change' && e.statutTo).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                          if (!lastStatusChange) return null
                          const ageMs = Date.now() - new Date(lastStatusChange.createdAt + 'Z').getTime()
                          if (ageMs > 10 * 60 * 1000) return null
                          if (lastStatusChange.statutTo === 'embauche' || lastStatusChange.statutTo === 'refuse') return null
                          return (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="justify-start gap-2 mt-2 text-muted-foreground"
                              disabled={changingStatus || revertingStatus === c.id}
                              onClick={() => handleRevertStatus(c.id)}
                            >
                              <RotateCcw className="h-3 w-3" />
                              {revertingStatus === c.id ? 'Annulation…' : 'Annuler la dernière transition'}
                              <span className="text-[10px] text-muted-foreground/60 ml-1">
                                ({Math.max(1, Math.round((10 * 60 * 1000 - ageMs) / 60000))}min restantes)
                              </span>
                            </Button>
                          )
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Aucune action disponible</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {/* ── TRANSITION DIALOG ── */}
        <AlertDialog open={!!transitionDialog} onOpenChange={(open) => { if (!open) closeTransitionDialog() }}>
          <AlertDialogContent size="lg">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {transitionDialog?.targetStatut === 'refuse'
                  ? 'Refuser cette candidature ?'
                  : transitionDialog?.targetStatut === 'embauche'
                    ? 'Confirmer l\'embauche ?'
                    : `Passer a : ${STATUT_LABELS[transitionDialog?.targetStatut ?? ''] ?? transitionDialog?.targetStatut}`
                }
              </AlertDialogTitle>
              <AlertDialogDescription>
                {transitionDialog?.isSkip && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 mb-2">
                    <AlertCircle className="h-4 w-4" />
                    Vous sautez : {transitionDialog.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')}
                  </span>
                )}
                {transitionDialog?.targetStatut === 'embauche' && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Cette action est definitive.</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4 py-2">
              {/* 1. Email preview section (first -- external consequence) */}
              {showEmailSection && (
                <div className="rounded-lg border">
                  {transitionEmailLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement du modele d'email...
                    </div>
                  ) : transitionHasEmailTemplate && (
                    <>
                      {/* Collapsed header */}
                      <button
                        type="button"
                        onClick={() => setTransitionEmailExpanded(!transitionEmailExpanded)}
                        className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-muted/50 rounded-t-lg transition-colors"
                      >
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">Email au candidat</span>
                        {transitionEmailSubject && (
                          <span className="text-muted-foreground truncate ml-1 text-xs">— {transitionEmailSubject}</span>
                        )}
                        {transitionEmailExpanded
                          ? <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground shrink-0" />
                        }
                      </button>

                      {/* Expanded content */}
                      {transitionEmailExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t">
                          <div className="pt-2">
                            <label className="text-xs font-medium text-muted-foreground">Objet</label>
                            <Input
                              value={transitionEmailSubject}
                              readOnly
                              className="mt-1 text-sm bg-muted/30"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Corps du message</label>
                            <Textarea
                              value={transitionEmailBody}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionEmailBody(e.target.value)}
                              rows={6}
                              className="mt-1 text-sm"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground gap-1.5"
                            disabled
                          >
                            <Wand2 className="h-3 w-3" />
                            Rediger avec l'IA
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Email toggle for statuses without templates (non skill_radar_complete) */}
              {transitionDialog?.targetStatut &&
                transitionDialog.targetStatut !== 'skill_radar_complete' &&
                !transitionHasEmailTemplate &&
                !transitionEmailLoading &&
                transitionDialog.targetStatut !== 'refuse' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={transitionSendEmail}
                        onChange={(e) => setTransitionSendEmail(e.target.checked)}
                        className="rounded border-input"
                      />
                      <span className="text-sm">
                        {transitionDialog.targetStatut === 'skill_radar_envoye'
                          ? "Envoyer le lien d'évaluation par email au candidat"
                          : 'Envoyer un email de notification au candidat'}
                      </span>
                    </label>
                    {transitionSendEmail && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={async () => {
                          if (!transitionDialog) return
                          try {
                            const res = await fetch('/api/recruitment/emails/preview', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({
                                candidatureId: transitionDialog.candidatureId,
                                statut: transitionDialog.targetStatut,
                                customBody: transitionEmailBody.trim() || undefined,
                                notes: transitionNotes.trim() || undefined,
                                includeReasonInEmail: transitionIncludeReason,
                              }),
                            })
                            if (!res.ok) {
                              const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
                              throw new Error(body.error || `HTTP ${res.status}`)
                            }
                            const { subject, html } = await res.json() as { subject: string; html: string }
                            const w = window.open('', '_blank', 'width=720,height=900')
                            if (w) {
                              w.document.write(`<!doctype html><html><head><title>Aperçu — ${subject}</title></head><body>${html}</body></html>`)
                              w.document.close()
                            }
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Erreur aperçu')
                          }
                        }}
                      >
                        <Mail className="h-3 w-3 mr-1" />
                        Aperçu HTML
                      </Button>
                    )}
                  </div>
                  {!transitionSendEmail && (
                    <div>
                      <label htmlFor="skip-email-reason" className="text-xs font-medium text-muted-foreground">
                        Raison de ne pas envoyer (10 caractères min, audit-loggée)
                      </label>
                      <Textarea
                        id="skip-email-reason"
                        value={transitionSkipEmailReason}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionSkipEmailReason(e.target.value)}
                        placeholder="ex. Email envoyé manuellement à Marie hier soir"
                        rows={2}
                        maxLength={500}
                        className="mt-1 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{transitionSkipEmailReason.length}/500</p>
                    </div>
                  )}
                </div>
              )}

              {/* Include reason checkbox for refuse */}
              {transitionDialog?.targetStatut === 'refuse' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transitionIncludeReason}
                    onChange={(e) => setTransitionIncludeReason(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">Inclure le motif dans l'email au candidat</span>
                </label>
              )}

              {/* Skip reason */}
              {transitionDialog?.isSkip && (
                <div>
                  <label className="text-sm font-medium">Raison du saut (obligatoire)</label>
                  <Textarea
                    value={transitionSkipReason}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionSkipReason(e.target.value)}
                    placeholder="Pourquoi sauter cette etape ?"
                    rows={2}
                    className="mt-1"
                  />
                </div>
              )}

              {/* 2. Notes section (markdown) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">
                    Notes internes{' '}
                    {transitionDialog?.notesRequired && (
                      <span className="text-muted-foreground font-normal">(obligatoire)</span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => setTransitionShowMarkdownPreview(!transitionShowMarkdownPreview)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {transitionShowMarkdownPreview ? 'Editer' : 'Apercu'}
                  </button>
                </div>
                {transitionShowMarkdownPreview ? (
                  <div className="rounded-md border px-3 py-2 min-h-[80px] prose prose-sm dark:prose-invert max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                    {transitionNotes.trim() ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{transitionNotes}</ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic">Aucune note</p>
                    )}
                  </div>
                ) : (
                  <Textarea
                    value={transitionNotes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionNotes(e.target.value)}
                    placeholder="Notes en markdown..."
                    rows={3}
                  />
                )}
              </div>

              {/* 3. Files section */}
              <div className="space-y-2">
                {/* Aboro date picker */}
                {transitionDialog?.targetStatut === 'aboro' && (
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Date de passage Aboro
                    </label>
                    <Input
                      type="date"
                      value={transitionAboroDate}
                      onChange={(e) => setTransitionAboroDate(e.target.value)}
                      className="mt-1 w-auto"
                    />
                  </div>
                )}

                {/* File drop zone */}
                <div>
                  {transitionFile ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1.5 text-xs py-1 px-2">
                        <FileText className="h-3 w-3" />
                        {transitionFile.name}
                        <button
                          type="button"
                          onClick={() => setTransitionFile(null)}
                          className="ml-1 hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    </div>
                  ) : (
                    <div
                      onDrop={handleFileDrop}
                      onDragOver={(e) => e.preventDefault()}
                      className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => document.getElementById('transition-file-input')?.click()}
                    >
                      <Upload className="h-4 w-4 mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Glisser un fichier ou cliquer pour ajouter
                      </p>
                      <input
                        id="transition-file-input"
                        type="file"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </div>
                  )}
                </div>

                {/* File error */}
                {transitionFileError && (
                  <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{transitionFileError}</span>
                  </div>
                )}
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={changingStatus}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmTransition}
                disabled={changingStatus}
                className={transitionDialog?.targetStatut === 'refuse' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              >
                {changingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {transitionDialog?.targetStatut === 'refuse' ? 'Refuser' :
                 transitionDialog?.targetStatut === 'embauche' ? 'Confirmer l\'embauche' :
                 'Confirmer'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ══════════ BELOW THE FOLD ══════════ */}

        {isPending ? (
          <Card className="mt-8">
            <CardContent className="p-12 text-center">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h2 className="mt-4 text-lg font-medium">En attente de l'evaluation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Le candidat n'a pas encore soumis son evaluation.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 2-column: Notes + Radar/Fit */}
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {/* Left: Recruiter notes */}
              <div className="space-y-6">
                {candidatures[0]?.id && (
                  <CandidateNotesSection
                    candidateId={candidate.id}
                    candidatureId={candidatures[0].id}
                    notes={candidatures[0]?.notesDirecteur ?? notes}
                    onNotesChange={setNotes}
                  />
                )}

                {/* Behavioral profile (Aboro) */}
                <AboroProfileSection
                  candidateId={candidate.id}
                  aboroProfile={aboroProfile}
                  hasCandidatures={candidatures.length > 0}
                  onProfileUpdated={setAboroProfile}
                />
              </div>

              {/* Right: Radar + Fit report */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Radar — Candidat vs Equipe</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <VisxRadarChart
                      data={candidateRadar}
                      overlay={teamRadar}
                      primaryLabel={candidate.name}
                      overlayLabel="Moyenne equipe"
                      showOverlayToggle
                    />
                  </CardContent>
                </Card>

                {/* AI Report */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Analyse IA</CardTitle>
                    {!candidate.aiReport && (
                      <Button onClick={generateAnalysis} disabled={analyzing} size="sm">
                        {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Generer l'analyse
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {candidate.aiReport ? (
                      <FitReport report={candidate.aiReport} />
                    ) : analyzing ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                        <span className="text-muted-foreground">Analyse en cours... (15-30 secondes)</span>
                      </div>
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Cliquez sur &laquo; Generer l'analyse &raquo; pour obtenir un rapport IA comparant ce candidat a l'equipe.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Multi-poste compatibility */}
                {multiPosteCompatibility.length > 0 && (
                  <MultiPosteCard entries={multiPosteCompatibility} />
                )}
              </div>
            </div>

            {/* Gap analysis */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Analyse des ecarts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Competence</th>
                        <th className="pb-2 px-3 font-medium text-center whitespace-nowrap w-20">Candidat</th>
                        <th className="pb-2 px-3 font-medium text-center whitespace-nowrap w-16">Equipe</th>
                        <th className="pb-2 pl-3 font-medium text-center whitespace-nowrap w-14">Ecart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gapAnalysis.slice(0, 20).map((g, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-4">{g!.skill}</td>
                          <td className="py-2 px-3 text-center font-mono">{g!.candidateScore}</td>
                          <td className="py-2 px-3 text-center font-mono text-muted-foreground">{g!.teamAvg}</td>
                          <td className="py-2 pl-3 text-center">
                            <span className={g!.gap > 0 ? 'text-green-600 font-medium' : g!.gap < 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                              {g!.gap > 0 ? '+' : ''}{g!.gap}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Bonus skills */}
            {bonusSkills && bonusSkills.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">Competences bonus (hors poste)</p>
                <div className="flex flex-wrap gap-1.5">
                  {bonusSkills.map((s) => (
                    <Badge key={s.skillId} variant="outline" className="text-[10px]">
                      + {s.skillLabel} {s.score}/5
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* ── FULL HISTORY BY STAGE ── */}
            {candidatures.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-base">Historique complet</CardTitle>
                </CardHeader>
                <CardContent>
                  {candidatures.map(c => {
                    const cData = candidatureDataMap?.[c.id]
                    const cEvents = cData?.events ?? events
                    return (
                      <div key={c.id}>
                        {candidatures.length > 1 && (
                          <p className="text-xs font-medium text-muted-foreground mb-2 mt-4 first:mt-0">
                            {c.posteTitre}
                          </p>
                        )}
                        <CandidateHistoryByStage events={cEvents} currentStatut={c.statut} />
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}

import { useCallback, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AppHeader from '@/components/app-header'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import FitReport from '@/components/recruit/fit-report'
import MultiPosteCard from '@/components/recruit/multi-poste-card'
import CandidateStatusBar from '@/components/recruit/candidate-status-bar'
import CandidateNotesSection from '@/components/recruit/candidate-notes-section'
import CandidateDocumentsPanel from '@/components/recruit/candidate-documents-panel'
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
import { STATUT_LABELS } from '@/lib/constants'
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

  // Wrap openTransitionDialog to inject candidate name & role
  const handleOpenTransition = useCallback((candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[]) => {
    openTransitionDialog(
      candidatureId,
      targetStatut,
      isSkip,
      skipped,
      candidate?.name ?? '',
      candidate?.role ?? '',
    )
  }, [openTransitionDialog, candidate])

  // Fetch sibling candidates for prev/next navigation
  const [siblings, setSiblings] = useState<{ id: string; name: string }[]>([])
  useState(() => {
    fetch('/api/candidates', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((all: { id: string; name: string }[]) => setSiblings(all))
      .catch(() => {})
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
      toast.success('Analyse générée')
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

  // Gap analysis: where candidate fills team gaps
  const gapAnalysis = categories.flatMap(cat =>
    cat.skills.map(skill => {
      const candidateScore = candidate.ratings[skill.id] ?? 0
      if (candidateScore === 0) return null
      const memberScores = teamData?.members?.map(m => {
        const memberRatings = (m as unknown as { skillRatings?: Record<string, number> }).skillRatings
        return memberRatings?.[skill.id] ?? 0
      }) ?? []
      const validScores = memberScores.filter(v => v > 0)
      const teamAvg = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0
      const gap = candidateScore - teamAvg
      return { skill: skill.label, category: cat.label, candidateScore, teamAvg: Math.round(teamAvg * 10) / 10, gap: Math.round(gap * 10) / 10 }
    }).filter(Boolean)
  ).sort((a, b) => (b?.gap ?? 0) - (a?.gap ?? 0))

  const isPending = !candidate.submittedAt

  const showEmailSection = transitionDialog &&
    transitionDialog.targetStatut !== 'skill_radar_complete' &&
    (transitionHasEmailTemplate || transitionEmailLoading)

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 pt-16 pb-8">
        <Link to="/recruit" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">{candidate.name}</h1>
            <p className="text-muted-foreground">{candidate.role}</p>
          </div>
          {isPending ? (
            <Badge variant="secondary" className="ml-auto">
              <Clock className="mr-1 h-3 w-3" /> En attente
            </Badge>
          ) : candidate.aiReport ? (
            <Badge variant="default" className="ml-auto bg-[#1B6179]">Analysé</Badge>
          ) : (
            <Badge variant="default" className="ml-auto bg-primary">Soumis</Badge>
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
                  toast.success('Évaluation rouverte — le candidat peut modifier ses réponses')
                  window.location.reload()
                } else {
                  toast.error('Erreur lors de la réouverture')
                }
              }}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rouvrir l'évaluation
            </Button>
          )}
        </div>

        {/* Contact info */}
        {(candidate.email || candidate.telephone || candidate.pays) && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {candidate.email && (
              <a href={`mailto:${candidate.email}`} className="flex items-center gap-1 hover:text-foreground">
                <Mail className="h-3.5 w-3.5" /> {candidate.email}
              </a>
            )}
            {candidate.telephone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {candidate.telephone}
              </span>
            )}
            {candidate.pays && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {candidate.pays}
              </span>
            )}
            {candidate.linkedinUrl && (
              <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                <Globe className="h-3.5 w-3.5" /> LinkedIn
              </a>
            )}
            {candidate.githubUrl && (
              <a href={candidate.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                <Globe className="h-3.5 w-3.5" /> GitHub
              </a>
            )}
            {candidate.hasCv && (
              <Badge variant="outline" className="text-xs">CV uploadé</Badge>
            )}
          </div>
        )}

        {/* Pipeline candidature(s) */}
        <CandidateStatusBar
          candidatures={candidatures}
          events={events}
          allowedTransitions={allowedTransitions}
          changingStatus={changingStatus}
          onOpenTransition={handleOpenTransition}
          candidatureDataMap={candidatureDataMap}
        />

        {/* Notes d'entretien (collapsible) */}
        {candidatures[0]?.id && (
          <details className="mt-4 rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes d&apos;entretien
            </summary>
            <div className="px-4 pb-4">
              <CandidateNotesSection
                candidateId={candidate.id}
                candidatureId={candidatures[0].id}
                notes={candidatures[0]?.notesDirecteur ?? notes}
                onNotesChange={setNotes}
              />
            </div>
          </details>
        )}

        {/* Prev/Next candidate navigation */}
        {siblings.length > 1 && (
          <div className="mt-4 flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={!prevCandidate}
              onClick={() => prevCandidate && navigate(`/recruit/${prevCandidate.id}`)}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-sm">{prevCandidate?.name ?? 'Précédent'}</span>
            </Button>
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              {currentIndex + 1} / {siblings.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!nextCandidate}
              onClick={() => nextCandidate && navigate(`/recruit/${nextCandidate.id}`)}
              className="gap-2"
            >
              <span className="text-sm">{nextCandidate?.name ?? 'Suivant'}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Transition confirmation dialog */}
        <AlertDialog open={!!transitionDialog} onOpenChange={(open) => { if (!open) closeTransitionDialog() }}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {transitionDialog?.targetStatut === 'refuse'
                  ? 'Refuser cette candidature ?'
                  : transitionDialog?.targetStatut === 'embauche'
                    ? 'Confirmer l\'embauche ?'
                    : `Passer à : ${STATUT_LABELS[transitionDialog?.targetStatut ?? ''] ?? transitionDialog?.targetStatut}`
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
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Cette action est définitive.</span>
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
                      Chargement du modèle d'email...
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
                            Rédiger avec l'IA
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
                <label className="flex items-center gap-2 cursor-pointer">
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
                    placeholder="Pourquoi sauter cette étape ?"
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
                    {transitionShowMarkdownPreview ? 'Éditer' : 'Aperçu'}
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

        {isPending ? (
          <Card className="mt-8">
            <CardContent className="p-12 text-center">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h2 className="mt-4 text-lg font-medium">En attente de l'évaluation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Le candidat n'a pas encore soumis son évaluation.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* Radar chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Radar — Candidat vs Équipe</CardTitle>
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

            {/* Gap analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Analyse des écarts</CardTitle>
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

            {/* Behavioral profile (Aboro) */}
            <AboroProfileSection
              candidateId={candidate.id}
              aboroProfile={aboroProfile}
              hasCandidatures={candidatures.length > 0}
              onProfileUpdated={setAboroProfile}
            />

            {/* Documents */}
            {candidatures.length > 0 && (
              <CandidateDocumentsPanel
                candidatureId={candidatures[0].id}
                documents={documents}
                setDocuments={setDocuments}
                setEvents={setEvents}
              />
            )}

            {/* Multi-poste compatibility */}
            {multiPosteCompatibility.length > 0 && (
              <div className="lg:col-span-2">
                <MultiPosteCard entries={multiPosteCompatibility} />
                {bonusSkills && bonusSkills.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Compétences bonus (hors poste)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {bonusSkills.map((s) => (
                        <Badge key={s.skillId} variant="outline" className="text-[10px]">
                          + {s.skillLabel} {s.score}/5
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bonus skills (standalone, when no multi-poste data) */}
            {multiPosteCompatibility.length === 0 && bonusSkills && bonusSkills.length > 0 && (
              <div className="lg:col-span-2">
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Compétences bonus (hors poste)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bonusSkills.map((s) => (
                      <Badge key={s.skillId} variant="outline" className="text-[10px]">
                        + {s.skillLabel} {s.score}/5
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* AI Report */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Analyse IA</CardTitle>
                {!candidate.aiReport && (
                  <Button onClick={generateAnalysis} disabled={analyzing} size="sm">
                    {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Générer l'analyse
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
                    Cliquez sur &laquo; Générer l'analyse &raquo; pour obtenir un rapport IA comparant ce candidat à l'équipe.
                  </p>
                )}
              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </div>
  )
}

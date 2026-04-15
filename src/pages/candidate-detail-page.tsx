import { useCallback, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
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
import { Input } from '@/components/ui/input'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Sparkles, Clock, AlertTriangle, Mail, Phone, Globe, MapPin, AlertCircle } from 'lucide-react'
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
  } = useCandidateData(id)

  const {
    changingStatus,
    transitionDialog,
    transitionNotes, setTransitionNotes,
    transitionSkipReason, setTransitionSkipReason,
    transitionFile, setTransitionFile,
    transitionSendEmail, setTransitionSendEmail,
    transitionIncludeReason, setTransitionIncludeReason,
    openTransitionDialog,
    closeTransitionDialog,
    confirmTransition,
  } = useTransitionState(allowedTransitions, setCandidatures, setEvents, setAllowedTransitions)

  const [analyzing, setAnalyzing] = useState(false)

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
          onOpenTransition={openTransitionDialog}
        />

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
          <AlertDialogContent>
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

            <div className="space-y-3 py-2">
              {/* Notes */}
              <div>
                <label className="text-sm font-medium">
                  Notes {transitionDialog?.notesRequired ? '(obligatoire)' : '(optionnel)'}
                </label>
                <Textarea
                  value={transitionNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionNotes(e.target.value)}
                  placeholder={
                    transitionDialog?.targetStatut === 'refuse' ? 'Raison du refus...' :
                    transitionDialog?.targetStatut === 'embauche' ? 'Notes sur l\'embauche...' :
                    'Notes sur cette étape...'
                  }
                  rows={3}
                />
              </div>

              {/* Skip reason */}
              {transitionDialog?.isSkip && (
                <div>
                  <label className="text-sm font-medium">Raison du saut (obligatoire)</label>
                  <Textarea
                    value={transitionSkipReason}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTransitionSkipReason(e.target.value)}
                    placeholder="Pourquoi sauter cette étape ?"
                    rows={2}
                  />
                </div>
              )}

              {/* Email checkbox for skill_radar_envoye */}
              {transitionDialog?.targetStatut === 'skill_radar_envoye' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transitionSendEmail}
                    onChange={(e) => setTransitionSendEmail(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">Envoyer le lien d'évaluation par email au candidat</span>
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

              {/* Aboro file upload */}
              {transitionDialog?.targetStatut === 'aboro' && (
                <div>
                  <label className="text-sm font-medium">Rapport Âboro (PDF)</label>
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setTransitionFile(e.target.files?.[0] ?? null)}
                    className="mt-1"
                  />
                  {!transitionFile && (
                    <p className="text-xs text-muted-foreground mt-1">Optionnel. Vous pourrez l'ajouter plus tard.</p>
                  )}
                </div>
              )}
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
                    Cliquez sur « Générer l'analyse » pour obtenir un rapport IA comparant ce candidat à l'équipe.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <CandidateNotesSection
              candidateId={candidate.id}
              notes={notes}
              onNotesChange={setNotes}
            />
          </div>
        )}
      </div>
    </div>
  )
}

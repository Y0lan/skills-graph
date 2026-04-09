import { useCallback, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import AppHeader from '@/components/app-header'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import FitReport from '@/components/recruit/fit-report'
import MultiPosteCard from '@/components/recruit/multi-poste-card'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Sparkles, Clock, AlertTriangle, GitBranch, Mail, Phone, Globe, MapPin, ChevronRight, Upload, AlertCircle, FileText, Download, FolderArchive, PenLine } from 'lucide-react'
import AboroManualForm from '@/components/recruit/aboro-manual-form'
import { STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, formatDateShort } from '@/lib/constants'
import { useCandidateData } from '@/hooks/use-candidate-data'

const DOC_TYPE_LABELS: Record<string, string> = {
  cv: 'CV',
  lettre: 'Lettre de motivation',
  aboro: 'Rapport Âboro',
  entretien: 'Compte-rendu entretien',
  proposition: 'Proposition',
  administratif: 'Administratif',
  other: 'Autre',
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
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

  const [analyzing, setAnalyzing] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [transitionDialog, setTransitionDialog] = useState<{
    candidatureId: string
    targetStatut: string
    isSkip: boolean
    skipped: string[]
    notesRequired: boolean
  } | null>(null)
  const [transitionNotes, setTransitionNotes] = useState('')
  const [transitionSkipReason, setTransitionSkipReason] = useState('')
  const [transitionFile, setTransitionFile] = useState<File | null>(null)
  const [transitionSendEmail, setTransitionSendEmail] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadType, setUploadType] = useState('other')
  const [showAboroForm, setShowAboroForm] = useState(false)

  const openTransitionDialog = useCallback((candidatureId: string, targetStatut: string, isSkip = false, skipped: string[] = []) => {
    const notesRequired = allowedTransitions?.notesRequired?.includes(targetStatut) ?? false
    setTransitionDialog({ candidatureId, targetStatut, isSkip, skipped, notesRequired })
    setTransitionNotes('')
    setTransitionSkipReason('')
    setTransitionFile(null)
    setTransitionSendEmail(true)
  }, [allowedTransitions])

  const confirmTransition = useCallback(async () => {
    if (!transitionDialog) return
    const { candidatureId, targetStatut, isSkip, notesRequired } = transitionDialog

    if (notesRequired && !transitionNotes.trim()) {
      toast.error('Les notes sont obligatoires pour cette transition')
      return
    }
    if (isSkip && !transitionSkipReason.trim()) {
      toast.error('Raison requise pour sauter une étape')
      return
    }

    setChangingStatus(true)
    try {
      // Upload Aboro document if transitioning to aboro with a file
      if (targetStatut === 'aboro' && transitionFile) {
        const formData = new FormData()
        formData.append('file', transitionFile)
        formData.append('type', 'aboro')
        await fetch(`/api/recruitment/candidatures/${candidatureId}/documents`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
      }

      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          statut: targetStatut,
          notes: transitionNotes.trim() || undefined,
          skipReason: isSkip ? transitionSkipReason.trim() : undefined,
          sendEmail: targetStatut === 'skill_radar_envoye' ? transitionSendEmail : undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur')
      }

      setCandidatures(prev => prev.map(c =>
        c.id === candidatureId ? { ...c, statut: targetStatut } : c
      ))

      // Refresh events + transitions
      const [detail, transitions] = await Promise.all([
        fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/recruitment/candidatures/${candidatureId}/transitions`, { credentials: 'include' }).then(r => r.json()),
      ])
      if (detail?.events) setEvents(detail.events)
      if (transitions) setAllowedTransitions(transitions)

      toast.success(`Statut changé : ${STATUT_LABELS[targetStatut] ?? targetStatut}`)
      setTransitionDialog(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du changement de statut')
    } finally {
      setChangingStatus(false)
    }
  }, [transitionDialog, transitionNotes, transitionSkipReason, transitionFile, setCandidatures, setEvents, setAllowedTransitions, transitionSendEmail])

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

  const saveNotes = useCallback(async () => {
    if (!id) return
    setSavingNotes(true)
    try {
      await fetch(`/api/candidates/${id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
    } catch { /* silent */ }
    finally { setSavingNotes(false) }
  }, [id, notes])

  const uploadDocument = useCallback(async (file: File) => {
    const cId = candidatures[0]?.id
    if (!cId) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', uploadType)
      const res = await fetch(`/api/recruitment/candidatures/${cId}/documents`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) throw new Error('Erreur upload')
      const doc = await res.json()
      setDocuments(prev => [{ id: doc.id, type: doc.type, filename: doc.filename, uploaded_by: 'moi', created_at: new Date().toISOString() }, ...prev])
      setUploadType('other')
      toast.success(`Document uploadé : ${doc.filename}`)
      // Refresh events (upload creates a timeline event)
      fetch(`/api/recruitment/candidatures/${cId}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(detail => { if (detail?.events) setEvents(detail.events) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur upload')
    } finally {
      setUploading(false)
    }
  }, [candidatures, uploadType, setDocuments, setEvents])

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
        // Find this skill's score in member's ratings
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
            <Badge variant="default" className="ml-auto bg-green-600">Analysé</Badge>
          ) : (
            <Badge variant="default" className="ml-auto bg-blue-600">Soumis</Badge>
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
        {candidatures.length > 0 && (
          <div className="mt-6 space-y-3">
            {candidatures.map(c => (
              <Card key={c.id}>
                <CardContent className="py-4 px-5">
                  {/* Header: poste + current status + scores */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{c.posteTitre}</p>
                        <p className="text-xs text-muted-foreground">
                          {CANAL_LABELS[c.canal] ?? c.canal}
                          {' · '}Candidature du {formatDateShort(c.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {c.tauxPoste != null && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Poste</p>
                          <p className="text-sm font-bold">{c.tauxPoste}%</p>
                        </div>
                      )}
                      {c.tauxEquipe != null && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Équipe</p>
                          <p className="text-sm font-bold">{c.tauxEquipe}%</p>
                        </div>
                      )}
                      {c.tauxSoft != null && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Soft</p>
                          <p className="text-sm font-bold">{c.tauxSoft}%</p>
                        </div>
                      )}
                      <Badge className={`text-sm px-3 py-1 ${STATUT_COLORS[c.statut] ?? ''}`}>
                        {STATUT_LABELS[c.statut] ?? c.statut}
                      </Badge>
                    </div>
                  </div>

                  {/* Soft skill alerts */}
                  {c.softSkillAlerts && c.softSkillAlerts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.softSkillAlerts.map((a, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                          {'\u26A0'} {a.message}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Transition actions */}
                  {allowedTransitions && (allowedTransitions.allowedTransitions.length > 0 || allowedTransitions.skipTransitions.length > 0) && (
                    <div className="mt-4 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Actions suivantes :</p>
                      <div className="flex flex-wrap gap-2">
                        {allowedTransitions.allowedTransitions.filter(s => s !== 'refuse').map(s => (
                          <Button
                            key={s}
                            size="sm"
                            variant="outline"
                            onClick={() => openTransitionDialog(c.id, s)}
                            disabled={changingStatus}
                          >
                            <ChevronRight className="h-3 w-3 mr-1" />
                            {STATUT_LABELS[s] ?? s}
                          </Button>
                        ))}
                        {allowedTransitions.skipTransitions.map(st => (
                          <Button
                            key={st.statut}
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => openTransitionDialog(c.id, st.statut, true, st.skipped)}
                            disabled={changingStatus}
                          >
                            {STATUT_LABELS[st.statut] ?? st.statut}
                            <span className="text-[10px] ml-1">(sauter {st.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')})</span>
                          </Button>
                        ))}
                        {allowedTransitions.allowedTransitions.includes('refuse') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="ml-auto"
                            onClick={() => openTransitionDialog(c.id, 'refuse')}
                            disabled={changingStatus}
                          >
                            Refuser
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Event timeline */}
                  {events.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Historique :</p>
                      <div className="space-y-1.5">
                        {events.map(e => (
                          <div key={e.id} className="flex items-start gap-2 text-xs">
                            <span className="text-muted-foreground shrink-0 w-12">{formatDateShort(e.createdAt)}</span>
                            {e.statutTo && (
                              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${STATUT_COLORS[e.statutTo] ?? ''}`}>
                                {STATUT_LABELS[e.statutTo] ?? e.statutTo}
                              </Badge>
                            )}
                            {e.type === 'document' && <Upload className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                            {e.notes && <span className="text-muted-foreground">{e.notes}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Transition confirmation dialog */}
        <AlertDialog open={!!transitionDialog} onOpenChange={(open) => { if (!open) setTransitionDialog(null) }}>
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
                        <th className="pb-2 font-medium">Compétence</th>
                        <th className="pb-2 font-medium text-center">Candidat</th>
                        <th className="pb-2 font-medium text-center">Équipe</th>
                        <th className="pb-2 font-medium text-center">Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gapAnalysis.slice(0, 20).map((g, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2">{g!.skill}</td>
                          <td className="py-2 text-center font-mono">{g!.candidateScore}</td>
                          <td className="py-2 text-center font-mono text-muted-foreground">{g!.teamAvg}</td>
                          <td className="py-2 text-center">
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
            {aboroProfile && (
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Profil comportemental (Âboro / SWIPE)</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setShowAboroForm(prev => !prev)}>
                    <PenLine className="h-3.5 w-3.5 mr-1" />
                    {showAboroForm ? 'Fermer' : 'Corriger'}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Traits by axis */}
                    <div className="space-y-4">
                      {[
                        { key: 'leadership', label: 'Leadership / Influence', color: 'bg-rose-500' },
                        { key: 'prise_en_compte', label: 'Prise en compte des autres', color: 'bg-sky-500' },
                        { key: 'creativite', label: 'Créativité / Adaptabilité', color: 'bg-amber-500' },
                        { key: 'rigueur', label: 'Rigueur dans le travail', color: 'bg-emerald-500' },
                        { key: 'equilibre', label: 'Équilibre personnel', color: 'bg-violet-500' },
                      ].map(axis => {
                        const traits = aboroProfile.traits[axis.key]
                        if (!traits) return null
                        return (
                          <div key={axis.key}>
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">{axis.label}</p>
                            <div className="space-y-1">
                              {Object.entries(traits).map(([traitKey, score]) => {
                                const traitLabels: Record<string, string> = {
                                  ascendant: 'Ascendant', conviction: 'Conviction', sociabilite: 'Sociabilité', diplomatie: 'Diplomatie',
                                  implication: 'Implication', ouverture: 'Ouverture', critique: 'Accepte les critiques', consultation: 'Consultation',
                                  taches_variees: 'Tâches variées', abstraction: 'Abstraction', inventivite: 'Inventivité', changement: 'Changement',
                                  methode: 'Méthode', details: 'Détails', perseverance: 'Persévérance', initiative: 'Initiative',
                                  detente: 'Détente', positivite: 'Positivité', controle: 'Contrôle émotionnel', stabilite: 'Stabilité',
                                }
                                return (
                                  <div key={traitKey} className="flex items-center gap-2">
                                    <span className="text-xs w-28 truncate">{traitLabels[traitKey] ?? traitKey}</span>
                                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${axis.color}`} style={{ width: `${(score as number / 10) * 100}%` }} />
                                    </div>
                                    <span className="text-xs font-mono w-5 text-right">{score as number}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Talent Cloud + Insights */}
                    <div className="space-y-4">
                      {/* Talent Cloud */}
                      {Object.keys(aboroProfile.talent_cloud).length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Talent Cloud</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(aboroProfile.talent_cloud).map(([name, level]) => {
                              const levelColors: Record<string, string> = {
                                distinctif: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
                                avere: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
                                mobilisable: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                                a_developper: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
                                non_developpe: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                              }
                              return (
                                <Badge key={name} variant="secondary" className={`text-[10px] ${levelColors[level] ?? ''}`}>
                                  {name}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Talents */}
                      {aboroProfile.talents.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Talents</p>
                          <ul className="text-xs space-y-0.5 text-foreground">
                            {aboroProfile.talents.slice(0, 6).map((t, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-green-500 mt-0.5">+</span> {t}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Axes de développement */}
                      {aboroProfile.axes_developpement.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Axes de développement</p>
                          <ul className="text-xs space-y-0.5 text-foreground">
                            {aboroProfile.axes_developpement.slice(0, 6).map((a, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-amber-500 mt-0.5">!</span> {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Matrices comportementales */}
                      {aboroProfile.matrices && aboroProfile.matrices.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Matrices comportementales</p>
                          <div className="grid gap-1.5">
                            {aboroProfile.matrices.map((m, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="w-32 text-muted-foreground truncate">{m.dimension}</span>
                                <Badge variant="secondary" className="text-[10px]">Naturel: {m.naturel}</Badge>
                                <Badge variant="outline" className="text-[10px]">Mobilisable: {m.mobilisable}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {showAboroForm && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-3">Correction manuelle des scores</p>
                      <AboroManualForm
                        candidateId={candidate.id}
                        initialProfile={aboroProfile}
                        onSaved={(profile) => {
                          setAboroProfile(profile)
                          setShowAboroForm(false)
                          toast.success('Profil Aboro mis a jour')
                        }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Manual Aboro entry when no profile exists */}
            {!aboroProfile && candidatures.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Profil comportemental (Aboro / SWIPE)</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setShowAboroForm(prev => !prev)}>
                    <PenLine className="h-3.5 w-3.5 mr-1" />
                    {showAboroForm ? 'Fermer' : 'Saisie manuelle Aboro'}
                  </Button>
                </CardHeader>
                <CardContent>
                  {showAboroForm ? (
                    <AboroManualForm
                      candidateId={candidate.id}
                      onSaved={(profile) => {
                        setAboroProfile(profile)
                        setShowAboroForm(false)
                        toast.success('Profil Aboro enregistre')
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Aucun profil Aboro disponible. Uploadez un PDF Aboro dans les documents ou utilisez la saisie manuelle.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Documents */}
            {candidatures.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Documents</CardTitle>
                  <div className="flex items-center gap-2">
                    {documents.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          window.open(`/api/recruitment/candidatures/${candidatures[0].id}/documents/zip`, '_blank')
                        }}
                      >
                        <FolderArchive className="mr-2 h-4 w-4" />
                        Télécharger tout (.zip)
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Upload form */}
                  <div className="flex items-center gap-2 mb-4">
                    <Select value={uploadType} onValueChange={(v) => { if (v) setUploadType(v) }}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = '.pdf,.docx,.doc'
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) uploadDocument(file)
                        }
                        input.click()
                      }}
                    >
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Uploader
                    </Button>
                  </div>

                  {/* Document list */}
                  {documents.length > 0 ? (
                    <div className="space-y-1.5">
                      {documents.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{doc.filename}</span>
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatDateShort(doc.created_at)}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0"
                            onClick={() => window.open(`/api/recruitment/documents/${doc.id}/download`, '_blank')}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Aucun document. Utilisez le bouton ci-dessus pour ajouter des pièces au dossier.
                    </p>
                  )}
                </CardContent>
              </Card>
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
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Notes privées</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="Vos notes sur ce candidat..."
                  rows={3}
                />
                {savingNotes && <p className="mt-1 text-xs text-muted-foreground">Sauvegarde...</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

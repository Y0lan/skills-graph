import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import AppHeader from '@/components/app-header'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import FitReport from '@/components/recruit/fit-report'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Loader2, Sparkles, Clock, AlertTriangle, GitBranch } from 'lucide-react'

interface CandidateDetail {
  id: string
  name: string
  role: string
  email: string | null
  createdAt: string
  expiresAt: string
  ratings: Record<string, number>
  experience: Record<string, number>
  skippedCategories: string[]
  submittedAt: string | null
  aiReport: string | null
  notes: string | null
}

interface TeamAggregate {
  members: { slug: string; categoryAverages: Record<string, number> }[]
}

interface CategoryInfo {
  id: string
  label: string
  skills: { id: string; label: string }[]
}

interface CandidatureInfo {
  id: string
  candidateId: string
  posteId: string
  posteTitre: string
  postePole: string
  statut: string
  canal: string
  tauxPoste: number | null
  tauxEquipe: number | null
  notesDirecteur: string | null
  createdAt: string
}

interface CandidatureEvent {
  id: number
  type: string
  statutFrom: string | null
  statutTo: string | null
  notes: string | null
  createdBy: string
  createdAt: string
}

const STATUT_LABELS: Record<string, string> = {
  postule: 'Postulé',
  preselectionne: 'Présélectionné',
  skill_radar_envoye: 'Skill Radar envoyé',
  skill_radar_complete: 'Skill Radar complété',
  entretien_1: 'Entretien 1',
  aboro: 'Test Âboro',
  entretien_2: 'Entretien 2',
  proposition: 'Proposition',
  embauche: 'Embauché',
  refuse: 'Refusé',
}

const STATUT_COLORS: Record<string, string> = {
  postule: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  preselectionne: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  skill_radar_envoye: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  skill_radar_complete: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  entretien_1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  aboro: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  entretien_2: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  proposition: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  embauche: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  refuse: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [teamData, setTeamData] = useState<TeamAggregate | null>(null)
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [candidatures, setCandidatures] = useState<CandidatureInfo[]>([])
  const [events, setEvents] = useState<CandidatureEvent[]>([])
  const [changingStatus, setChangingStatus] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetch(`/api/candidates/${id}`).then(r => r.ok ? r.json() : null),
      fetch('/api/aggregates').then(r => r.ok ? r.json() : null),
      fetch('/api/catalog').then(r => r.ok ? r.json() : null),
    ]).then(([cand, team, catalog]) => {
      setCandidate(cand)
      setTeamData(team)
      setCategories(catalog?.categories ?? [])
      setNotes(cand?.notes ?? '')
    }).finally(() => setLoading(false))

    // Fetch candidatures for this candidate
    fetch('/api/recruitment/candidatures', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((all: CandidatureInfo[]) => {
        const mine = all.filter((c: CandidatureInfo) => c.candidateId === id)
        setCandidatures(mine)
        // Fetch events for the first candidature
        if (mine.length > 0) {
          fetch(`/api/recruitment/candidatures/${mine[0].id}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(detail => {
              if (detail?.events) setEvents(detail.events)
            })
        }
      })
      .catch(() => {})
  }, [id])

  const changeStatus = useCallback(async (candidatureId: string, newStatut: string) => {
    setChangingStatus(true)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ statut: newStatut }),
      })
      if (!res.ok) throw new Error('Erreur')
      setCandidatures(prev => prev.map(c =>
        c.id === candidatureId ? { ...c, statut: newStatut } : c
      ))
      // Refresh events
      const detail = await fetch(`/api/recruitment/candidatures/${candidatureId}`, { credentials: 'include' }).then(r => r.json())
      if (detail?.events) setEvents(detail.events)
      toast.success(`Statut changé : ${STATUT_LABELS[newStatut] ?? newStatut}`)
    } catch {
      toast.error('Erreur lors du changement de statut')
    } finally {
      setChangingStatus(false)
    }
  }, [])

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
  }, [id])

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

        {/* Pipeline candidature(s) */}
        {candidatures.length > 0 && (
          <div className="mt-6 space-y-3">
            {candidatures.map(c => (
              <Card key={c.id}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{c.posteTitre}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.canal === 'cabinet_seyos' ? 'SEYOS' : c.canal === 'cabinet_altaide' ? 'Altaïde' : c.canal === 'site' ? 'sinapse.nc' : c.canal}
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

                      <Select
                        value={c.statut}
                        onValueChange={(val) => changeStatus(c.id, val)}
                        disabled={changingStatus}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUT_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Timeline */}
                  {events.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex flex-wrap gap-2">
                        {events.map(e => (
                          <div key={e.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span>{formatDateShort(e.createdAt)}</span>
                            {e.statutTo && (
                              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${STATUT_COLORS[e.statutTo] ?? ''}`}>
                                {STATUT_LABELS[e.statutTo] ?? e.statutTo}
                              </Badge>
                            )}
                            {e.notes && <span className="max-w-32 truncate">— {e.notes}</span>}
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

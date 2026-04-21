import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Loader2, Users, Building2, ChevronRight, AlertTriangle, FileText, Settings, BarChart3, Info, LayoutList, Kanban, Download, Pencil, Trophy } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { STATUT_LABELS, CANAL_LABELS, POLE_LABELS, POLE_COLORS, formatDate } from '@/lib/constants'
import KanbanBoard from '@/components/recruit/kanban-board'
import StatusChip from '@/components/recruit/status-chip'
import DocsChip from '@/components/recruit/docs-chip'
import PosteDescriptionDialog from '@/components/recruit/poste-description-dialog'

interface Poste {
  id: string
  roleId: string
  titre: string
  description: string | null
  pole: string
  headcount: number
  headcountFlexible: boolean
  experienceMin: number
  cigref: string
  contrat: string
  statut: string
  candidateCount: number
  activeCount: number
}

interface Candidature {
  id: string
  candidateId: string
  posteId: string
  posteTitre: string
  postePole: string
  statut: string
  canal: string
  candidateName: string
  candidateEmail: string | null
  hasCv: boolean
  hasLettre: boolean
  evaluationSubmitted: boolean
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
  softSkillAlerts: { trait: string; value: number; threshold: number; message: string }[] | null
  tauxGlobal: number | null
  notesDirecteur: string | null
  createdAt: string
  updatedAt: string
  lastEventAt: string | null
  enteredStatusAt: string | null
  docsSlotCount: number
}

interface DashboardStats {
  poles: { pole: string; poste_count: number; candidature_count: number; active_count: number }[]
  totalCandidatures: number
  totalActive: number
  statusBreakdown: Record<string, number>
}


const SCORE_TOOLTIPS: Record<string, string> = {
  Poste: 'Compatibilité technique entre les compétences du candidat et les exigences du poste visé',
  Équipe: 'Complémentarité avec l\'équipe existante — mesure les compétences manquantes que le candidat pourrait combler',
  Soft: 'Score comportemental issu de l\'évaluation Aboro (savoir-être, traits de personnalité)',
  Global: 'Score pondéré combinant Poste, Équipe et Soft skills (poids configurables)',
}

function CompatibilityBar({ value, label }: { value: number | null; label: string }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const tip = SCORE_TOOLTIPS[label]
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-14 flex items-center gap-1">
        {label}
        {tip && (
          <Tooltip>
            <TooltipTrigger className="cursor-help">
              <Info className="h-3 w-3 text-muted-foreground/50" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px] text-xs">
              {tip}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-20">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{value}%</span>
    </div>
  )
}

export default function RecruitPipelinePage() {
  const [postes, setPostes] = useState<Poste[]>([])
  const [candidatures, setCandidatures] = useState<Candidature[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterPole, setFilterPole] = useState<string>('all')
  const [filterPoste, setFilterPoste] = useState<string>('all')
  const [editingPoste, setEditingPoste] = useState<Poste | null>(null)
  const [filterStatut, setFilterStatut] = useState<string>('all')
  // Item 21 P2 smart filter chips — multi-select, AND-combined.
  const [chipStuck, setChipStuck] = useState(false)
  const [chipDocsMissing, setChipDocsMissing] = useState(false)
  const [chipNeedsAction, setChipNeedsAction] = useState(false)
  // Item 1 P2 density toggle — persisted per user.
  const [density, setDensity] = useState<'compact' | 'comfortable'>(() =>
    (localStorage.getItem('pipeline-density') as 'compact' | 'comfortable') ?? 'comfortable'
  )
  useEffect(() => { localStorage.setItem('pipeline-density', density) }, [density])
  const [weightsOpen, setWeightsOpen] = useState(false)
  const [weightPoste, setWeightPoste] = useState(50)
  const [weightEquipe, setWeightEquipe] = useState(20)
  const [weightSoft, setWeightSoft] = useState(30)
  const [savingWeights, setSavingWeights] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() =>
    (localStorage.getItem('pipeline-view') as 'list' | 'kanban') ?? 'list'
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [scrollTrigger, setScrollTrigger] = useState(0)
  const candidaturesRef = useRef<HTMLDivElement>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ candidatureId: string; name: string; posteTitre: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (scrollTrigger === 0) return
    // Only scroll if the candidatures section is not already visible.
    // Avoids the jarring jump when clicking a poste card that's already near the list.
    const el = candidaturesRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const isOffscreen = rect.top < 0 || rect.top > window.innerHeight - 80
    if (isOffscreen) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [scrollTrigger])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const downloadBatchZip = useCallback(async () => {
    if (selectedIds.size === 0) return
    setDownloadingZip(true)
    try {
      const res = await fetch('/api/recruitment/candidatures/batch-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ candidatureIds: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur serveur' }))
        throw new Error(err.error || 'Erreur lors du téléchargement')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Dossiers_candidats_${selectedIds.size}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`ZIP téléchargé (${selectedIds.size} dossier${selectedIds.size > 1 ? 's' : ''})`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du téléchargement')
    } finally {
      setDownloadingZip(false)
    }
  }, [selectedIds])

  const fetchData = useCallback(async () => {
    try {
      const [postesRes, candidaturesRes, dashRes] = await Promise.all([
        fetch('/api/recruitment/postes', { credentials: 'include' }),
        fetch('/api/recruitment/candidatures', { credentials: 'include' }),
        fetch('/api/recruitment/dashboard', { credentials: 'include' }),
      ])
      if (postesRes.ok) setPostes(await postesRes.json())
      if (candidaturesRes.ok) setCandidatures(await candidaturesRes.json())
      if (dashRes.ok) setStats(await dashRes.json())
    } catch (err) {
      console.error('Failed to fetch recruitment data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDeleteCandidate = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${deleteTarget.candidatureId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Erreur lors de la suppression')
      toast.success('Candidature supprim\u00e9e')
      setDeleteTarget(null)
      fetchData()
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, fetchData])

  const openWeightsDialog = useCallback(async () => {
    try {
      const res = await fetch('/api/recruitment/scoring-weights', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setWeightPoste(Math.round(data.weight_poste * 100))
        setWeightEquipe(Math.round(data.weight_equipe * 100))
        setWeightSoft(Math.round(data.weight_soft * 100))
      }
    } catch { /* use defaults */ }
    setWeightsOpen(true)
  }, [])

  const saveWeights = useCallback(async () => {
    const total = weightPoste + weightEquipe + weightSoft
    if (Math.abs(total - 100) > 1) return
    setSavingWeights(true)
    try {
      const res = await fetch('/api/recruitment/scoring-weights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          weightPoste: weightPoste / 100,
          weightEquipe: weightEquipe / 100,
          weightSoft: weightSoft / 100,
        }),
      })
      if (res.ok) {
        setWeightsOpen(false)
        fetchData() // refresh candidatures with new scores
      }
    } catch { /* silent */ }
    finally { setSavingWeights(false) }
  }, [weightPoste, weightEquipe, weightSoft, fetchData])

  const changeView = useCallback((mode: 'list' | 'kanban') => {
    setViewMode(mode)
    localStorage.setItem('pipeline-view', mode)
  }, [])

  // Kanban is read-only — transitions happen on the candidate detail page

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Group postes by pole
  const postesByPole = new Map<string, Poste[]>()
  for (const p of postes) {
    const list = postesByPole.get(p.pole) ?? []
    list.push(p)
    postesByPole.set(p.pole, list)
  }

  // Filter candidatures
  const filtered = candidatures.filter(c => {
    if (filterPole !== 'all' && c.postePole !== filterPole) return false
    if (filterPoste !== 'all' && c.posteId !== filterPoste) return false
    if (filterStatut !== 'all' && c.statut !== filterStatut) return false
    // Smart chip filters
    if (chipStuck) {
      // Reuse the SLA helper — same source of truth as StatusChip's red ring.
      const enteredAt = c.enteredStatusAt ?? c.createdAt
      const days = (Date.now() - new Date(enteredAt + (enteredAt.endsWith('Z') ? '' : 'Z')).getTime()) / 86_400_000
      if (days < 7) return false
      if (c.statut === 'embauche' || c.statut === 'refuse') return false
    }
    if (chipDocsMissing && c.docsSlotCount >= 2) return false
    if (chipNeedsAction) {
      // "Needs action" = stuck + docs missing + has soft skill alerts (any)
      const enteredAt = c.enteredStatusAt ?? c.createdAt
      const days = (Date.now() - new Date(enteredAt + (enteredAt.endsWith('Z') ? '' : 'Z')).getTime()) / 86_400_000
      const isStuck = days >= 7 && c.statut !== 'embauche' && c.statut !== 'refuse'
      const docsIncomplete = c.docsSlotCount < 2
      const hasAlerts = (c.softSkillAlerts?.length ?? 0) > 0
      if (!isStuck && !docsIncomplete && !hasAlerts) return false
    }
    return true
  })

  const activeChipCount = (chipStuck ? 1 : 0) + (chipDocsMissing ? 1 : 0) + (chipNeedsAction ? 1 : 0)

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container mx-auto max-w-6xl px-4 pt-16 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Recrutement SINAPSE</h1>
            <p className="text-sm text-muted-foreground">Campagne Avril 2026 — 7 postes</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openWeightsDialog}>
              <Settings className="h-4 w-4 mr-1" />
              Ponderation
            </Button>
            <a href="/recruit/reports/campaign" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-1" />
                Exporter PDF
              </Button>
            </a>
            <Link to="/recruit">
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4 mr-1" />
                Candidats
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats overview */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-2xl font-bold">{stats.totalCandidatures}</p>
                <p className="text-xs text-muted-foreground">Candidatures totales</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-2xl font-bold">{stats.totalActive}</p>
                <p className="text-xs text-muted-foreground">En cours</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-2xl font-bold">{stats.statusBreakdown?.entretien_1 ?? 0}</p>
                <p className="text-xs text-muted-foreground">En entretien</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-2xl font-bold">{stats.statusBreakdown?.embauche ?? 0}</p>
                <p className="text-xs text-muted-foreground">Embauchés</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Postes by pole */}
        <div className="space-y-4 mb-8">
          {['legacy', 'java_modernisation', 'fonctionnel'].map(pole => {
            const polePostes = postesByPole.get(pole) ?? []
            if (polePostes.length === 0) return null
            return (
              <Card key={pole}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4" />
                    <Badge variant="secondary" className={POLE_COLORS[pole]}>
                      {POLE_LABELS[pole]}
                    </Badge>
                    <Link
                      to="/recruit"
                      className="text-muted-foreground text-sm font-normal hover:text-foreground hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {polePostes.reduce((s, p) => s + p.candidateCount, 0)} candidat(s)
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {polePostes.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setFilterPole(pole)
                          setFilterPoste(p.id)
                          setFilterStatut('all')
                          setScrollTrigger(n => n + 1)
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                      >
                        <div>
                          <span className="font-medium text-sm">{p.titre}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {p.headcount} poste{p.headcountFlexible ? ' (flex.)' : ''} · {p.experienceMin} ans d'exp. req.
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Tooltip>
                            <TooltipTrigger className="cursor-help">
                              <Badge variant="outline" className="text-xs">
                                {p.candidateCount} candidat{p.candidateCount !== 1 ? 's' : ''}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[260px] text-xs">
                              Nombre total de candidatures pour ce poste
                            </TooltipContent>
                          </Tooltip>
                          {p.activeCount > 0 && (
                            <Tooltip>
                              <TooltipTrigger className="cursor-help">
                                <Badge className="text-xs bg-primary">
                                  {p.activeCount} actif{p.activeCount !== 1 ? 's' : ''}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[260px] text-xs">
                                Candidatures en cours de traitement (hors refusés et embauchés)
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <a
                            href={`/recruit/reports/comparison/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                            title="Comparer les candidats"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </a>
                          <Link
                            to={`/recruit/postes/${p.id}/shortlist`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                            title="Shortlist + contact"
                          >
                            <Trophy className="h-4 w-4" />
                          </Link>
                          {p.id !== 'candidature-libre' ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingPoste(p) }}
                              className={`text-muted-foreground hover:text-foreground ${p.description ? 'text-primary' : ''}`}
                              title={p.description ? 'Modifier la fiche de poste' : 'Ajouter une fiche de poste'}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          ) : null}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Select value={filterPole} onValueChange={(v) => { setFilterPole(v ?? 'all'); setFilterPoste('all') }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Tous les pôles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les pôles</SelectItem>
              {Object.entries(POLE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPoste} onValueChange={(v) => setFilterPoste(v ?? 'all')}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Tous les postes">
                {filterPoste === 'all' ? 'Tous les postes' : postes.find(p => p.id === filterPoste)?.titre ?? filterPoste}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les postes</SelectItem>
              {postes
                .filter(p => filterPole === 'all' || p.pole === filterPole)
                .map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.titre}</SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Select value={filterStatut} onValueChange={(v) => setFilterStatut(v ?? 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {Object.entries(STATUT_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(filterPole !== 'all' || filterPoste !== 'all' || filterStatut !== 'all' || activeChipCount > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterPole('all'); setFilterPoste('all'); setFilterStatut('all')
                setChipStuck(false); setChipDocsMissing(false); setChipNeedsAction(false)
              }}
            >
              Réinitialiser
            </Button>
          )}

          {/* Density toggle (Item 1 P2) — applies to list mode rows */}
          <div className="inline-flex rounded-md border border-border ml-auto">
            <Button
              variant={density === 'comfortable' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-r-none text-xs"
              onClick={() => setDensity('comfortable')}
              title="Densité confortable"
            >
              ☷
            </Button>
            <Button
              variant={density === 'compact' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-l-none text-xs"
              onClick={() => setDensity('compact')}
              title="Densité compacte"
            >
              ≡
            </Button>
          </div>

          <div className="inline-flex rounded-md border border-border">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-r-none text-xs"
              onClick={() => changeView('list')}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Liste
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-l-none text-xs"
              onClick={() => changeView('kanban')}
            >
              <Kanban className="h-3.5 w-3.5" />
              Kanban
            </Button>
          </div>

          <Link to="/recruit" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            {filtered.length} candidature{filtered.length !== 1 ? 's' : ''}
          </Link>
        </div>

        {/* Smart filter chips (Item 21 P2) — multi-select, AND-combined. */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Filtres rapides</span>
          <Button
            variant={chipStuck ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => setChipStuck(!chipStuck)}
            title="Candidatures en attente depuis plus de 7 jours"
          >
            ⏱ Bloquées &gt; 7j
          </Button>
          <Button
            variant={chipDocsMissing ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => setChipDocsMissing(!chipDocsMissing)}
            title="Dossier incomplet (CV/Lettre/ABORO)"
          >
            📂 Dossier incomplet
          </Button>
          <Button
            variant={chipNeedsAction ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => setChipNeedsAction(!chipNeedsAction)}
            title="Bloqué OU dossier incomplet OU alerte soft skill"
          >
            🚨 Action requise
          </Button>
        </div>

        {/* Candidatures — list or kanban */}
        <div ref={candidaturesRef} className="scroll-mt-16" />
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>Aucune candidature pour ces filtres.</p>
              <p className="text-xs mt-1">Les candidatures arrivent via sinapse.nc ou peuvent être créées manuellement.</p>
            </CardContent>
          </Card>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard
            candidatures={filtered.map(c => ({
              id: c.id,
              candidateId: c.candidateId,
              candidateName: c.candidateName,
              posteTitre: c.posteTitre,
              statut: c.statut,
              tauxPoste: c.tauxPoste,
              tauxGlobal: c.tauxGlobal,
            }))}
            onDelete={(candidatureId, candidateName, posteTitre) => setDeleteTarget({ candidatureId, name: candidateName, posteTitre })}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center gap-2">
                <div
                  className="shrink-0"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                >
                  <Checkbox
                    checked={selectedIds.has(c.id)}
                    onCheckedChange={() => toggleSelection(c.id)}
                  />
                </div>
                <Link
                  to={`/recruit/${c.candidateId}`}
                  className="block flex-1 min-w-0"
                >
                <Card className={`hover:bg-muted/30 transition-colors ${selectedIds.has(c.id) ? 'ring-1 ring-primary/50' : ''}`}>
                  <CardContent className={density === 'compact' ? 'py-1.5 px-3' : 'py-3 px-4'}>
                    <div className="flex items-center gap-4">
                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="hover:underline font-medium text-sm truncate">{c.candidateName}</span>
                          <StatusChip statut={c.statut} enteredStatusAt={c.enteredStatusAt} />
                          <DocsChip docsSlotCount={c.docsSlotCount} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>{c.posteTitre}</span>
                          <span>·</span>
                          <span>{CANAL_LABELS[c.canal] ?? c.canal}</span>
                          <span>·</span>
                          <span>{formatDate(c.createdAt)}</span>
                          {c.hasCv && <Badge variant="outline" className="text-[10px] px-1 py-0">CV</Badge>}
                          {c.hasLettre && <Badge variant="outline" className="text-[10px] px-1 py-0">LM</Badge>}
                          {c.evaluationSubmitted && <Badge variant="outline" className="text-[10px] px-1 py-0">Évalué</Badge>}
                          {c.softSkillAlerts && c.softSkillAlerts.length > 0 && (
                            <Badge variant="outline" className="text-[10px] border-red-500 text-red-600 dark:border-red-400 dark:text-red-400">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                              Soft skills
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Compatibility scores */}
                      <div className="hidden sm:flex flex-col gap-1 w-44">
                        <CompatibilityBar value={c.tauxPoste} label="Poste" />
                        <CompatibilityBar value={c.tauxEquipe} label="Équipe" />
                        <CompatibilityBar value={c.tauxGlobal} label="Global" />
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Floating action bar for batch selection */}
        {selectedIds.size > 0 && viewMode === 'list' && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-primary px-6 py-3 text-primary-foreground shadow-lg">
            <span className="text-sm font-medium">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={downloadBatchZip}
              disabled={downloadingZip}
            >
              {downloadingZip ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Télécharger ZIP
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => setSelectedIds(new Set())}
            >
              Annuler
            </Button>
          </div>
        )}
      </main>

      {/* Delete candidature confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette candidature ?</AlertDialogTitle>
            <AlertDialogDescription>
              La candidature de <strong>{deleteTarget?.name}</strong> pour <strong>{deleteTarget?.posteTitre}</strong> sera supprim{'\u00e9'}e d{'\u00e9'}finitivement (documents inclus). Les autres candidatures du même candidat ne sont pas affect{'\u00e9'}es.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCandidate}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scoring weights settings dialog */}
      <AlertDialog open={weightsOpen} onOpenChange={setWeightsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ponderation du score global</AlertDialogTitle>
            <AlertDialogDescription>
              Ajustez les poids utilises pour calculer le score global de compatibilite. Les trois valeurs doivent totaliser 100%.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <label className="text-sm w-28">Poste (%)</label>
              <Input
                type="number" min={0} max={100}
                value={weightPoste}
                onChange={e => setWeightPoste(parseInt(e.target.value) || 0)}
                className="w-20"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm w-28">Equipe (%)</label>
              <Input
                type="number" min={0} max={100}
                value={weightEquipe}
                onChange={e => setWeightEquipe(parseInt(e.target.value) || 0)}
                className="w-20"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm w-28">Soft skills (%)</label>
              <Input
                type="number" min={0} max={100}
                value={weightSoft}
                onChange={e => setWeightSoft(parseInt(e.target.value) || 0)}
                className="w-20"
              />
            </div>
            {Math.abs(weightPoste + weightEquipe + weightSoft - 100) > 1 && (
              <p className="text-xs text-red-500">
                Total : {weightPoste + weightEquipe + weightSoft}% (doit etre 100%)
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingWeights}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={saveWeights}
              disabled={savingWeights || Math.abs(weightPoste + weightEquipe + weightSoft - 100) > 1}
            >
              {savingWeights ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingPoste ? (
        <PosteDescriptionDialog
          open={true}
          onClose={() => setEditingPoste(null)}
          posteId={editingPoste.id}
          posteTitre={editingPoste.titre}
          currentDescription={editingPoste.description}
          onSaved={(desc) => {
            setPostes(prev => prev.map(p => p.id === editingPoste.id ? { ...p, description: desc } : p))
          }}
        />
      ) : null}
    </div>
  )
}

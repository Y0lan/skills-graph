import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Loader2, Users, ChevronRight, FileText, Settings, BarChart3, Info, LayoutList, Kanban, Download, Pencil, Trophy, Search, SlidersHorizontal, ArrowUpDown, X, Plus, Copy, Trash2, Eye, GitBranch, UserCog, ArrowUp, ArrowDown } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import NewCandidateDialog from '@/components/recruit/new-candidate-dialog'
import RoleManagerPanel from '@/components/recruit/role-manager-panel'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, POLE_LABELS, POLE_COLORS, formatDate } from '@/lib/constants'
import KanbanBoard from '@/components/recruit/kanban-board'
import StatusChip from '@/components/recruit/status-chip'
import DocsChip from '@/components/recruit/docs-chip'
import PosteDescriptionDialog from '@/components/recruit/poste-description-dialog'
import PipelineCandidatureRow from '@/components/recruit/pipeline-candidature-row'

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

interface PreviewProfile {
  city: string | null
  country: string | null
  currentRole: string | null
  currentCompany: string | null
  totalExperienceYears: number | null
  noticePeriodDays: number | null
  topSkills: Array<{ skillId: string; skillLabel: string; rating: number }>
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
  previewProfile: PreviewProfile | null
}

interface DashboardStats {
  poles: { pole: string; poste_count: number; candidature_count: number; active_count: number }[]
  totalCandidatures: number
  totalActive: number
  statusBreakdown: Record<string, number>
}

/** Candidate-level record from /api/candidates — one row per person
 *  (as opposed to Candidature which is one row per application). Used
 *  by the "Candidats" view mode which merged the old /recruit page. */
interface Candidate {
  id: string
  name: string
  role: string
  email: string | null
  createdBy: string
  createdAt: string
  expiresAt: string
  submittedAt: string | null
  hasReport: boolean
  pipelineStatus: string | null
  candidatureCount: number
}

const PIPELINE_ORDER: Record<string, number> = {
  embauche: 9, proposition: 8, entretien_2: 7, aboro: 6,
  entretien_1: 5, skill_radar_complete: 4, skill_radar_envoye: 3,
  preselectionne: 2, postule: 1, refuse: 0,
}

const SORT_KEYS = ['fit_desc', 'fit_asc', 'date_desc', 'date_asc'] as const
type SortKey = (typeof SORT_KEYS)[number]
const SORT_LABELS: Record<SortKey, string> = {
  fit_desc: 'Score poste (élevé → faible)',
  fit_asc: 'Score poste (faible → élevé)',
  date_desc: 'Plus récent',
  date_asc: 'Plus ancien',
}


const EXPERIENCE_LABELS: Record<string, string> = {
  all: 'Toute expérience',
  junior: 'Junior (0-3 ans)',
  intermediate: 'Confirmé (3-7 ans)',
  senior: 'Senior (7-15 ans)',
  expert: 'Expert (15+ ans)',
}

const NOTICE_LABELS: Record<string, string> = {
  all: 'Tout préavis',
  immediate: 'Disponible',
  short: '≤ 30 jours',
  medium: '30-60 jours',
  long: '> 60 jours',
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

/** À traiter row — large click target that shows the count, pulses when
 *  non-zero (subtle), and toggles the matching quick-chip filter. Tone
 *  drives the number color so recruiters pick up priority peripherally. */
function TriageRow({
  icon, label, count, tone, active, onClick,
}: {
  icon: string; label: string; count: number
  tone: 'urgent' | 'warn' | 'accent' | 'muted'
  active: boolean
  onClick: () => void
}) {
  const numColor =
    count === 0 ? 'text-muted-foreground/50'
    : tone === 'urgent' ? 'text-rose-500'
    : tone === 'warn' ? 'text-amber-500'
    : tone === 'accent' ? 'text-chart-2'
    : 'text-foreground'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full flex items-center gap-3 py-2.5 px-1 text-left transition-colors hover:bg-muted/40 ${active ? 'bg-muted/60' : ''}`}
      aria-pressed={active}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1 text-sm text-foreground/90 group-hover:text-foreground">
        {label}
        {active && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-primary font-semibold">· filtre actif</span>}
      </span>
      <span className={`text-2xl font-bold tabular-nums leading-none ${numColor}`} style={{ fontFamily: "'Raleway Variable', sans-serif" }}>
        {count}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
    </button>
  )
}

/** Small removable pill used in the active-filter summary. Shows the
 *  "Field : value" label with an × button that clears that filter alone. */
function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-border bg-muted/40 text-[11px] text-foreground">
      <span className="max-w-[160px] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${label}`}
        className="inline-flex items-center justify-center h-5 w-5 rounded-full hover:bg-muted transition-colors"
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
    </span>
  )
}

export default function RecruitPipelinePage() {
  const [postes, setPostes] = useState<Poste[]>([])
  const [candidatures, setCandidatures] = useState<Candidature[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterPole, setFilterPole] = useState<string>('all')
  const [filterPoste, setFilterPoste] = useState<string>('all')
  const [filterExperience, setFilterExperience] = useState<string>('all')
  const [filterNotice, setFilterNotice] = useState<string>('all')
  const [filterSearch, setFilterSearch] = useState<string>('')
  const [editingPoste, setEditingPoste] = useState<Poste | null>(null)
  const [filterStatut, setFilterStatut] = useState<string>('all')
  // Item 21 P2 smart filter chips — multi-select, AND-combined.
  const [chipStuck, setChipStuck] = useState(false)
  const [chipDocsMissing, setChipDocsMissing] = useState(false)
  const [chipNeedsAction, setChipNeedsAction] = useState(false)
  const [weightsOpen, setWeightsOpen] = useState(false)
  const [weightPoste, setWeightPoste] = useState(50)
  const [weightEquipe, setWeightEquipe] = useState(20)
  const [weightSoft, setWeightSoft] = useState(30)
  const [savingWeights, setSavingWeights] = useState(false)
  type ViewMode = 'list' | 'candidates' | 'kanban'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = localStorage.getItem('pipeline-view')
    return (v === 'list' || v === 'candidates' || v === 'kanban') ? v : 'list'
  })
  // Candidate-level state (merged from old /recruit page).
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candSortKey, setCandSortKey] = useState<'name' | 'role' | 'status' | 'createdAt'>('createdAt')
  const [candSortDir, setCandSortDir] = useState<'asc' | 'desc'>('desc')
  const [newCandidateOpen, setNewCandidateOpen] = useState(false)
  const [showRoleManager, setShowRoleManager] = useState(false)
  const [customRoleCount, setCustomRoleCount] = useState(0)
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    const v = localStorage.getItem('pipeline-sort') as SortKey | null
    return v && SORT_KEYS.includes(v) ? v : 'fit_desc'
  })
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
      const [postesRes, candidaturesRes, dashRes, candRes] = await Promise.all([
        fetch('/api/recruitment/postes', { credentials: 'include' }),
        fetch('/api/recruitment/candidatures', { credentials: 'include' }),
        fetch('/api/recruitment/dashboard', { credentials: 'include' }),
        fetch('/api/candidates', { credentials: 'include' }),
      ])
      if (postesRes.ok) setPostes(await postesRes.json())
      if (candidaturesRes.ok) setCandidatures(await candidaturesRes.json())
      if (dashRes.ok) setStats(await dashRes.json())
      if (candRes.ok) setCandidates(await candRes.json())
    } catch (err) {
      console.error('Failed to fetch recruitment data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Candidate-level actions (merged from old /recruit page).
  const copyCandidateLink = useCallback((id: string) => {
    const link = `${window.location.origin}/evaluate/${id}`
    navigator.clipboard.writeText(link).catch(() => {})
    toast.success('Lien copié !')
  }, [])

  const handleDeleteCandidateById = useCallback(async (id: string, name: string) => {
    if (!confirm(`Supprimer le candidat ${name} ?\n\nToutes ses candidatures et documents seront supprimés définitivement.`)) return
    try {
      const res = await fetch(`/api/candidates/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Candidat supprimé (toutes candidatures incluses)')
      fetchData()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }, [fetchData])

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

  const changeView = useCallback((mode: ViewMode) => {
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
  const searchNeedle = filterSearch.trim().toLowerCase()
  const filtered = candidatures.filter(c => {
    if (filterPole !== 'all' && c.postePole !== filterPole) return false
    if (filterPoste !== 'all' && c.posteId !== filterPoste) return false
    if (filterStatut !== 'all' && c.statut !== filterStatut) return false
    // Free-form search: match any of name / poste / city / current role / current company
    if (searchNeedle) {
      const hay = [
        c.candidateName,
        c.posteTitre,
        c.previewProfile?.city,
        c.previewProfile?.currentRole,
        c.previewProfile?.currentCompany,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(searchNeedle)) return false
    }
    // Experience range (only applies when profile has been extracted)
    if (filterExperience !== 'all') {
      const y = c.previewProfile?.totalExperienceYears
      if (y == null) return false
      if (filterExperience === 'junior' && y > 3) return false
      if (filterExperience === 'intermediate' && (y < 3 || y > 7)) return false
      if (filterExperience === 'senior' && (y < 7 || y > 15)) return false
      if (filterExperience === 'expert' && y < 15) return false
    }
    // Notice period bucket
    if (filterNotice !== 'all') {
      const d = c.previewProfile?.noticePeriodDays
      if (d == null) return false
      if (filterNotice === 'immediate' && d > 0) return false
      if (filterNotice === 'short' && (d < 1 || d > 30)) return false
      if (filterNotice === 'medium' && (d < 31 || d > 60)) return false
      if (filterNotice === 'long' && d < 61) return false
    }
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

  // Sort after filtering. Ties break on created_at DESC so the chosen sort
  // still places newer applications above older ones inside equal-score
  // groups — matches the server's default tiebreak.
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'fit_desc' || sortBy === 'fit_asc') {
      const aFit = a.tauxPoste ?? -Infinity
      const bFit = b.tauxPoste ?? -Infinity
      const delta = sortBy === 'fit_desc' ? bFit - aFit : aFit - bFit
      if (delta !== 0) return delta
    }
    const aTs = new Date(a.createdAt + (a.createdAt.endsWith('Z') ? '' : 'Z')).getTime()
    const bTs = new Date(b.createdAt + (b.createdAt.endsWith('Z') ? '' : 'Z')).getTime()
    return sortBy === 'date_asc' ? aTs - bTs : bTs - aTs
  })

  const activeChipCount = (chipStuck ? 1 : 0) + (chipDocsMissing ? 1 : 0) + (chipNeedsAction ? 1 : 0)

  // Triage counts — computed across ALL candidatures (not just filtered) so
  // the "À traiter" panel still tells the truth when the user narrows the
  // view. This answers the recruiter's first morning question in one glance.
  const triageCounts = (() => {
    let stuck = 0, docsMissing = 0, needsAction = 0
    const now = Date.now()
    for (const c of candidatures) {
      const enteredAt = c.enteredStatusAt ?? c.createdAt
      const days = (now - new Date(enteredAt + (enteredAt.endsWith('Z') ? '' : 'Z')).getTime()) / 86_400_000
      const isStuck = days >= 7 && c.statut !== 'embauche' && c.statut !== 'refuse'
      const docsIncomplete = c.docsSlotCount < 2
      const hasAlerts = (c.softSkillAlerts?.length ?? 0) > 0
      if (isStuck) stuck++
      if (docsIncomplete && c.statut !== 'embauche' && c.statut !== 'refuse') docsMissing++
      if ((isStuck || docsIncomplete || hasAlerts) && c.statut !== 'embauche' && c.statut !== 'refuse') needsAction++
    }
    return { stuck, docsMissing, needsAction }
  })()

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container mx-auto max-w-6xl px-4 pt-16 pb-8">
        {/* ── Masthead ─────────────────────────────────────────────
            Editorial header: eyebrow label, compact H1, actions right.
            Actions collapse to icon-only to free up horizontal weight
            for the title block. */}
        <div className="flex items-end justify-between mb-8 pb-4 border-b">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-1">
              Campagne · Avril 2026 · {postes.length} postes
            </p>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Raleway Variable', sans-serif" }}>
              Recrutement
            </h1>
            {stats && (
              <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                <span className="text-foreground font-medium">{stats.totalCandidatures}</span> candidatures ·{' '}
                <span className="text-foreground font-medium">{stats.totalActive}</span> en cours ·{' '}
                <span className="text-foreground font-medium">{stats.statusBreakdown?.embauche ?? 0}</span> embauché(s)
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Primary action: new candidate. Promoted to the masthead
                after merging /recruit — this is the high-intent button. */}
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setNewCandidateOpen(true)}>
              <Plus className="h-4 w-4" />
              Nouveau candidat
            </Button>

            {/* Secondary utilities grouped as icon-only. */}
            <div className="flex items-center gap-1 pl-1 border-l">
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant={showRoleManager ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setShowRoleManager(v => !v)}
                      className="h-9 gap-1 px-2"
                    >
                      <UserCog className="h-4 w-4" />
                      <span className="text-xs">Rôles</span>
                      {customRoleCount > 0 && (
                        <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums ml-0.5">
                          {customRoleCount}
                        </Badge>
                      )}
                    </Button>
                  )}
                />
                <TooltipContent>Gérer les rôles personnalisés</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button variant="ghost" size="sm" onClick={openWeightsDialog} className="h-9 w-9 p-0">
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
                />
                <TooltipContent>Pondération du score</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <a href="/recruit/reports/campaign" target="_blank" rel="noopener noreferrer" className="inline-flex">
                      <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                />
                <TooltipContent>Exporter PDF</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Link to="/recruit/funnel" className="inline-flex">
                      <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                        <GitBranch className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                />
                <TooltipContent>Funnel</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Role manager panel — slides in under the masthead when open. */}
        {showRoleManager && (
          <div className="mb-8 pb-6 border-b">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3">Rôles</p>
            <RoleManagerPanel onCountChange={setCustomRoleCount} />
          </div>
        )}

        {/* ── Dashboard band: Pipeline health + À traiter ─────────
            Asymmetric 5:3 grid. Left = pipeline flow at a glance via
            per-stage mini-bars. Right = actionable triage buttons that
            pre-apply the right filters so recruiters go from "what
            matters today" to the candidate list in one click. */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-[5fr_3fr] gap-0 md:gap-6 mb-10">
            {/* Pipeline overview */}
            <div className="pb-6 md:pb-0 md:border-r md:pr-6 border-b md:border-b-0 mb-6 md:mb-0">
              <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3">Pipeline</p>
              <div className="flex items-baseline gap-6 mb-5">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold tabular-nums leading-none" style={{ fontFamily: "'Raleway Variable', sans-serif" }}>
                      {stats.totalActive}
                    </span>
                    <span className="text-sm text-muted-foreground">actives</span>
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular-nums leading-none text-foreground/80">
                      {(stats.statusBreakdown?.entretien_1 ?? 0) + (stats.statusBreakdown?.entretien_2 ?? 0)}
                    </span>
                    <span className="text-xs text-muted-foreground">entretiens</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular-nums leading-none text-emerald-500">
                      {stats.statusBreakdown?.embauche ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground">embauches</span>
                  </div>
                </div>
              </div>
              {/* Per-stage mini-bar — shows flow distribution across the
                  9 pipeline statuts. Click a segment to filter. */}
              <div className="space-y-1.5">
                <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                  {(() => {
                    const stages = [
                      { k: 'postule', color: 'bg-muted-foreground/40' },
                      { k: 'preselectionne', color: 'bg-primary/60' },
                      { k: 'skill_radar_envoye', color: 'bg-primary/70' },
                      { k: 'skill_radar_complete', color: 'bg-primary/80' },
                      { k: 'entretien_1', color: 'bg-primary' },
                      { k: 'aboro', color: 'bg-chart-2' },
                      { k: 'entretien_2', color: 'bg-chart-2' },
                      { k: 'proposition', color: 'bg-chart-3' },
                      { k: 'embauche', color: 'bg-emerald-500' },
                    ]
                    const total = stats.totalActive + (stats.statusBreakdown?.embauche ?? 0) || 1
                    return stages.map(s => {
                      const n = stats.statusBreakdown?.[s.k] ?? 0
                      if (n === 0) return null
                      const pct = (n / total) * 100
                      return (
                        <Tooltip key={s.k}>
                          <TooltipTrigger
                            render={(
                              <button
                                type="button"
                                onClick={() => { setFilterStatut(s.k); setScrollTrigger(n => n + 1) }}
                                className={`${s.color} hover:brightness-110 transition-[filter]`}
                                style={{ width: `${pct}%` }}
                                aria-label={`${STATUT_LABELS[s.k] ?? s.k}: ${n}`}
                              />
                            )}
                          />
                          <TooltipContent className="text-xs">{STATUT_LABELS[s.k] ?? s.k} : {n}</TooltipContent>
                        </Tooltip>
                      )
                    })
                  })()}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {['postule', 'preselectionne', 'skill_radar_envoye', 'skill_radar_complete', 'entretien_1', 'aboro', 'entretien_2', 'proposition'].map(k => {
                    const n = stats.statusBreakdown?.[k] ?? 0
                    if (n === 0) return null
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setFilterStatut(k); setScrollTrigger(n => n + 1) }}
                        className="hover:text-foreground transition-colors"
                      >
                        {STATUT_LABELS[k] ?? k} <span className="text-foreground font-medium">{n}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* À traiter — action triage panel. Clickable rows that
                toggle the matching quick-chip AND scroll to the list. */}
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3">À traiter</p>
              <div className="divide-y divide-border">
                <TriageRow
                  icon="🚨"
                  label="Action requise"
                  count={triageCounts.needsAction}
                  tone={triageCounts.needsAction > 0 ? 'urgent' : 'muted'}
                  active={chipNeedsAction}
                  onClick={() => { setChipNeedsAction(v => !v); setScrollTrigger(n => n + 1) }}
                />
                <TriageRow
                  icon="⏱"
                  label="Bloquées > 7j"
                  count={triageCounts.stuck}
                  tone={triageCounts.stuck > 0 ? 'warn' : 'muted'}
                  active={chipStuck}
                  onClick={() => { setChipStuck(v => !v); setScrollTrigger(n => n + 1) }}
                />
                <TriageRow
                  icon="📂"
                  label="Dossier incomplet"
                  count={triageCounts.docsMissing}
                  tone={triageCounts.docsMissing > 0 ? 'accent' : 'muted'}
                  active={chipDocsMissing}
                  onClick={() => { setChipDocsMissing(v => !v); setScrollTrigger(n => n + 1) }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Postes — editorial numeric-prefix list ────────────
            Chapter-marked rows grouped under pôle eyebrows. Flat
            layout (no nested cards) so the scanning eye reads down
            the numeric column, then laterally to counts. Secondary
            actions (compare / shortlist / edit) live in an inline
            icon strip that reveals on hover — keeps the row calm by
            default. */}
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">Postes</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {postes.length} postes · {postes.reduce((s, p) => s + p.candidateCount, 0)} candidats
            </p>
          </div>
          {(() => {
            let idx = 0
            return ['legacy', 'java_modernisation', 'fonctionnel'].map(pole => {
              const polePostes = postesByPole.get(pole) ?? []
              if (polePostes.length === 0) return null
              const poleTotal = polePostes.reduce((s, p) => s + p.candidateCount, 0)
              const poleActive = polePostes.reduce((s, p) => s + p.activeCount, 0)
              return (
                <div key={pole} className="mb-5 last:mb-0">
                  <div className="flex items-baseline gap-3 py-2 border-t">
                    <Badge variant="secondary" className={`${POLE_COLORS[pole]} text-[10px] tracking-wide uppercase font-semibold px-2 py-0.5`}>
                      {POLE_LABELS[pole]}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {poleTotal} candidat{poleTotal !== 1 ? 's' : ''} · {poleActive} actif{poleActive !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div>
                    {polePostes.map(p => {
                      idx++
                      const isSelected = filterPoste === p.id
                      return (
                        <div
                          key={p.id}
                          className={`group relative flex items-center gap-3 py-3 border-t border-border/60 transition-colors hover:bg-muted/40 ${isSelected ? 'bg-muted/60' : ''}`}
                        >
                          {isSelected && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />}
                          <button
                            type="button"
                            onClick={() => {
                              setFilterPole(pole)
                              setFilterPoste(p.id)
                              setFilterStatut('all')
                              setScrollTrigger(n => n + 1)
                            }}
                            className="flex-1 flex items-baseline gap-4 text-left min-w-0"
                          >
                            <span className="text-[11px] font-mono tabular-nums text-muted-foreground/60 w-6 shrink-0 pl-2">
                              {String(idx).padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0 flex items-baseline gap-3 flex-wrap">
                              <span className="font-medium text-sm text-foreground truncate">{p.titre}</span>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {p.headcount} poste{p.headcountFlexible ? ' (flex.)' : ''} · {p.experienceMin} ans
                              </span>
                            </div>
                          </button>
                          <div className="flex items-center gap-3 shrink-0 pr-2">
                            <div className="text-right tabular-nums">
                              <span className="text-sm font-semibold text-foreground">{p.candidateCount}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {p.activeCount > 0 && <> · <span className="text-primary font-medium">{p.activeCount} actif{p.activeCount !== 1 ? 's' : ''}</span></>}
                              </span>
                            </div>
                            <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                              <Tooltip>
                                <TooltipTrigger
                                  render={(
                                    <a
                                      href={`/recruit/reports/comparison/${p.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                    >
                                      <BarChart3 className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                />
                                <TooltipContent className="text-xs">Comparer les candidats</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger
                                  render={(
                                    <Link
                                      to={`/recruit/postes/${p.id}/shortlist`}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                    >
                                      <Trophy className="h-3.5 w-3.5" />
                                    </Link>
                                  )}
                                />
                                <TooltipContent className="text-xs">Shortlist + contact</TooltipContent>
                              </Tooltip>
                              {p.id !== 'candidature-libre' && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={(
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setEditingPoste(p) }}
                                        className={`inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent ${p.description ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  />
                                  <TooltipContent className="text-xs">
                                    {p.description ? 'Modifier la fiche de poste' : 'Ajouter une fiche de poste'}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}
        </section>

        {/* ── Candidatures — working area ─────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Candidatures
            </p>
            <Link to="/recruit" className="text-[11px] text-muted-foreground hover:text-foreground tabular-nums">
              <span className="text-foreground font-medium">{filtered.length}</span>
              {filtered.length !== candidatures.length ? ` / ${candidatures.length}` : ''} résultat{filtered.length !== 1 ? 's' : ''}
            </Link>
          </div>
        {/* Filters — redesigned: single toolbar row (search + primary filters +
            advanced popover + sort + view + count) with active pills + quick
            chips on a second row that only appears when something is in use. */}
        {(() => {
          const advancedActiveCount =
            (filterExperience !== 'all' ? 1 : 0) +
            (filterNotice !== 'all' ? 1 : 0)
          const activePillCount =
            (filterPole !== 'all' ? 1 : 0) +
            (filterPoste !== 'all' ? 1 : 0) +
            (filterStatut !== 'all' ? 1 : 0) +
            advancedActiveCount +
            (filterSearch ? 1 : 0)
          const hasAnyActive = activePillCount > 0 || activeChipCount > 0
          const resetAll = () => {
            setFilterPole('all'); setFilterPoste('all'); setFilterStatut('all')
            setFilterExperience('all'); setFilterNotice('all'); setFilterSearch('')
            setChipStuck(false); setChipDocsMissing(false); setChipNeedsAction(false)
          }
          return <>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {/* Search with leading icon — primary affordance, grows to fill. */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Rechercher (nom, ville, poste…)"
              className="pl-8 h-9"
            />
          </div>

          {/* Primary filter dropdowns — the three most-used axes. */}
          <Select value={filterPole} onValueChange={(v) => { setFilterPole(v ?? 'all'); setFilterPoste('all') }}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue>
                {filterPole === 'all' ? 'Tous les pôles' : POLE_LABELS[filterPole] ?? filterPole}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les pôles</SelectItem>
              {Object.entries(POLE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPoste} onValueChange={(v) => setFilterPoste(v ?? 'all')}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue>
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
            <SelectTrigger className="w-40 h-9">
              <SelectValue>
                {filterStatut === 'all' ? 'Tous les statuts' : STATUT_LABELS[filterStatut] ?? filterStatut}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {Object.entries(STATUT_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Advanced filters (rarely used: Expérience + Préavis) tucked away. */}
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" className="h-9 gap-1.5" />}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtres
              {advancedActiveCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">
                  {advancedActiveCount}
                </Badge>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block uppercase tracking-wide">Expérience</label>
                <Select value={filterExperience} onValueChange={(v) => setFilterExperience(v ?? 'all')}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue>{EXPERIENCE_LABELS[filterExperience] ?? filterExperience}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPERIENCE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block uppercase tracking-wide">Préavis</label>
                <Select value={filterNotice} onValueChange={(v) => setFilterNotice(v ?? 'all')}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue>{NOTICE_LABELS[filterNotice] ?? filterNotice}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NOTICE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          {/* Visual separator between filter and display controls. */}
          <div className="h-6 w-px bg-border mx-1 hidden md:block" />

          {/* Sort. */}
          <Select
            value={sortBy}
            onValueChange={(v) => {
              const next = v as SortKey
              setSortBy(next)
              localStorage.setItem('pipeline-sort', next)
            }}
          >
            <SelectTrigger className="w-[220px] h-9 gap-1.5" aria-label="Trier les candidatures">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue>{SORT_LABELS[sortBy]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map(k => (
                <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="inline-flex rounded-md border border-border">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-r-none text-xs h-9"
              onClick={() => changeView('list')}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Candidatures
            </Button>
            <Button
              variant={viewMode === 'candidates' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-none border-x text-xs h-9"
              onClick={() => changeView('candidates')}
              title="Vue par candidat (un candidat peut avoir plusieurs candidatures)"
            >
              <Users className="h-3.5 w-3.5" />
              Candidats
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-l-none text-xs h-9"
              onClick={() => changeView('kanban')}
            >
              <Kanban className="h-3.5 w-3.5" />
              Kanban
            </Button>
          </div>
        </div>

        {/* Row 2: active filter pills + Réinitialiser — only appears when
            something is in use. Quick chips moved up to the "À traiter"
            panel (they're triage, not display filters). */}
        {hasAnyActive && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {activeChipCount > 0 && (
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mr-1">Triage actif</span>
          )}
          {chipStuck && <FilterPill label="⏱ Bloquées > 7j" onRemove={() => setChipStuck(false)} />}
          {chipDocsMissing && <FilterPill label="📂 Dossier incomplet" onRemove={() => setChipDocsMissing(false)} />}
          {chipNeedsAction && <FilterPill label="🚨 Action requise" onRemove={() => setChipNeedsAction(false)} />}
          {activePillCount > 0 && activeChipCount > 0 && <div className="h-5 w-px bg-border mx-1" />}
          {filterPole !== 'all' && (
            <FilterPill
              label={`Pôle : ${POLE_LABELS[filterPole] ?? filterPole}`}
              onRemove={() => { setFilterPole('all'); setFilterPoste('all') }}
            />
          )}
          {filterPoste !== 'all' && (
            <FilterPill
              label={`Poste : ${postes.find(p => p.id === filterPoste)?.titre ?? filterPoste}`}
              onRemove={() => setFilterPoste('all')}
            />
          )}
          {filterStatut !== 'all' && (
            <FilterPill
              label={`Statut : ${STATUT_LABELS[filterStatut] ?? filterStatut}`}
              onRemove={() => setFilterStatut('all')}
            />
          )}
          {filterExperience !== 'all' && (
            <FilterPill
              label={`Exp. : ${EXPERIENCE_LABELS[filterExperience] ?? filterExperience}`}
              onRemove={() => setFilterExperience('all')}
            />
          )}
          {filterNotice !== 'all' && (
            <FilterPill
              label={`Préavis : ${NOTICE_LABELS[filterNotice] ?? filterNotice}`}
              onRemove={() => setFilterNotice('all')}
            />
          )}
          {filterSearch && (
            <FilterPill
              label={`Recherche : "${filterSearch}"`}
              onRemove={() => setFilterSearch('')}
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-[11px] px-2"
            onClick={resetAll}
          >
            Réinitialiser
          </Button>
        </div>
        )}
        </>
        })()}

        {/* Candidatures — list or kanban */}
        <div ref={candidaturesRef} className="scroll-mt-16" />
        {/* Empty state only gates the candidature views — the 'candidates'
            view has its own empty state, since a candidate can exist
            without any candidature yet. */}
        {viewMode !== 'candidates' && filtered.length === 0 ? (
          <div className="border-t border-b py-16 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aucune candidature pour ces filtres.</p>
            <p className="text-xs mt-1 text-muted-foreground/70">Les candidatures arrivent via sinapse.nc ou peuvent être créées manuellement.</p>
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard
            candidatures={sorted.map(c => ({
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
        ) : viewMode === 'candidates' ? (
          // Candidate-level table — aggregated by person (a candidate can
          // have multiple candidatures, and candidates can exist without
          // any candidature at all). Search + sort only; the pôle/poste/
          // statut dropdowns are candidature-scoped and don't apply here.
          (() => {
            const q = filterSearch.trim().toLowerCase()
            const filteredCands = q ? candidates.filter(c => c.name.toLowerCase().includes(q)) : candidates
            const statusOrder = (c: Candidate): number => {
              if (c.pipelineStatus) return PIPELINE_ORDER[c.pipelineStatus] ?? -1
              if (c.hasReport) return -2
              if (c.submittedAt) return -3
              return -4
            }
            const sortedCands = [...filteredCands].sort((a, b) => {
              let cmp = 0
              switch (candSortKey) {
                case 'name': cmp = a.name.localeCompare(b.name, 'fr'); break
                case 'role': cmp = a.role.localeCompare(b.role, 'fr'); break
                case 'status': cmp = statusOrder(a) - statusOrder(b); break
                case 'createdAt': cmp = a.createdAt.localeCompare(b.createdAt); break
              }
              return candSortDir === 'asc' ? cmp : -cmp
            })

            const toggleSort = (key: typeof candSortKey) => {
              if (candSortKey === key) setCandSortDir(d => d === 'asc' ? 'desc' : 'asc')
              else { setCandSortKey(key); setCandSortDir(key === 'name' ? 'asc' : 'desc') }
            }
            const sortIcon = (key: typeof candSortKey) => {
              if (candSortKey !== key) return <ArrowUpDown className="h-3 w-3 opacity-40" />
              return candSortDir === 'asc'
                ? <ArrowUp className="h-3 w-3 text-primary" />
                : <ArrowDown className="h-3 w-3 text-primary" />
            }

            if (sortedCands.length === 0) {
              return (
                <div className="border-t border-b py-16 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Aucun candidat {filterSearch ? 'pour cette recherche' : ''}.</p>
                </div>
              )
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 pt-2 font-medium">
                        <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                          Nom {sortIcon('name')}
                        </button>
                      </th>
                      <th className="pb-3 pt-2 font-medium">
                        <button onClick={() => toggleSort('role')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                          Poste {sortIcon('role')}
                        </button>
                      </th>
                      <th className="pb-3 pt-2 font-medium">
                        <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                          Statut {sortIcon('status')}
                        </button>
                      </th>
                      <th className="pb-3 pt-2 font-medium">
                        <button onClick={() => toggleSort('createdAt')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                          Créé le {sortIcon('createdAt')}
                        </button>
                      </th>
                      <th className="pb-3 pt-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCands.map(c => {
                      const statusLabel = c.pipelineStatus ? (STATUT_LABELS[c.pipelineStatus] ?? c.pipelineStatus) : null
                      const statusClass = c.pipelineStatus ? (STATUT_COLORS[c.pipelineStatus] ?? '') : ''
                      return (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-3">
                            <Link to={`/recruit/${c.id}`} className="hover:underline font-medium" onClick={(e) => e.stopPropagation()}>
                              {c.name}
                            </Link>
                            {c.candidatureCount > 1 && (
                              <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">
                                ({c.candidatureCount} candidatures)
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-muted-foreground">{c.role}</td>
                          <td className="py-3">
                            {statusLabel ? (
                              <Badge variant="secondary" className={statusClass}>{statusLabel}</Badge>
                            ) : c.hasReport ? (
                              <Badge variant="default" className="bg-[#1B6179]">Analysé</Badge>
                            ) : c.submittedAt ? (
                              <Badge variant="default" className="bg-primary">Soumis</Badge>
                            ) : new Date(c.expiresAt) < new Date() ? (
                              <Badge variant="destructive">Expiré</Badge>
                            ) : (
                              <Badge variant="secondary">En attente</Badge>
                            )}
                          </td>
                          <td className="py-3 text-muted-foreground tabular-nums">{formatDate(c.createdAt)}</td>
                          <td className="py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger
                                  render={(
                                    <Button variant="ghost" size="sm" onClick={() => copyCandidateLink(c.id)} className="h-8 w-8 p-0">
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  )}
                                />
                                <TooltipContent className="text-xs">Copier le lien d'évaluation</TooltipContent>
                              </Tooltip>
                              {c.submittedAt && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={(
                                      <Link to={`/recruit/${c.id}`} className="inline-flex">
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                      </Link>
                                    )}
                                  />
                                  <TooltipContent className="text-xs">Voir le profil</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger
                                  render={(
                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteCandidateById(c.id, c.name)} className="h-8 w-8 p-0">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                />
                                <TooltipContent className="text-xs">Supprimer le candidat</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()
        ) : (
          // Editorial list: hairline-separated rows. Selection state is a
          // left teal accent (not a ring) so it's visible but doesn't
          // balloon the row height.
          <div className="border-t">
            {sorted.map(c => {
              const isSel = selectedIds.has(c.id)
              return (
                <div key={c.id} className="relative flex items-start gap-3 border-b group hover:bg-muted/30 transition-colors">
                  {isSel && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />}
                  <div
                    className="pt-4 pl-3 shrink-0"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                  >
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggleSelection(c.id)}
                    />
                  </div>
                  <Link
                    to={`/recruit/${c.candidateId}`}
                    className="block flex-1 min-w-0 py-3 pr-3"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <PipelineCandidatureRow
                          candidateName={c.candidateName}
                          posteTitre={c.posteTitre}
                          canal={c.canal}
                          canalLabel={CANAL_LABELS[c.canal] ?? c.canal}
                          createdAtLabel={formatDate(c.createdAt)}
                          hasCv={c.hasCv}
                          hasLettre={c.hasLettre}
                          evaluationSubmitted={c.evaluationSubmitted}
                          softSkillAlertCount={c.softSkillAlerts?.length ?? 0}
                          preview={c.previewProfile}
                          statusChip={<StatusChip statut={c.statut} enteredStatusAt={c.enteredStatusAt} />}
                          docsChip={<DocsChip docsSlotCount={c.docsSlotCount} />}
                        />
                      </div>

                      {/* Compatibility — three stacked mini-bars kept tabular
                          for vertical scan comparison between candidates. */}
                      <div className="hidden sm:flex flex-col gap-1 w-44 pt-1">
                        <CompatibilityBar value={c.tauxPoste} label="Poste" />
                        <CompatibilityBar value={c.tauxEquipe} label="Équipe" />
                        <CompatibilityBar value={c.tauxGlobal} label="Global" />
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>
        )}
        </section>

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

      {/* New candidate dialog (merged from old /recruit page). */}
      <NewCandidateDialog
        open={newCandidateOpen}
        onOpenChange={setNewCandidateOpen}
        onCreated={fetchData}
      />
    </div>
  )
}

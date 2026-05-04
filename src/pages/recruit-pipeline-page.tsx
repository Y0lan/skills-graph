import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type PipelineStage, STAGE_STATUSES, STAGE_LABELS, STAGE_ORDER, statutMatchesStageFilter,
} from '@/lib/pipeline-stage-filter'
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
import { Loader2, Users, ChevronRight, FileText, Settings, BarChart3, Info, LayoutList, Kanban, Download, Pencil, Trophy, Search, SlidersHorizontal, ArrowUpDown, X, Plus, Copy, Trash2, Eye, GitBranch, UserCog, ArrowUp, ArrowDown, ClipboardCheck, PhoneCall, Check, XCircle, Star, Building2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import NewCandidateDialog from '@/components/recruit/new-candidate-dialog'
import RoleManagerPanel from '@/components/recruit/role-manager-panel'
import KpiCell from '@/components/recruit/kpi-cell'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, POLE_LABELS, POLE_COLORS, formatDate, parseAppDate } from '@/lib/constants'
import { classifyLocation, LOCATION_BUCKET_LABELS, type LocationBucket } from '@/lib/location'
import KanbanBoard from '@/components/recruit/kanban-board'
import StatusChip from '@/components/recruit/status-chip'
import DocsChip from '@/components/recruit/docs-chip'
import PosteDescriptionDialog from '@/components/recruit/poste-description-dialog'
import PipelineCandidatureRow from '@/components/recruit/pipeline-candidature-row'
import { isTestCandidateEmail } from '@/lib/test-candidate'
import { FlaskConical } from 'lucide-react'

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

// ─── Pipeline stages (funnel shortcut) ───────────────────────────────
// Group the 10 statuses into 4 meaningful stages + 1 terminal chip.
// Stage filter is a SEPARATE dimension from exact statut filter; they
// combine AND-wise so the recruiter can say "Évaluation stage" OR
// "specifically skill_radar_complete" without either overriding the
// other. `refuse` is not in the active funnel — terminal rejections
// would distort stage ratios — it lives in the standalone chip.
// Stage taxonomy + statut→stage matcher live in src/lib/pipeline-stage-filter.ts
// so this file only exports the page component (Fast Refresh requirement).

const SORT_KEYS = [
  'poste_desc', 'poste_asc',
  'global_desc', 'global_asc',
  'equipe_desc', 'equipe_asc',
  'date_desc', 'date_asc',
] as const
type SortKey = (typeof SORT_KEYS)[number]
const SORT_LABELS: Record<SortKey, string> = {
  poste_desc: 'Score poste (élevé → faible)',
  poste_asc: 'Score poste (faible → élevé)',
  global_desc: 'Score global (élevé → faible)',
  global_asc: 'Score global (faible → élevé)',
  equipe_desc: 'Score équipe (élevé → faible)',
  equipe_asc: 'Score équipe (faible → élevé)',
  date_desc: 'Plus récent',
  date_asc: 'Plus ancien',
}
/** Compact trigger label for the chip — full description stays in the menu. */
const SORT_CHIP_LABELS: Record<SortKey, string> = {
  poste_desc: 'Score poste ↓',
  poste_asc: 'Score poste ↑',
  global_desc: 'Score global ↓',
  global_asc: 'Score global ↑',
  equipe_desc: 'Score équipe ↓',
  equipe_asc: 'Score équipe ↑',
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
  // v5.x — canal filter, 4 distinct values + "all". Refined from the
  // initial binary cabinet/direct toggle to expose the schema\'s full
  // 4-state vocabulary (cabinet / sinapse.nc / candidature directe /
  // réseau) so recruiters can isolate "réseau" candidates etc.
  const [filterCanal, setFilterCanal] = useState<'all' | 'cabinet' | 'site' | 'candidature_directe' | 'reseau'>('all')
  // v5.x — location filter (Nouméa / NC reste / France / International /
  // Inconnu). Demo ask: "pouvoir filtrer les candidatures par celle qui
  // sont de Nouméa et celle ailleurs de Nouvelle-Calédonie", refined to
  // 4 + unknown buckets.
  const [filterLocation, setFilterLocation] = useState<'all' | 'noumea' | 'nc_outside' | 'france' | 'international' | 'unknown'>('all')
  // Separate dimension from filterStatut — see STAGE_STATUSES comment.
  const [filterStage, setFilterStage] = useState<PipelineStage | 'refuses' | 'all'>('all')
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
  const [postesOpen, setPostesOpen] = useState(() => localStorage.getItem('pipeline-postes-open') === 'true')
  // Default sort = "best candidate first" by global score. Recruiter
  // feedback: opening the candidates view sorted by Plus récent meant
  // a low-fit candidate sat at the top until you found the dropdown.
  const DEFAULT_SORT: SortKey = 'global_desc'
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    const raw = localStorage.getItem('pipeline-sort')
    // Backward compat: the first sort release used `fit_*` for the (then-
    // single) poste-score axis. Keep stored prefs working without a reset.
    const migrated = raw === 'fit_desc' ? 'poste_desc' : raw === 'fit_asc' ? 'poste_asc' : raw
    return migrated && (SORT_KEYS as readonly string[]).includes(migrated) ? (migrated as SortKey) : DEFAULT_SORT
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
      // Instant, not smooth. Smooth animation was eating follow-up clicks on
      // the filter toolbar: mousedown landed on chip A, mouseup landed on
      // chip B after reflow, browser dropped the click.
      el.scrollIntoView({ behavior: 'auto', block: 'nearest' })
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

  // Refresh pipeline data when the tab regains focus. There's no global
  // SSE stream for this page (only per-candidature streams), so when a
  // candidate submits their Skill Radar elsewhere and the recruiter
  // comes back to the pipeline tab, we refetch to pull in the auto-
  // advanced status. Cheap, debounced implicitly by browser focus
  // events, and avoids showing stale "Skill Radar envoyé" for hours.
  useEffect(() => {
    const onFocus = () => { fetchData() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchData])

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
    if (!statutMatchesStageFilter(c.statut, filterStage)) return false
    if (filterCanal !== 'all' && c.canal !== filterCanal) return false
    if (filterLocation !== 'all') {
      const bucket = classifyLocation(
        c.previewProfile?.city ?? null,
        c.previewProfile?.country ?? null,
      )
      if (bucket !== filterLocation) return false
    }
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
      const days = (Date.now() - (parseAppDate(enteredAt)?.getTime() ?? Date.now())) / 86_400_000
      if (days < 7) return false
      if (c.statut === 'embauche' || c.statut === 'refuse') return false
    }
    if (chipDocsMissing && c.docsSlotCount >= 2) return false
    if (chipNeedsAction) {
      // "Needs action" = stuck + docs missing + has soft skill alerts (any)
      const enteredAt = c.enteredStatusAt ?? c.createdAt
      const days = (Date.now() - (parseAppDate(enteredAt)?.getTime() ?? Date.now())) / 86_400_000
      const isStuck = days >= 7 && c.statut !== 'embauche' && c.statut !== 'refuse'
      const docsIncomplete = c.docsSlotCount < 2
      const hasAlerts = (c.softSkillAlerts?.length ?? 0) > 0
      if (!isStuck && !docsIncomplete && !hasAlerts) return false
    }
    return true
  })

  // Sort after filtering. Ties on score break on created_at DESC so newer
  // applications still bubble up inside equal-score groups (matches the
  // server's tiebreak). The sort key encodes axis + direction:
  //   poste|global|equipe|date  _  asc|desc
  const sorted = [...filtered].sort((a, b) => {
    const [axisKey, dir] = sortBy.split('_') as ['poste' | 'global' | 'equipe' | 'date', 'asc' | 'desc']
    if (axisKey !== 'date') {
      const field = axisKey === 'poste' ? 'tauxPoste' : axisKey === 'global' ? 'tauxGlobal' : 'tauxEquipe'
      const aV = a[field] ?? -Infinity
      const bV = b[field] ?? -Infinity
      const delta = dir === 'desc' ? bV - aV : aV - bV
      if (delta !== 0) return delta
    }
    const aTs = parseAppDate(a.createdAt)?.getTime() ?? 0
    const bTs = parseAppDate(b.createdAt)?.getTime() ?? 0
    return dir === 'asc' && axisKey === 'date' ? aTs - bTs : bTs - aTs
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
      const days = (now - (parseAppDate(enteredAt)?.getTime() ?? now)) / 86_400_000
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
        {/* ── Masthead (compact) ──────────────────────────────────
            One title line + one action row. Stats moved to the KPI
            strip below — no duplication. */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Raleway Variable', sans-serif" }}>
              Recrutement
            </h1>
            <span className="text-sm text-muted-foreground">
              Campagne avril 2026 · {postes.length} postes
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" className="h-9 gap-1.5 mr-1" onClick={() => setNewCandidateOpen(true)}>
              <Plus className="h-4 w-4" />
              Nouveau candidat
            </Button>
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
                    {customRoleCount > 0 && (
                      <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">
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
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Link to="/recruit/shortlist" className="inline-flex">
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                      <Star className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
              />
              <TooltipContent>Candidats sauvegardés</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Role manager panel — slides in under the masthead when open. */}
        {showRoleManager && (
          <div className="mb-6 pb-6 border-b">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3">Rôles</p>
            <RoleManagerPanel onCountChange={setCustomRoleCount} />
          </div>
        )}

        {/* ── KPI strip — 6 equal cells ───────────────────────────
            Single-weight tabular dashboard. Neutral cells read-only,
            triage cells click to toggle the matching quick-chip and
            scroll to the list. Colors only fire when count > 0 so a
            healthy pipeline stays calm, not noisy. */}
        {stats && (
          <div className="sticky top-12 z-30 -mx-4 mb-6 border-y bg-background/95 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-border">
              <KpiCell label="Total" sublabel="candidatures" count={stats.totalCandidatures} tone="neutral" />
              <KpiCell label="Actifs" sublabel="en cours" count={stats.totalActive} tone="neutral" />
              <KpiCell
                label="Action"
                sublabel="requise"
                count={triageCounts.needsAction}
                tone="urgent"
                interactive
                active={chipNeedsAction}
                onClick={() => { setChipNeedsAction(v => !v); setScrollTrigger(n => n + 1) }}
              />
              <KpiCell
                label="Bloquée"
                sublabel="> 7 jours"
                count={triageCounts.stuck}
                tone="warn"
                interactive
                active={chipStuck}
                onClick={() => { setChipStuck(v => !v); setScrollTrigger(n => n + 1) }}
              />
              <KpiCell
                label="Dossier"
                sublabel="incomplet"
                count={triageCounts.docsMissing}
                tone="accent"
                interactive
                active={chipDocsMissing}
                onClick={() => { setChipDocsMissing(v => !v); setScrollTrigger(n => n + 1) }}
              />
              <KpiCell label="Embauches" sublabel="campagne" count={stats.statusBreakdown?.embauche ?? 0} tone="success" />
            </div>

            {/* Funnel stage shortcuts — 4 active stages + Refusés chip.
                Each pill counts statuts in the stage and filters on click.
                Combines with the exact-statut dropdown AND-wise; does not
                replace it. Refusés is terminal so it lives beside the
                funnel to keep stage ratios honest. */}
            <div className="border-t px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const breakdown = stats.statusBreakdown ?? {}
                  const totalActive = STAGE_ORDER.reduce(
                    (sum, st) => sum + STAGE_STATUSES[st].reduce((s, k) => s + (breakdown[k] ?? 0), 0),
                    0,
                  ) || 1
                  const stageCount = (st: PipelineStage) =>
                    STAGE_STATUSES[st].reduce((s, k) => s + (breakdown[k] ?? 0), 0)
                  const stageIcon: Record<PipelineStage, typeof Users> = {
                    nouveaux: Users,
                    evaluation: ClipboardCheck,
                    entretiens: PhoneCall,
                    decision: Check,
                  }
                  return STAGE_ORDER.map(st => {
                    const n = stageCount(st)
                    const pct = Math.round((n / totalActive) * 100)
                    const active = filterStage === st
                    const Icon = stageIcon[st]
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          setFilterStage(prev => prev === st ? 'all' : st)
                          setScrollTrigger(x => x + 1)
                        }}
                        className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs tabular-nums transition-all ${
                          active
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border hover:border-primary/60 hover:bg-muted'
                        }`}
                        aria-pressed={active}
                        aria-label={`Filtrer sur l'étape ${STAGE_LABELS[st]} (${n} candidat(s))`}
                      >
                        <Icon className="h-3.5 w-3.5 opacity-70" />
                        <span className={active ? 'font-medium' : ''}>{STAGE_LABELS[st]}</span>
                        <span className="font-semibold">{n}</span>
                        <span className="text-muted-foreground text-[10px]">· {pct}%</span>
                      </button>
                    )
                  })
                })()}
                {(stats.statusBreakdown?.refuse ?? 0) > 0 ? (
                  <>
                    <span className="text-muted-foreground/40 mx-1" aria-hidden>·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterStage(prev => prev === 'refuses' ? 'all' : 'refuses')
                        setScrollTrigger(x => x + 1)
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs tabular-nums transition-all ${
                        filterStage === 'refuses'
                          ? 'border-red-400 bg-red-500/10 text-red-700 dark:text-red-300'
                          : 'border-border text-muted-foreground hover:border-red-400/60 hover:text-foreground'
                      }`}
                      aria-pressed={filterStage === 'refuses'}
                      aria-label={`Filtrer sur les candidats refusés (${stats.statusBreakdown?.refuse} candidat(s))`}
                    >
                      <XCircle className="h-3.5 w-3.5 opacity-70" />
                      Refusés
                      <span className="font-semibold">{stats.statusBreakdown?.refuse}</span>
                    </button>
                  </>
                ) : null}
                {filterStage !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => setFilterStage('all')}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-1"
                  >
                    Effacer l’étape
                  </button>
                ) : null}
              </div>
              {/* Per-statut precision filter is the toolbar dropdown,
                  not a redundant counts row. Codex audit flagged the
                  duplicated row as noise on top of the pills. */}
            </div>
          </div>
        )}

        {/* ── Postes — editorial numeric-prefix list, collapsed ──
            Wrapped in a <details> disclosure; defaults closed. Most
            recruiters filter by poste via the toolbar dropdown — the
            detailed list is navigation + admin (compare / shortlist /
            edit), not primary work. State persists in localStorage. */}
        <details
          open={postesOpen}
          onToggle={e => {
            const next = e.currentTarget.open
            setPostesOpen(next)
            localStorage.setItem('pipeline-postes-open', String(next))
          }}
          className="mb-6 group"
        >
          <summary className="cursor-pointer list-none flex items-center gap-2 py-2 border-b hover:bg-muted/20 select-none">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">Postes</span>
            <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
              {postes.length} postes · {postes.reduce((s, p) => s + p.candidateCount, 0)} candidats · {postes.reduce((s, p) => s + p.activeCount, 0)} actifs
            </span>
          </summary>
          <div className="pt-2">

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
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onClick={() => {
                            // Clear pole unconditionally: posteId narrows strictly
                            // more than pole, so keeping a stale pole can contradict
                            // the new poste (e.g. pole=legacy + poste from java).
                            // This also makes the Poste chip × a clean unscope.
                            setFilterPole('all')
                            setFilterPoste(isSelected ? 'all' : p.id)
                            setFilterStatut('all')
                            setScrollTrigger(n => n + 1)
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return
                            e.preventDefault()
                            setFilterPole('all')
                            setFilterPoste(isSelected ? 'all' : p.id)
                            setFilterStatut('all')
                            setScrollTrigger(n => n + 1)
                          }}
                          className={`group relative flex items-center gap-3 py-3 border-t border-border/60 transition-colors cursor-pointer hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${isSelected ? 'bg-muted/60' : ''}`}
                        >
                          {isSelected && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />}
                          <div className="flex-1 flex items-baseline gap-4 text-left min-w-0">
                            <span className="text-[11px] font-mono tabular-nums text-muted-foreground/60 w-6 shrink-0 pl-2">
                              {String(idx).padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0 flex items-baseline gap-3 flex-wrap">
                              <span className="font-medium text-sm text-foreground truncate">{p.titre}</span>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {p.headcount} poste{p.headcountFlexible ? ' (flex.)' : ''} · {p.experienceMin} ans
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 pr-2" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </details>

        {/* ── Candidatures — working area ───────────────────────
            Single-row Stripe-inline bar. Each filter is a two-state
            chip: ghost+label when empty, primary-tinted with inline
            value + × clear when active. No pills row below (active
            state lives in the chip itself). Quick triage chips live
            in the KPI strip above, not here. */}
        <section>
        {(() => {
          const advancedActiveCount =
            (filterExperience !== 'all' ? 1 : 0) +
            (filterNotice !== 'all' ? 1 : 0)
          const hasAnyActive =
            filterPole !== 'all' || filterPoste !== 'all' || filterStatut !== 'all' ||
            filterExperience !== 'all' || filterNotice !== 'all' ||
            !!filterSearch || activeChipCount > 0
          const resetAll = () => {
            setFilterPole('all'); setFilterPoste('all'); setFilterStatut('all')
            setFilterExperience('all'); setFilterNotice('all'); setFilterSearch('')
            setChipStuck(false); setChipDocsMissing(false); setChipNeedsAction(false)
          }
          // Chip styling: ghost when empty, primary-tinted when active.
          const chipEmpty = 'h-8 px-3 rounded-md border border-border bg-transparent text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground gap-1.5'
          const chipActive = 'h-8 pl-3 pr-2 rounded-md border-primary/40 bg-primary/10 text-sm text-foreground font-medium hover:bg-primary/15 gap-1.5'
          // Tiny × button that attaches flush to the right of an active chip.
          const chipClear = (onClick: () => void, label: string) => (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick() }}
              aria-label={`Retirer ${label}`}
              className="inline-flex items-center justify-center h-8 w-7 -ml-px rounded-r-md border border-primary/40 bg-primary/10 text-muted-foreground hover:bg-primary/20 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
          return (
          <div className="sticky top-[14rem] z-40 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-y bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:top-[10.5rem]">
            {/* Search — the one primary control, wider than the chips. */}
            <div className="relative flex-1 min-w-[200px] max-w-[360px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Rechercher un candidat"
                className="pl-8 h-8"
              />
            </div>

            {/* Pôle chip */}
            <span className="inline-flex items-stretch">
              <Select value={filterPole} onValueChange={(v) => { setFilterPole(v ?? 'all'); setFilterPoste('all') }}>
                <SelectTrigger
                  className={`${filterPole === 'all' ? chipEmpty : `${chipActive} rounded-r-none border-r-0`}`}
                  aria-label="Filtrer par pôle"
                >
                  <SelectValue>
                    {filterPole === 'all' ? 'Pôle' : <>Pôle <span className="text-muted-foreground">:</span> {POLE_LABELS[filterPole] ?? filterPole}</>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les pôles</SelectItem>
                  {Object.entries(POLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filterPole !== 'all' && chipClear(() => { setFilterPole('all'); setFilterPoste('all') }, 'Pôle')}
            </span>

            {/* Poste chip */}
            <span className="inline-flex items-stretch">
              <Select value={filterPoste} onValueChange={(v) => setFilterPoste(v ?? 'all')}>
                <SelectTrigger
                  className={`${filterPoste === 'all' ? chipEmpty : `${chipActive} rounded-r-none border-r-0`}`}
                  aria-label="Filtrer par poste"
                >
                  <SelectValue>
                    {filterPoste === 'all' ? 'Poste' : <>Poste <span className="text-muted-foreground">:</span> {postes.find(p => p.id === filterPoste)?.titre ?? filterPoste}</>}
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
              {filterPoste !== 'all' && chipClear(() => setFilterPoste('all'), 'Poste')}
            </span>

            {/* Statut chip */}
            <span className="inline-flex items-stretch">
              <Select value={filterStatut} onValueChange={(v) => setFilterStatut(v ?? 'all')}>
                <SelectTrigger
                  className={`${filterStatut === 'all' ? chipEmpty : `${chipActive} rounded-r-none border-r-0`}`}
                  aria-label="Filtrer par statut"
                >
                  <SelectValue>
                    {filterStatut === 'all' ? 'Statut' : <>Statut <span className="text-muted-foreground">:</span> {STATUT_LABELS[filterStatut] ?? filterStatut}</>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {Object.entries(STATUT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filterStatut !== 'all' && chipClear(() => setFilterStatut('all'), 'Statut')}
            </span>

            {/* Canal chip — 4-state filter exposing the schema\'s full
                vocabulary. Lets the recruiter isolate any single
                acquisition channel. */}
            <span className="inline-flex items-stretch">
              <Select value={filterCanal} onValueChange={(v) => setFilterCanal((v ?? 'all') as 'all' | 'cabinet' | 'site' | 'candidature_directe' | 'reseau')}>
                <SelectTrigger
                  className={`${filterCanal === 'all' ? chipEmpty : `${chipActive} rounded-r-none border-r-0`}`}
                  aria-label="Filtrer par canal"
                >
                  <SelectValue>
                    {filterCanal === 'all' ? (
                      <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />Canal</span>
                    ) : (
                      <>Canal <span className="text-muted-foreground">:</span> {CANAL_LABELS[filterCanal] ?? filterCanal}</>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les canaux</SelectItem>
                  <SelectItem value="cabinet">Cabinet</SelectItem>
                  <SelectItem value="site">sinapse.nc</SelectItem>
                  <SelectItem value="candidature_directe">Candidature directe</SelectItem>
                  <SelectItem value="reseau">Réseau</SelectItem>
                </SelectContent>
              </Select>
              {filterCanal !== 'all' && chipClear(() => setFilterCanal('all'), 'Canal')}
            </span>

            {/* Localisation chip — Nouméa / NC reste / France / Intl /
                Inconnu. Demo ask: filtrer par zone géographique avec
                priorité à la ville (NC est administrativement français,
                donc city > country dans le classifier — voir
                src/lib/location.ts). */}
            <span className="inline-flex items-stretch">
              <Select value={filterLocation} onValueChange={(v) => setFilterLocation((v ?? 'all') as 'all' | LocationBucket)}>
                <SelectTrigger
                  className={`${filterLocation === 'all' ? chipEmpty : `${chipActive} rounded-r-none border-r-0`}`}
                  aria-label="Filtrer par localisation"
                >
                  <SelectValue>
                    {filterLocation === 'all'
                      ? 'Localisation'
                      : <>Localisation <span className="text-muted-foreground">:</span> {LOCATION_BUCKET_LABELS[filterLocation as LocationBucket]}</>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les localisations</SelectItem>
                  <SelectItem value="noumea">Nouméa</SelectItem>
                  <SelectItem value="nc_outside">NC (reste)</SelectItem>
                  <SelectItem value="france">France</SelectItem>
                  <SelectItem value="international">International</SelectItem>
                  <SelectItem value="unknown">Inconnu (CV non extrait)</SelectItem>
                </SelectContent>
              </Select>
              {filterLocation !== 'all' && chipClear(() => setFilterLocation('all'), 'Localisation')}
            </span>

            {/* Plus — advanced filters (Expérience + Préavis). Count badge
                when active; otherwise compact icon+label. */}
            <Popover>
              <PopoverTrigger
                render={(
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 gap-1.5 ${advancedActiveCount > 0 ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground'}`}
                  />
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Plus
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

            {/* Trier chip — compact arrow-label, full description in menu. */}
            <Select
              value={sortBy}
              onValueChange={(v) => {
                const next = v as SortKey
                setSortBy(next)
                localStorage.setItem('pipeline-sort', next)
              }}
            >
              <SelectTrigger className={`${chipEmpty} text-foreground`} aria-label="Trier les candidatures">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue>Trier : {SORT_CHIP_LABELS[sortBy]}</SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-[240px]">
                <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Par score</div>
                {(['poste_desc', 'poste_asc', 'global_desc', 'global_asc', 'equipe_desc', 'equipe_asc'] as const).map(k => (
                  <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
                ))}
                <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Par date</div>
                <SelectItem value="date_desc">{SORT_LABELS.date_desc}</SelectItem>
                <SelectItem value="date_asc">{SORT_LABELS.date_asc}</SelectItem>
              </SelectContent>
            </Select>
            {sortBy !== DEFAULT_SORT ? (
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSortBy(DEFAULT_SORT)
                        localStorage.setItem('pipeline-sort', DEFAULT_SORT)
                      }}
                      aria-label="Réinitialiser le tri (meilleur candidat en premier)"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                />
                <TooltipContent>Réinitialiser le tri (meilleur candidat en premier)</TooltipContent>
              </Tooltip>
            ) : null}

            {/* View toggle — icons only, tooltips on hover. */}
            <div className="inline-flex rounded-md border border-border ml-auto">
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-8 w-8 p-0 rounded-r-none"
                      onClick={() => changeView('list')}
                      aria-label="Vue Candidatures"
                    >
                      <LayoutList className="h-3.5 w-3.5" />
                    </Button>
                  )}
                />
                <TooltipContent className="text-xs">Candidatures</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant={viewMode === 'candidates' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-8 w-8 p-0 rounded-none border-x"
                      onClick={() => changeView('candidates')}
                      aria-label="Vue Candidats"
                    >
                      <Users className="h-3.5 w-3.5" />
                    </Button>
                  )}
                />
                <TooltipContent className="text-xs">Candidats (par personne)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-8 w-8 p-0 rounded-l-none"
                      onClick={() => changeView('kanban')}
                      aria-label="Vue Kanban"
                    >
                      <Kanban className="h-3.5 w-3.5" />
                    </Button>
                  )}
                />
                <TooltipContent className="text-xs">Kanban</TooltipContent>
              </Tooltip>
            </div>

            {/* Reset (conditional) + count — right-anchored. */}
            {hasAnyActive && (
              <button
                type="button"
                onClick={resetAll}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                × Réinitialiser
              </button>
            )}
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {filtered.length === candidatures.length
                ? `${filtered.length} résultat${filtered.length !== 1 ? 's' : ''}`
                : `${filtered.length} / ${candidatures.length}`}
            </span>
          </div>
          )
        })()}

        {/* Candidatures — list or kanban */}
        <div ref={candidaturesRef} className="scroll-mt-56" />
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
          // any candidature at all). Filters are resolved against the
          // candidate's `role` (stringy poste title) + `pipelineStatus`
          // so the same pôle/poste/statut dropdowns work in both views.
          (() => {
            const q = filterSearch.trim().toLowerCase()
            // Pipeline's filterPoste/filterPole are IDs. Candidates expose
            // only a stringy `role` title, which collides when two postes
            // share a title. Resolve via candidatures: build a Set of
            // candidate IDs whose applications match the filter, then
            // filter candidates by id.
            const allowedByPoste = filterPoste === 'all'
              ? null
              : new Set(candidatures.filter(c => c.posteId === filterPoste).map(c => c.candidateId))
            const allowedByPole = filterPole === 'all'
              ? null
              : new Set(candidatures.filter(c => c.postePole === filterPole).map(c => c.candidateId))
            const filteredCands = candidates.filter(c => {
              if (q && !c.name.toLowerCase().includes(q)) return false
              if (allowedByPoste && !allowedByPoste.has(c.id)) return false
              if (allowedByPole && !allowedByPole.has(c.id)) return false
              if (filterStatut !== 'all' && c.pipelineStatus !== filterStatut) return false
              if (!statutMatchesStageFilter(c.pipelineStatus, filterStage)) return false
              return true
            })
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
                            {isTestCandidateEmail(c.email) && (
                              <span
                                className="ml-2 inline-flex items-center gap-0.5 rounded border border-amber-500/60 bg-amber-500/10 px-1 text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:border-amber-400/60 dark:text-amber-300 align-middle"
                                title="Candidat de test (email yopmail)"
                              >
                                <FlaskConical className="h-2.5 w-2.5" />
                                TEST
                              </span>
                            )}
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
                            ) : (parseAppDate(c.expiresAt)?.getTime() ?? 0) < Date.now() ? (
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
                          isTest={isTestCandidateEmail(c.candidateEmail)}
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

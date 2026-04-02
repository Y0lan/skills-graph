import { useCallback, useEffect, useState } from 'react'
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
import { Loader2, Users, Building2, ChevronRight } from 'lucide-react'

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR')
}

interface Poste {
  id: string
  roleId: string
  titre: string
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
  evaluationSubmitted: boolean
  tauxPoste: number | null
  tauxEquipe: number | null
  notesDirecteur: string | null
  createdAt: string
  updatedAt: string
}

interface DashboardStats {
  poles: { pole: string; poste_count: number; candidature_count: number; active_count: number }[]
  totalCandidatures: number
  totalActive: number
  statusBreakdown: Record<string, number>
}

const POLE_LABELS: Record<string, string> = {
  legacy: 'Legacy (Adélia / IBMi)',
  java_modernisation: 'Java / Modernisation',
  fonctionnel: 'Fonctionnel',
}

const POLE_COLORS: Record<string, string> = {
  legacy: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  java_modernisation: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  fonctionnel: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
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

const CANAL_LABELS: Record<string, string> = {
  cabinet_seyos: 'SEYOS',
  cabinet_altaide: 'Altaïde',
  site: 'sinapse.nc',
  local_nc: 'NC direct',
  reseau: 'Réseau',
  direct: 'Direct',
}

function CompatibilityBar({ value, label }: { value: number | null; label: string }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-12">{label}</span>
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
  const [filterStatut, setFilterStatut] = useState<string>('all')

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
    return true
  })

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
                    <span className="text-muted-foreground text-sm font-normal">
                      {polePostes.reduce((s, p) => s + p.candidateCount, 0)} candidat(s)
                    </span>
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
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                      >
                        <div>
                          <span className="font-medium text-sm">{p.titre}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {p.headcount} poste{p.headcountFlexible ? ' (flex.)' : ''} · {p.experienceMin} ans min.
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">
                            {p.candidateCount} candidat{p.candidateCount !== 1 ? 's' : ''}
                          </Badge>
                          {p.activeCount > 0 && (
                            <Badge className="text-xs bg-blue-500">
                              {p.activeCount} actif{p.activeCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
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
          <Select value={filterPole} onValueChange={v => { setFilterPole(v); setFilterPoste('all') }}>
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

          <Select value={filterPoste} onValueChange={setFilterPoste}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Tous les postes" />
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

          <Select value={filterStatut} onValueChange={setFilterStatut}>
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

          {(filterPole !== 'all' || filterPoste !== 'all' || filterStatut !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterPole('all'); setFilterPoste('all'); setFilterStatut('all') }}
            >
              Réinitialiser
            </Button>
          )}

          <span className="text-sm text-muted-foreground ml-auto">
            {filtered.length} candidature{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Candidatures list */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>Aucune candidature pour ces filtres.</p>
              <p className="text-xs mt-1">Les candidatures arrivent via sinapse.nc ou peuvent être créées manuellement.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => (
              <Link
                key={c.id}
                to={`/recruit/${c.candidateId}`}
                className="block"
              >
                <Card className="hover:bg-muted/30 transition-colors">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-4">
                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{c.candidateName}</span>
                          <Badge variant="secondary" className={STATUT_COLORS[c.statut] ?? ''}>
                            {STATUT_LABELS[c.statut] ?? c.statut}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{c.posteTitre}</span>
                          <span>·</span>
                          <span>{CANAL_LABELS[c.canal] ?? c.canal}</span>
                          <span>·</span>
                          <span>{formatDate(c.createdAt)}</span>
                          {c.hasCv && <Badge variant="outline" className="text-[10px] px-1 py-0">CV</Badge>}
                          {c.evaluationSubmitted && <Badge variant="outline" className="text-[10px] px-1 py-0">Évalué</Badge>}
                        </div>
                      </div>

                      {/* Compatibility scores */}
                      <div className="hidden sm:flex flex-col gap-1 w-44">
                        <CompatibilityBar value={c.tauxPoste} label="Poste" />
                        <CompatibilityBar value={c.tauxEquipe} label="Équipe" />
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

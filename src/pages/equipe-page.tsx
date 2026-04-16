import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Eye, Search, ArrowLeft } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import MemberAvatar from '@/components/member-avatar'
import { POLE_LABELS, POLE_COLORS, formatDate } from '@/lib/constants'

interface MemberRow {
  slug: string
  name: string
  role: string
  team: string
  pole: string | null
  avgScore: number | null
  ratedCount: number
  totalCount: number
  submittedAt: string | null
  lastActivityAt: string | null
}

interface TeamMemberApi {
  slug: string
  name: string
  role: string
  team: string
  email: string
  pole: string | null
}

interface AggregatesMember {
  slug: string
  name: string
  role: string
  team: string
  pole: string | null
  submittedAt: string | null
  categoryAverages: Record<string, number>
  lastActivityAt: string | null
}

interface AggregatesResponse {
  teamSize: number
  submittedCount: number
  members: AggregatesMember[]
  categories: { categoryId: string; categoryLabel: string }[]
}

type SortField = 'name' | 'role' | 'pole' | 'score' | 'completion' | 'lastEval'
type SortDir = 'asc' | 'desc'

function SortHeader({ field, children, sortField, onToggle }: {
  field: SortField
  children: React.ReactNode
  sortField: SortField
  onToggle: (field: SortField) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-foreground' : 'text-muted-foreground/50'}`} />
    </button>
  )
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 3.5) return 'text-green-600 dark:text-green-400'
  if (score >= 2.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function EquipePage() {
  const navigate = useNavigate()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [poleFilter, setPoleFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch('/api/members', { signal: controller.signal }).then(r => r.json()),
      fetch('/api/aggregates', { signal: controller.signal }).then(r => r.json()),
    ])
      .then(([membersData, aggregatesData]: [TeamMemberApi[], AggregatesResponse]) => {
        const aggMap = new Map(aggregatesData.members.map(m => [m.slug, m]))
        const catCount = aggregatesData.categories?.length ?? 0

        const rows: MemberRow[] = membersData.map(m => {
          const agg = aggMap.get(m.slug)
          if (!agg) {
            return {
              slug: m.slug,
              name: m.name,
              role: m.role,
              team: m.team,
              pole: m.pole,
              avgScore: null,
              ratedCount: 0,
              totalCount: catCount,
              submittedAt: null,
              lastActivityAt: null,
            }
          }

          const avgs = Object.values(agg.categoryAverages).filter(v => v > 0)
          const avgScore = avgs.length > 0
            ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100
            : null
          const ratedCount = avgs.length

          return {
            slug: m.slug,
            name: m.name,
            role: m.role,
            team: m.team,
            pole: m.pole,
            avgScore,
            ratedCount,
            totalCount: catCount,
            submittedAt: agg.submittedAt,
            lastActivityAt: agg.lastActivityAt,
          }
        })

        setMembers(rows)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  const poles = useMemo(() => {
    const set = new Set<string>()
    for (const m of members) {
      if (m.pole) set.add(m.pole)
    }
    return Array.from(set).sort()
  }, [members])

  const filtered = useMemo(() => {
    let result = members

    if (poleFilter !== 'all') {
      result = result.filter(m => m.pole === poleFilter)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(m => m.name.toLowerCase().includes(q))
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'role':
          cmp = a.role.localeCompare(b.role)
          break
        case 'pole':
          cmp = (a.pole ?? '').localeCompare(b.pole ?? '')
          break
        case 'score':
          cmp = (a.avgScore ?? -1) - (b.avgScore ?? -1)
          break
        case 'completion':
          cmp = a.ratedCount - b.ratedCount
          break
        case 'lastEval':
          cmp = (a.lastActivityAt ?? '').localeCompare(b.lastActivityAt ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [members, poleFilter, search, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Equipe</h1>
          <p className="text-sm text-muted-foreground">
            {members.length} membres — {members.filter(m => m.submittedAt).length} evaluations soumises
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          value={poleFilter}
          onChange={e => setPoleFilter(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="all">Tous les poles</option>
          {poles.map(p => (
            <option key={p} value={p}>{POLE_LABELS[p] ?? p}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">
                <SortHeader field="name" sortField={sortField} onToggle={toggleSort}>Nom</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="role" sortField={sortField} onToggle={toggleSort}>Role</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="pole" sortField={sortField} onToggle={toggleSort}>Pole</SortHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortHeader field="score" sortField={sortField} onToggle={toggleSort}>Score</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="completion" sortField={sortField} onToggle={toggleSort}>Completion</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="lastEval" sortField={sortField} onToggle={toggleSort}>Derniere evaluation</SortHeader>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Aucun membre trouve.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(m => {
                const completionPct = m.totalCount > 0
                  ? Math.round((m.ratedCount / m.totalCount) * 100)
                  : 0

                return (
                  <TableRow key={m.slug} className="cursor-pointer" onClick={() => navigate(`/dashboard/${m.slug}`)}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <MemberAvatar slug={m.slug} name={m.name} size={28} className="shrink-0" />
                        <span className="font-medium">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{m.role}</TableCell>
                    <TableCell>
                      {m.pole ? (
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${POLE_COLORS[m.pole] ?? ''}`}>
                          {POLE_LABELS[m.pole] ?? m.pole}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.avgScore !== null ? (
                        <span className={`font-semibold tabular-nums ${scoreColor(m.avgScore)}`}>
                          {m.avgScore.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${completionPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {m.ratedCount}/{m.totalCount}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(m.lastActivityAt)}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/dashboard/${m.slug}`)
                              }}
                            />
                          }
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>Voir le profil</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

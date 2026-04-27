import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, Search, ArrowUpDown, X, ChevronRight, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { teamOrder } from '@/data/team-roster'
import { cn, daysSince, freshnessColor, humanFreshness } from '@/lib/utils'
import { POLE_LABELS } from '@/lib/constants'
import type { TeamMemberAggregateResponse } from '@/lib/types'
import VisxRadarChart from '@/components/visx-radar-chart'
import { useCatalog } from '@/hooks/use-catalog'
import MemberAvatar from '@/components/member-avatar'

interface TeamMembersGridProps {
  members: TeamMemberAggregateResponse[]
  poleCategoryIds?: string[]
}

type SortKey = 'name' | 'role' | 'team' | 'score'

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Nom',
  role: 'Rôle',
  team: 'Équipe',
  score: 'Score',
}

/** Mean of the member's non-zero category averages — used for the table's
 * "Score" column AND the score-based sort. Hidden 0 categories means a
 * member who hasn't rated themselves doesn't drag their own average down. */
function memberOverallAvg(member: TeamMemberAggregateResponse): number {
  const scores = Object.values(member.categoryAverages).filter(v => v > 0)
  if (scores.length === 0) return 0
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

export default function TeamMembersGrid({ members, poleCategoryIds }: TeamMembersGridProps) {
  const { categories: skillCategories } = useCatalog()

  const [searchQuery, setSearchQuery] = useState('')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterPole, setFilterPole] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)

  const uniqueTeams = useMemo(() => [...new Set(members.map(m => m.team))].sort(), [members])
  const uniquePoles = useMemo(() => [...new Set(members.map(m => m.pole).filter(Boolean) as string[])].sort(), [members])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'score' ? 'desc' : 'asc') }
  }

  const filtered = useMemo(() => {
    let result = members
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(m => m.name.toLowerCase().includes(q))
    }
    if (filterTeam !== 'all') result = result.filter(m => m.team === filterTeam)
    if (filterPole !== 'all') result = result.filter(m => m.pole === filterPole)

    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name, 'fr'); break
        case 'role': cmp = a.role.localeCompare(b.role, 'fr'); break
        case 'team': {
          const aIdx = teamOrder.indexOf(a.team)
          const bIdx = teamOrder.indexOf(b.team)
          cmp = aIdx - bIdx
          break
        }
        case 'score': cmp = memberOverallAvg(a) - memberOverallAvg(b); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [members, searchQuery, filterTeam, filterPole, sortKey, sortDir])

  const hasActiveFilter = searchQuery || filterTeam !== 'all' || filterPole !== 'all'

  // Any filter or sort change collapses an open row. Two reasons: (1) the
  // expanded row may scroll out of the filtered set; (2) keeping it open
  // after the filter clears would silently re-show it, which felt like a
  // ghost-state bug in QA. Wrap the setters so we never have to remember
  // to clear `expandedSlug` at every callsite.
  const onSearchChange = (v: string) => { setExpandedSlug(null); setSearchQuery(v) }
  const onFilterTeamChange = (v: string) => { setExpandedSlug(null); setFilterTeam(v) }
  const onFilterPoleChange = (v: string) => { setExpandedSlug(null); setFilterPole(v) }
  const onResetFilters = () => {
    setExpandedSlug(null); setSearchQuery(''); setFilterTeam('all'); setFilterPole('all')
  }
  // Derive the visible expansion: hide it when the expanded member is no
  // longer in the filtered set (e.g. mid-typing in search). Pure derivation
  // — no setState in render → no cascading render.
  const visibleExpandedSlug = expandedSlug && filtered.some(m => m.slug === expandedSlug)
    ? expandedSlug
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membres de l'équipe</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterTeam} onValueChange={v => onFilterTeamChange(v ?? 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Toutes les équipes">
                {filterTeam === 'all' ? 'Toutes les équipes' : `Équipe : ${filterTeam}`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les équipes</SelectItem>
              {uniqueTeams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {uniquePoles.length > 0 && (
            <Select value={filterPole} onValueChange={v => onFilterPoleChange(v ?? 'all')}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tous les pôles">
                  {filterPole === 'all' ? 'Tous les pôles' : `Pôle : ${POLE_LABELS[filterPole] ?? filterPole}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les pôles</SelectItem>
                {uniquePoles.map(p => <SelectItem key={p} value={p}>{POLE_LABELS[p] ?? p}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={sortKey} onValueChange={v => toggleSort(v as SortKey)}>
            <SelectTrigger className="w-44">
              <ArrowUpDown className="h-3 w-3 shrink-0" />
              <SelectValue placeholder="Trier par">
                Trier par {SORT_LABELS[sortKey]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Score</SelectItem>
              <SelectItem value="name">Nom</SelectItem>
              <SelectItem value="role">Rôle</SelectItem>
              <SelectItem value="team">Équipe</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="flex items-center gap-1" aria-label={`Inverser le tri (${sortDir === 'asc' ? 'asc' : 'desc'})`}>
            {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            <span className="text-xs">{sortKey === 'score' ? (sortDir === 'desc' ? 'haut→bas' : 'bas→haut') : (sortDir === 'asc' ? 'A→Z' : 'Z→A')}</span>
          </Button>
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" onClick={onResetFilters}>
              <X className="mr-1 h-3 w-3" /> Réinitialiser
            </Button>
          )}
        </div>

        {/* Count */}
        <p className="mt-3 mb-4 text-sm text-muted-foreground">
          {filtered.length === members.length
            ? `${members.length} membre${members.length !== 1 ? 's' : ''}`
            : `${filtered.length} / ${members.length} membre${members.length !== 1 ? 's' : ''}`}
          <span className="ml-3 text-xs">Cliquez une ligne pour voir le radar et le détail.</span>
        </p>

        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 font-medium">Membre</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Rôle</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Équipe</th>
                <th className="px-3 py-2 font-medium text-right">Score</th>
                <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Δ</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Mis à jour</th>
                <th className="px-3 py-2 font-medium hidden xl:table-cell">Top forces</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(member => {
                const hasSubmitted = member.submittedAt !== null
                const expanded = visibleExpandedSlug === member.slug
                const score = memberOverallAvg(member)
                const lastTouchAt = member.lastActivityAt ?? member.submittedAt
                return (
                  <Fragment key={member.slug}>
                    <tr
                      className={cn(
                        'border-t transition-colors',
                        hasSubmitted ? 'cursor-pointer hover:bg-muted/30' : 'opacity-50',
                        expanded && 'bg-muted/30',
                      )}
                      onClick={hasSubmitted ? () => setExpandedSlug(expanded ? null : member.slug) : undefined}
                      onKeyDown={hasSubmitted ? e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          // Ignore key events bubbled from the inline link.
                          if ((e.target as HTMLElement).tagName === 'A') return
                          e.preventDefault()
                          setExpandedSlug(expanded ? null : member.slug)
                        }
                      } : undefined}
                      tabIndex={hasSubmitted ? 0 : -1}
                      aria-expanded={expanded}
                      aria-label={`${member.name} — ${expanded ? 'masquer' : 'afficher'} le détail`}
                    >
                      <td className="px-2 py-2 text-muted-foreground">
                        {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <MemberAvatar slug={member.slug} name={member.name} size={24} />
                          <Link
                            to={`/dashboard/${member.slug}`}
                            className="font-medium hover:text-primary hover:underline"
                            onClick={e => e.stopPropagation()}
                          >
                            {member.name}
                          </Link>
                          {!hasSubmitted && <Badge variant="outline" className="text-[10px]">En attente</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{member.role}</td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <span className="text-primary/80">{member.team}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {score > 0 ? score.toFixed(1) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell">
                        {member.progressionDelta > 0.05 && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                            <ArrowUp className="h-3 w-3" />+{member.progressionDelta.toFixed(1)}
                          </span>
                        )}
                        {member.progressionDelta < -0.05 && (
                          <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                            <ArrowDown className="h-3 w-3" />{member.progressionDelta.toFixed(1)}
                          </span>
                        )}
                        {Math.abs(member.progressionDelta) <= 0.05 && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        {lastTouchAt
                          ? <span className={freshnessColor(daysSince(lastTouchAt))}>{humanFreshness(daysSince(lastTouchAt))}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {member.topStrengths.slice(0, 3).map(s => {
                            const meta = skillCategories.find(c => c.id === s.categoryId)
                            return (
                              <Badge
                                key={s.categoryId}
                                className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-medium"
                              >
                                {meta?.label.split(/[&(]/)[0].trim() ?? s.categoryId} {s.avg.toFixed(1)}
                              </Badge>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                    {expanded && hasSubmitted && (
                      <ExpandedRow
                        member={member}
                        skillCategories={skillCategories}
                        poleCategoryIds={poleCategoryIds}
                      />
                    )}
                  </Fragment>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Aucun membre ne correspond à ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

interface ExpandedRowProps {
  member: TeamMemberAggregateResponse
  skillCategories: { id: string; label: string }[]
  poleCategoryIds?: string[]
}

function ExpandedRow({ member, skillCategories, poleCategoryIds }: ExpandedRowProps) {
  const radarData = skillCategories
    .filter(cat => poleCategoryIds
      ? poleCategoryIds.includes(cat.id)
      : (member.categoryAverages[cat.id] ?? 0) > 0)
    .map(cat => ({
      label: cat.label.split(/[&(]/)[0].trim(),
      value: member.categoryAverages[cat.id] ?? 0,
      fullMark: 5,
    }))
  // When poleCategoryIds is passed, every poleCategory is included even
  // if the member rated none — gate on at least one positive value to
  // avoid rendering an empty origin-pinned polygon.
  const radarHasSignal = radarData.length >= 3 && radarData.some(d => d.value > 0)

  return (
    <tr>
      <td colSpan={8} className="bg-muted/15 border-t border-b">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 p-4">
          <div className="min-w-0">
            {radarHasSignal ? (
              <VisxRadarChart data={radarData} height={320} />
            ) : (
              <p className="text-sm text-muted-foreground italic py-12 text-center">
                Pas assez de catégories évaluées pour afficher le radar.
              </p>
            )}
          </div>
          <div className="space-y-4">
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Forces</h4>
              {member.topStrengths.length === 0
                ? <p className="text-sm text-muted-foreground italic">Aucune force identifiée.</p>
                : (
                  <ul className="space-y-1">
                    {member.topStrengths.slice(0, 5).map(s => {
                      const meta = skillCategories.find(c => c.id === s.categoryId)
                      return (
                        <li key={s.categoryId} className="flex items-center justify-between gap-3 text-sm">
                          <span>{meta?.label ?? s.categoryId}</span>
                          <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{s.avg.toFixed(1)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
            </section>
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Écarts vs cible</h4>
              {member.topGaps.length === 0
                ? <p className="text-sm text-muted-foreground italic">Aucun écart identifié.</p>
                : (
                  <ul className="space-y-1">
                    {member.topGaps.slice(0, 5).map(g => {
                      const meta = skillCategories.find(c => c.id === g.categoryId)
                      return (
                        <li key={g.categoryId} className="flex items-center justify-between gap-3 text-sm">
                          <span>{meta?.label ?? g.categoryId}</span>
                          <span className="tabular-nums font-semibold text-red-600 dark:text-red-400">-{g.gap.toFixed(1)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
            </section>
            <Link
              to={`/dashboard/${member.slug}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Voir le profil complet →
            </Link>
          </div>
        </div>
      </td>
    </tr>
  )
}

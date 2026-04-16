import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, Search, ArrowUpDown, X } from 'lucide-react'
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

export default function TeamMembersGrid({ members, poleCategoryIds }: TeamMembersGridProps) {
  const { categories: skillCategories } = useCatalog()

  const [searchQuery, setSearchQuery] = useState('')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterPole, setFilterPole] = useState('all')
  const [sortKey, setSortKey] = useState<'name' | 'role' | 'team'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const uniqueTeams = useMemo(() => [...new Set(members.map(m => m.team))].sort(), [members])
  const uniquePoles = useMemo(() => [...new Set(members.map(m => m.pole).filter(Boolean) as string[])].sort(), [members])

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
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
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [members, searchQuery, filterTeam, filterPole, sortKey, sortDir])

  const hasActiveFilter = searchQuery || filterTeam !== 'all' || filterPole !== 'all'

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
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterTeam} onValueChange={v => setFilterTeam(v ?? 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Toutes les équipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les équipes</SelectItem>
              {uniqueTeams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {uniquePoles.length > 0 && (
            <Select value={filterPole} onValueChange={v => setFilterPole(v ?? 'all')}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tous les pôles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les pôles</SelectItem>
                {uniquePoles.map(p => <SelectItem key={p} value={p}>{POLE_LABELS[p] ?? p}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="sm" onClick={() => toggleSort(sortKey)} className="flex items-center gap-1">
            <ArrowUpDown className="h-3 w-3" />
            {sortKey === 'name' ? 'Nom' : sortKey === 'role' ? 'Rôle' : 'Équipe'}
            <span className="text-xs text-muted-foreground">({sortDir === 'asc' ? 'A-Z' : 'Z-A'})</span>
          </Button>
          <Select value={sortKey} onValueChange={v => { setSortKey(v as typeof sortKey); setSortDir('asc') }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Trier par" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nom</SelectItem>
              <SelectItem value="role">Rôle</SelectItem>
              <SelectItem value="team">Équipe</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setFilterTeam('all'); setFilterPole('all') }}>
              <X className="mr-1 h-3 w-3" /> Réinitialiser
            </Button>
          )}
        </div>

        {/* Count */}
        <p className="mt-3 mb-4 text-sm text-muted-foreground">
          {filtered.length === members.length
            ? `${members.length} membre${members.length !== 1 ? 's' : ''}`
            : `${filtered.length} / ${members.length} membre${members.length !== 1 ? 's' : ''}`}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((member) => {
            const hasSubmitted = member.submittedAt !== null
            const radarData = hasSubmitted
              ? skillCategories
                  .filter((cat) => poleCategoryIds
                    ? poleCategoryIds.includes(cat.id)
                    : (member.categoryAverages[cat.id] ?? 0) > 0
                  )
                  .map((cat) => ({
                    label: cat.label.split(/[&(]/)[0].trim(),
                    value: member.categoryAverages[cat.id] ?? 0,
                    fullMark: 5,
                  }))
              : []

            // Top 3 strengths with category metadata
            const strengthBadges = hasSubmitted
              ? member.topStrengths.slice(0, 3).map((s) => {
                  const catMeta = skillCategories.find((c) => c.id === s.categoryId)
                  return {
                    categoryId: s.categoryId,
                    shortLabel: catMeta?.label.split(/[&(]/)[0].trim() ?? '',
                    avg: s.avg,
                  }
                })
              : []

            return (
              <Card
                key={member.slug}
                className={`transition-opacity ${!hasSubmitted ? 'opacity-40' : ''}`}
              >
                <CardContent className="flex flex-col items-center gap-2 pt-4">
                  {hasSubmitted && radarData.length >= 3 && (
                    <VisxRadarChart data={radarData} height={180} compact />
                  )}
                  <MemberAvatar
                    slug={member.slug}
                    name={member.name}
                    size={28}
                    href={`/dashboard/${member.slug}`}
                  />
                  <div className="text-center">
                    <Link
                      to={`/dashboard/${member.slug}`}
                      className="font-semibold hover:text-primary hover:underline"
                    >
                      {member.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                    <p className="mt-0.5 text-xs font-medium text-primary/70">{member.team}</p>
                    <div className="flex items-center justify-center gap-2 mt-0.5">
                      {member.progressionDelta > 0.05 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <ArrowUp className="h-2.5 w-2.5" />+{member.progressionDelta.toFixed(1)}
                        </span>
                      )}
                      {member.progressionDelta < -0.05 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <ArrowDown className="h-2.5 w-2.5" />{member.progressionDelta.toFixed(1)}
                        </span>
                      )}
                      {(member.lastActivityAt || member.submittedAt) && (
                        <span className={cn('text-[10px]', freshnessColor(daysSince(member.lastActivityAt ?? member.submittedAt!)))}>
                          {humanFreshness(daysSince(member.lastActivityAt ?? member.submittedAt!))}
                        </span>
                      )}
                    </div>
                    {!hasSubmitted && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        En attente
                      </Badge>
                    )}
                    {hasSubmitted && (strengthBadges.length > 0 || member.topGaps.length > 0) && (
                      <div className="mt-2 flex flex-wrap justify-center gap-1">
                        {/* Strength badges (positive first) */}
                        {strengthBadges.map((s) => (
                          <Badge
                            key={`str-${s.categoryId}`}
                            className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs"
                            title={s.shortLabel}
                          >
                            {s.shortLabel} {s.avg.toFixed(1)}
                          </Badge>
                        ))}
                        {/* Gap badges */}
                        {member.topGaps.slice(0, 3).map((g) => {
                          const gapMeta = skillCategories.find((c) => c.id === g.categoryId)
                          return (
                            <Badge
                              key={`gap-${g.categoryId}`}
                              className="bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs"
                            >
                              {gapMeta?.label.split(/[&(]/)[0].trim() ?? g.categoryId} -{g.gap.toFixed(1)}
                            </Badge>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

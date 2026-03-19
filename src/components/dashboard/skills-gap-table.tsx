import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { shortLabel } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, Info } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import type { TeamMemberAggregateResponse, TeamCategoryAggregateResponse } from '@/lib/types'
import { useCatalog } from '@/hooks/use-catalog'
import MemberAvatar from '@/components/member-avatar'

interface SkillsGapTableProps {
  members: TeamMemberAggregateResponse[]
  categories: TeamCategoryAggregateResponse[]
}

interface GapRow {
  categoryId: string
  categoryLabel: string
  gap: number
  avgRank: number
  targetRank: number
}

interface MemberGroup {
  memberName: string
  memberSlug: string
  role: string
  worstGap: number
  gaps: GapRow[]
}

function severityBadge(gap: number) {
  if (gap >= 2) {
    return (
      <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30">
        Critique
      </Badge>
    )
  }
  if (gap >= 1) {
    return (
      <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
        À améliorer
      </Badge>
    )
  }
  return (
    <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
      OK
    </Badge>
  )
}

function gapBar(gap: number) {
  const pct = Math.min((gap / 5) * 100, 100)

  let colorClass: string
  if (gap >= 2) {
    colorClass = 'bg-red-500 dark:bg-red-400'
  } else if (gap >= 1) {
    colorClass = 'bg-amber-500 dark:bg-amber-400'
  } else {
    colorClass = 'bg-emerald-500 dark:bg-emerald-400'
  }

  return (
    <div className="h-2 w-16 overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function SkillsGapTable({ members, categories }: SkillsGapTableProps) {
  const { categories: skillCategories } = useCatalog()
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  // Build grouped gaps per member, sorted by worst gap first
  const memberGroups = useMemo(() => {
    const groups: MemberGroup[] = []

    for (const member of members) {
      if (!member.submittedAt) continue
      const memberGaps: GapRow[] = []
      for (const g of member.topGaps) {
        if (g.gap <= 0) continue
        const catInfo = categories.find((c) => c.categoryId === g.categoryId)
        const catMeta = skillCategories.find((c) => c.id === g.categoryId)
        const row: GapRow = {
          categoryId: g.categoryId,
          categoryLabel: catInfo?.categoryLabel ?? catMeta?.label ?? g.categoryId,
          gap: g.gap,
          avgRank: member.categoryAverages[g.categoryId] ?? 0,
          targetRank: (member.categoryAverages[g.categoryId] ?? 0) + g.gap,
        }
        memberGaps.push(row)
      }
      if (memberGaps.length === 0) continue
      // Sort gaps within member by gap desc
      memberGaps.sort((a, b) => b.gap - a.gap)
      groups.push({
        memberName: member.name,
        memberSlug: member.slug,
        role: member.role,
        worstGap: memberGaps[0].gap,
        gaps: memberGaps,
      })
    }

    // Sort members by worst gap desc
    groups.sort((a, b) => b.worstGap - a.worstGap)
    return groups
  }, [members, categories, skillCategories])

  // Apply category filter
  const filtered = useMemo(() => {
    if (!categoryFilter) return memberGroups
    return memberGroups
      .map((g) => ({
        ...g,
        gaps: g.gaps.filter((r) => r.categoryId === categoryFilter),
      }))
      .filter((g) => g.gaps.length > 0)
  }, [memberGroups, categoryFilter])

  // All unique category IDs for filter dropdown
  const uniqueCategories = useMemo(() => {
    const ids = new Set<string>()
    for (const g of memberGroups) {
      for (const r of g.gaps) ids.add(r.categoryId)
    }
    return [...ids]
  }, [memberGroups])

  // CSV export
  const handleExport = () => {
    const header = 'Membre,Rôle,Catégorie,Score,Cible,Écart\n'
    const rows = filtered
      .flatMap((g) =>
        g.gaps.map(
          (r) =>
            `"${g.memberName}","${g.role}","${r.categoryLabel}",${r.avgRank.toFixed(1)},${r.targetRank.toFixed(1)},${r.gap.toFixed(1)}`,
        ),
      )
      .join('\n')
    const csv = header + rows
    navigator.clipboard.writeText(csv).catch(() => {
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'gaps-analysis.csv'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Analyse des lacunes
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Les lacunes sont calculées comme l'écart entre le score moyen
                du membre et l'objectif défini pour chaque catégorie de compétences.
                Sévérité : Critique (écart ≥ 2), À améliorer (≥ 1), OK ({'<'} 1).
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={categoryFilter ?? ''}
            onChange={(e) => setCategoryFilter(e.target.value || null)}
          >
            <option value="">Toutes les catégories</option>
            {uniqueCategories.map((catId) => {
              const catMeta = skillCategories.find((c) => c.id === catId)
              return (
                <option key={catId} value={catId}>
                  {catMeta?.label ?? catId}
                </option>
              )
            })}
          </select>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-3.5 w-3.5" />
            Exporter
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Aucune lacune détectée — tous les membres atteignent leurs objectifs.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Cible</TableHead>
                <TableHead className="text-right">Écart</TableHead>
                <TableHead>Sévérité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((group) => (
                group.gaps.map((row, i) => (
                  <TableRow key={`${group.memberSlug}-${row.categoryId}`}>
                    {/* Member name only on first row, rowspan-style via conditional render */}
                    <TableCell
                      className={`font-medium align-top ${i > 0 ? 'border-t-0 pt-0' : ''}`}
                    >
                      {i === 0 ? (
                        <div className="flex items-center gap-2">
                          <MemberAvatar slug={group.memberSlug} name={group.memberName} size={20} />
                          <div>
                            <Link
                              to={`/dashboard/${group.memberSlug}`}
                              className="hover:text-primary hover:underline"
                            >
                              {group.memberName}
                            </Link>
                            <p className="text-xs text-muted-foreground font-normal">{group.role}</p>
                          </div>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{shortLabel(row.categoryLabel)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.avgRank.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.targetRank.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {row.gap.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {severityBadge(row.gap)}
                        {gapBar(row.gap)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

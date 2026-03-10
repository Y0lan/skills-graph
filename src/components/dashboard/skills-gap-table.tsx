import { useState } from 'react'
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
import { Download } from 'lucide-react'
import type { TeamMemberAggregateResponse, TeamCategoryAggregateResponse } from '@/lib/types'
import { useCatalog } from '@/hooks/use-catalog'

interface SkillsGapTableProps {
  members: TeamMemberAggregateResponse[]
  categories: TeamCategoryAggregateResponse[]
}

interface GapRow {
  memberName: string
  memberSlug: string
  role: string
  categoryId: string
  categoryLabel: string
  gap: number
  avgRank: number
  targetRank: number
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

/** Inline visual bar showing gap severity proportional to 0–5 scale */
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

  // Build flat gap rows from member topGaps
  const gaps: GapRow[] = []
  for (const member of members) {
    if (!member.submittedAt) continue
    for (const g of member.topGaps) {
      const catInfo = categories.find((c) => c.categoryId === g.categoryId)
      const catMeta = skillCategories.find((c) => c.id === g.categoryId)
      if (g.gap <= 0) continue
      gaps.push({
        memberName: member.name,
        memberSlug: member.slug,
        role: member.role,
        categoryId: g.categoryId,
        categoryLabel: catInfo?.categoryLabel ?? catMeta?.label ?? g.categoryId,
        gap: g.gap,
        avgRank: member.categoryAverages[g.categoryId] ?? 0,
        targetRank: (member.categoryAverages[g.categoryId] ?? 0) + g.gap,
      })
    }
  }

  // Sort by gap descending
  gaps.sort((a, b) => b.gap - a.gap)

  const filtered = categoryFilter
    ? gaps.filter((g) => g.categoryId === categoryFilter)
    : gaps

  // T038: Export gaps as CSV
  const handleExport = () => {
    const header = 'Membre,Rôle,Catégorie,Score,Cible,Écart\n'
    const rows = filtered
      .map(
        (g) =>
          `"${g.memberName}","${g.role}","${g.categoryLabel}",${g.avgRank.toFixed(1)},${g.targetRank.toFixed(1)},${g.gap.toFixed(1)}`,
      )
      .join('\n')
    const csv = header + rows
    navigator.clipboard.writeText(csv).catch(() => {
      // Fallback: download
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'gaps-analysis.csv'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const uniqueCategories = [...new Set(gaps.map((g) => g.categoryId))]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Analyse des lacunes</CardTitle>
        <div className="flex items-center gap-2">
          {/* T037: Category filter */}
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
                  {catMeta?.emoji} {catMeta?.label ?? catId}
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
                <TableHead>Rôle</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Cible</TableHead>
                <TableHead className="text-right">Écart</TableHead>
                <TableHead>Sévérité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, i) => (
                <TableRow key={`${row.memberSlug}-${row.categoryId}-${i}`}>
                  <TableCell className="font-medium">
                    <a
                      href={`/dashboard/${row.memberSlug}`}
                      className="hover:text-primary hover:underline"
                    >
                      {row.memberName}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.role}</TableCell>
                  <TableCell>{row.categoryLabel}</TableCell>
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
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

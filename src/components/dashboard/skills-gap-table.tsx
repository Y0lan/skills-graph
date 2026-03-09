import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  skillsGapData,
  type AllRatings,
  type RiskColor,
  type SkillGapData,
} from '@/lib/ratings'

interface SkillsGapTableProps {
  allRatings: AllRatings
}

type SortKey = keyof Pick<
  SkillGapData,
  'skillLabel' | 'categoryLabel' | 'teamAvg' | 'countAt3Plus' | 'riskColor'
> | 'highest' | 'lowest'

type SortDir = 'asc' | 'desc'

const riskBadgeStyles: Record<RiskColor, { className: string; label: string }> = {
  red: {
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    label: 'High Risk',
  },
  yellow: {
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
    label: 'Medium',
  },
  green: {
    className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    label: 'Covered',
  },
}

const riskOrder: Record<RiskColor, number> = { red: 0, yellow: 1, green: 2 }

function getSortValue(row: SkillGapData, key: SortKey): string | number {
  switch (key) {
    case 'skillLabel':
      return row.skillLabel.toLowerCase()
    case 'categoryLabel':
      return row.categoryLabel.toLowerCase()
    case 'teamAvg':
      return row.teamAvg
    case 'countAt3Plus':
      return row.countAt3Plus
    case 'highest':
      return row.highestRater?.value ?? -1
    case 'lowest':
      return row.lowestRater?.value ?? -1
    case 'riskColor':
      return riskOrder[row.riskColor]
  }
}

export default function SkillsGapTable({ allRatings }: SkillsGapTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('skillLabel')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const data = skillsGapData(allRatings)

  const sorted = [...data].sort((a, b) => {
    const aVal = getSortValue(a, sortKey)
    const bVal = getSortValue(b, sortKey)
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'skillLabel', label: 'Skill' },
    { key: 'categoryLabel', label: 'Category' },
    { key: 'teamAvg', label: 'Team Avg' },
    { key: 'countAt3Plus', label: 'At 3+' },
    { key: 'highest', label: 'Highest' },
    { key: 'lowest', label: 'Lowest' },
    { key: 'riskColor', label: 'Risk' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills Gap Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>
                  <button
                    type="button"
                    className="cursor-pointer"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortIndicator(col.key)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => {
              const badge = riskBadgeStyles[row.riskColor]
              return (
                <TableRow key={row.skillId}>
                  <TableCell>{row.skillLabel}</TableCell>
                  <TableCell>{row.categoryLabel}</TableCell>
                  <TableCell>{row.teamAvg.toFixed(1)}</TableCell>
                  <TableCell>{row.countAt3Plus}</TableCell>
                  <TableCell>
                    {row.highestRater
                      ? `${row.highestRater.name} (${row.highestRater.value})`
                      : '\u2014'}
                  </TableCell>
                  <TableCell>
                    {row.lowestRater
                      ? `${row.lowestRater.name} (${row.lowestRater.value})`
                      : '\u2014'}
                  </TableCell>
                  <TableCell>
                    <Badge className={badge.className}>{badge.label}</Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

import { Badge } from '@/components/ui/badge'

export type GapSeverity = 'missing' | 'below' | 'critical'

export interface GapChipProps {
  categoryLabel: string
  rating: number | null
  severity: GapSeverity
  targetRating?: number
}

export function GapChip({ categoryLabel, rating, severity, targetRating = 3 }: GapChipProps) {
  const label =
    severity === 'missing'
      ? `${categoryLabel} : non évalué`
      : severity === 'critical'
        ? `${categoryLabel} : critique`
        : `${categoryLabel} : sous l'objectif`

  const classes =
    severity === 'missing'
      ? 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-700'
      : severity === 'critical'
        ? 'bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700'
        : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700'

  const tooltip =
    rating !== null
      ? `Score ${rating}/${targetRating}`
      : 'Aucune compétence évaluée dans cette catégorie'

  return (
    <Badge variant="outline" className={`${classes} text-xs font-normal`} title={tooltip}>
      {label}
    </Badge>
  )
}

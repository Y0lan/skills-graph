import type { RatingLevel } from '@/data/rating-scale'

/**
 * Adaptive badge styles following the Soft-Glow pattern:
 * Light: tinted bg + high-contrast text (700) + subtle border
 * Dark:  deep tint bg (900 at 30%) + vibrant text (300) + defined border (400/50%)
 */
const levelStyles = [
  'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-300 dark:border-zinc-600/40',
  'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/25 dark:text-red-300 dark:border-red-400/40',
  'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/25 dark:text-orange-300 dark:border-orange-400/40',
  'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/25 dark:text-amber-300 dark:border-amber-400/40',
  'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/25 dark:text-sky-300 dark:border-sky-400/40',
  'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-300 dark:border-emerald-400/40',
]

interface RatingLegendProps {
  ratingScale: RatingLevel[]
}

export default function RatingLegend({ ratingScale }: RatingLegendProps) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Sélectionnez la description qui correspond le mieux à votre niveau pour chaque compétence :
      </p>
      <div className="flex flex-wrap gap-2">
        {ratingScale.map((level) => (
          <span
            key={level.value}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${levelStyles[level.value]}`}
          >
            <span className="font-bold">{level.shortLabel}</span>
            {level.label}
          </span>
        ))}
      </div>
    </div>
  )
}

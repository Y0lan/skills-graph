import { ratingScale } from '@/data/rating-scale'
import { Badge } from '@/components/ui/badge'

const levelColors = [
  'bg-muted text-muted-foreground',
  'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
]

export default function RatingLegend() {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-3">
      {ratingScale.map((level) => (
        <Badge key={level.value} variant="outline" className={levelColors[level.value]}>
          <span className="mr-1 font-bold">{level.shortLabel}</span>
          <span className="text-xs">{level.label}</span>
        </Badge>
      ))}
    </div>
  )
}

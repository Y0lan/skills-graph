import { Card, CardContent } from '@/components/ui/card'
import RadarChart from '@/components/radar-chart'
import { skillCategories } from '@/data/skill-catalog'
import { categoryAverage, type MemberRatings } from '@/lib/ratings'
import { cn } from '@/lib/utils'

interface MemberCardProps {
  name: string
  role: string
  team: string
  ratings: MemberRatings | null
}

export default function MemberCard({ name, role, team, ratings }: MemberCardProps) {
  const hasSubmitted = ratings !== null && ratings.submittedAt !== null

  const radarData = hasSubmitted
    ? skillCategories.map((cat) => ({
        label: cat.emoji,
        value: categoryAverage(cat, ratings.ratings),
        fullMark: 5,
      }))
    : []

  return (
    <Card className={cn(!hasSubmitted && 'opacity-50')}>
      <CardContent className="flex flex-col items-center gap-2 pt-4">
        {hasSubmitted && (
          <RadarChart data={radarData} height={180} compact />
        )}
        <div className="text-center">
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{role}</p>
          <p className="text-xs">{team}</p>
        </div>
      </CardContent>
    </Card>
  )
}

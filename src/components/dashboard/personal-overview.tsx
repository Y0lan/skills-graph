import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import RadarChart from '@/components/radar-chart'
import { skillCategories } from '@/data/skill-catalog'
import { categoryAverage, type MemberRatings } from '@/lib/ratings'

interface PersonalOverviewProps {
  memberName: string
  memberRatings: MemberRatings
}

export default function PersonalOverview({
  memberName,
  memberRatings,
}: PersonalOverviewProps) {
  const data = skillCategories.map((cat) => ({
    label: `${cat.emoji} ${cat.label}`,
    value: categoryAverage(cat, memberRatings.ratings),
    fullMark: 5,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Overview — {memberName}</CardTitle>
      </CardHeader>
      <CardContent>
        <RadarChart data={data} height={400} />
      </CardContent>
    </Card>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import RadarChart from '@/components/radar-chart'
import { skillCategories } from '@/data/skill-catalog'
import {
  teamCategoryAverage,
  categoryAverage,
  type AllRatings,
  type MemberRatings,
} from '@/lib/ratings'

interface TeamOverviewProps {
  allRatings: AllRatings
  viewerRatings?: MemberRatings
}

export default function TeamOverview({
  allRatings,
  viewerRatings,
}: TeamOverviewProps) {
  const data = skillCategories.map((cat) => ({
    label: `${cat.emoji} ${cat.label}`,
    value: teamCategoryAverage(cat, allRatings),
    fullMark: 5,
  }))

  const overlay = viewerRatings
    ? skillCategories.map((cat) => ({
        label: `${cat.emoji} ${cat.label}`,
        value: categoryAverage(cat, viewerRatings.ratings),
        fullMark: 5,
      }))
    : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <RadarChart data={data} overlay={overlay} height={400} />
      </CardContent>
    </Card>
  )
}

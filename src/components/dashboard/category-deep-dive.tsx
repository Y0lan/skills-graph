import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import RadarChart from '@/components/radar-chart'
import { skillCategories } from '@/data/skill-catalog'
import { teamAveragePerSkill, type AllRatings, type MemberRatings } from '@/lib/ratings'

interface CategoryDeepDiveProps {
  allRatings: AllRatings
  viewerRatings?: MemberRatings
}

export default function CategoryDeepDive({
  allRatings,
  viewerRatings,
}: CategoryDeepDiveProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {skillCategories.map((cat) => {
        const data = cat.skills.map((skill) => ({
          label: skill.label,
          value: teamAveragePerSkill(skill.id, allRatings),
          fullMark: 5,
        }))

        const overlay = viewerRatings
          ? cat.skills.map((skill) => ({
              label: skill.label,
              value:
                viewerRatings.ratings[skill.id] > 0
                  ? viewerRatings.ratings[skill.id]
                  : 0,
              fullMark: 5,
            }))
          : undefined

        return (
          <Card key={cat.id}>
            <CardHeader>
              <CardTitle>{cat.emoji + ' ' + cat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <RadarChart data={data} overlay={overlay} height={300} />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

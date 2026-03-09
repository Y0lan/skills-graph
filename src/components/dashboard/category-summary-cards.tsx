import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { skillCategories } from '@/data/skill-catalog'
import { categorySummary, type AllRatings } from '@/lib/ratings'

interface CategorySummaryCardsProps {
  allRatings: AllRatings
}

export default function CategorySummaryCards({ allRatings }: CategorySummaryCardsProps) {
  const summaries = skillCategories.map((cat) => categorySummary(cat, allRatings))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {summaries.map((summary) => (
        <Card key={summary.categoryId}>
          <CardHeader>
            <CardTitle>
              {summary.emoji} {summary.categoryLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg strength</span>
              <span className="font-medium">{summary.avgStrength.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coverage</span>
              <span className="font-medium">
                {summary.coverage} {summary.coverage === 1 ? 'member' : 'members'} at 3+
              </span>
            </div>
            {summary.topSkill && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Top skill</span>
                <span className="font-medium">
                  {summary.topSkill.label} ({summary.topSkill.avg.toFixed(1)})
                </span>
              </div>
            )}
            {summary.weakestSkill && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Weakest skill</span>
                <span className="font-medium">
                  {summary.weakestSkill.label} ({summary.weakestSkill.avg.toFixed(1)})
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

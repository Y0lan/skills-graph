import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import RadarChart from '@/components/radar-chart'
import { useCatalog } from '@/hooks/use-catalog'
import type { TeamCategoryAggregateResponse, TeamMemberAggregateResponse } from '@/lib/types'

interface CategoryDeepDiveProps {
  categories: TeamCategoryAggregateResponse[]
  members: TeamMemberAggregateResponse[]
  viewerSlug?: string
}

export default function CategoryDeepDive({
  categories,
  members,
  viewerSlug,
}: CategoryDeepDiveProps) {
  const { categories: skillCategories } = useCatalog()

  // Find the viewer member for overlay
  const viewer = viewerSlug
    ? members.find((m) => m.slug === viewerSlug && m.submittedAt !== null)
    : undefined

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {skillCategories.map((cat) => {
        const catAgg = categories.find((c) => c.categoryId === cat.id)

        const submittedMembers = members.filter((m) => m.submittedAt !== null)

        // Per-skill team averages from the API
        const teamData = cat.skills.map((skill) => ({
          label: skill.label,
          value: catAgg?.skillAverages?.[skill.id] ?? catAgg?.teamAvgRank ?? 0,
          fullMark: 5,
        }))

        // Viewer's actual per-skill ratings
        const overlayData = viewer
          ? cat.skills.map((skill) => ({
              label: skill.label,
              value: viewer.skillRatings?.[skill.id] ?? 0,
              fullMark: 5,
            }))
          : undefined

        return (
          <Card key={cat.id}>
            <CardHeader>
              <CardTitle>{cat.emoji + ' ' + cat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <RadarChart
                data={teamData}
                overlay={overlayData}
                height={300}
                primaryLabel="Moyenne équipe"
                overlayLabel="Vous"
              />
              {submittedMembers.length > 0 && (
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Min : {catAgg?.minRank.toFixed(1) ?? '—'}</span>
                  <span>Moy : {catAgg?.teamAvgRank.toFixed(1) ?? '—'}</span>
                  <span>Max : {catAgg?.maxRank.toFixed(1) ?? '—'}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

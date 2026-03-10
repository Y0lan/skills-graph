import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { teamOrder } from '@/data/team-roster'
import type { TeamMemberAggregateResponse } from '@/lib/types'
import RadarChart from '@/components/radar-chart'
import { useCatalog } from '@/hooks/use-catalog'

interface TeamMembersGridProps {
  members: TeamMemberAggregateResponse[]
}

export default function TeamMembersGrid({ members }: TeamMembersGridProps) {
  const { categories: skillCategories } = useCatalog()
  const sorted = [...members].sort((a, b) => {
    const aIndex = teamOrder.indexOf(a.team)
    const bIndex = teamOrder.indexOf(b.team)
    return aIndex - bIndex
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membres de l'équipe</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((member) => {
            const hasSubmitted = member.submittedAt !== null
            const radarData = hasSubmitted
              ? skillCategories.map((cat) => ({
                  label: cat.emoji,
                  value: member.categoryAverages[cat.id] ?? 0,
                  fullMark: 5,
                }))
              : []

            // Top 3 strengths with category metadata
            const strengthBadges = hasSubmitted
              ? member.topStrengths.slice(0, 3).map((s) => {
                  const catMeta = skillCategories.find((c) => c.id === s.categoryId)
                  return {
                    categoryId: s.categoryId,
                    emoji: catMeta?.emoji ?? '',
                    avg: s.avg,
                  }
                })
              : []

            return (
              <Card
                key={member.slug}
                className={`overflow-hidden transition-opacity ${!hasSubmitted ? 'opacity-40' : ''}`}
              >
                <CardContent className="flex flex-col items-center gap-2 pt-4">
                  {hasSubmitted && radarData.length > 0 && (
                    <RadarChart data={radarData} height={180} compact />
                  )}
                  <div className="text-center">
                    <a
                      href={`/dashboard/${member.slug}`}
                      className="font-semibold hover:text-primary hover:underline"
                    >
                      {member.name}
                    </a>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                    <p className="mt-0.5 text-xs font-medium text-primary/70">{member.team}</p>
                    {!hasSubmitted && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        En attente
                      </Badge>
                    )}
                    {hasSubmitted && (strengthBadges.length > 0 || member.topGaps.length > 0) && (
                      <div className="mt-2 flex flex-wrap justify-center gap-1">
                        {/* Strength badges (positive first) */}
                        {strengthBadges.map((s) => (
                          <Badge
                            key={`str-${s.categoryId}`}
                            className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs"
                          >
                            {s.emoji} {s.avg.toFixed(1)}
                          </Badge>
                        ))}
                        {/* Gap badges */}
                        {member.topGaps.slice(0, 3).map((g) => {
                          const gapMeta = skillCategories.find((c) => c.id === g.categoryId)
                          return (
                            <Badge
                              key={`gap-${g.categoryId}`}
                              className="bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs"
                            >
                              {gapMeta?.emoji ?? g.categoryId} -{g.gap.toFixed(1)}
                            </Badge>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { teamMembers, teamOrder } from '@/data/team-roster'
import MemberCard from '@/components/member-card'
import { type AllRatings } from '@/lib/ratings'

interface TeamMembersGridProps {
  allRatings: AllRatings
}

export default function TeamMembersGrid({ allRatings }: TeamMembersGridProps) {
  const sortedMembers = [...teamMembers].sort((a, b) => {
    const aIndex = teamOrder.indexOf(a.team)
    const bIndex = teamOrder.indexOf(b.team)
    return aIndex - bIndex
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Members</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedMembers.map((member) => (
            <MemberCard
              key={member.slug}
              name={member.name}
              role={member.role}
              team={member.team}
              ratings={allRatings[member.slug] ?? null}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

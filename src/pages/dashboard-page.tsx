import { useEffect, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { findMember } from '@/data/team-roster'
import { useAllRatings } from '@/hooks/use-ratings'
import type { AllRatings, MemberRatings } from '@/lib/ratings'

const PersonalOverview = lazy(() => import('@/components/dashboard/personal-overview'))
const TeamOverview = lazy(() => import('@/components/dashboard/team-overview'))
const CategorySummaryCards = lazy(() => import('@/components/dashboard/category-summary-cards'))
const CategoryDeepDive = lazy(() => import('@/components/dashboard/category-deep-dive'))
const SkillsGapTable = lazy(() => import('@/components/dashboard/skills-gap-table'))
const TeamMembersGrid = lazy(() => import('@/components/dashboard/team-members-grid'))

export default function DashboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const member = slug ? findMember(slug) : undefined
  const { data: allRatings, loading, fetchAll } = useAllRatings()

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  if (loading && !allRatings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    )
  }

  const ratings: AllRatings = allRatings ?? {}
  const hasData = Object.keys(ratings).length > 0
  const viewerRatings: MemberRatings | undefined =
    member && ratings[member.slug]
      ? (ratings[member.slug] as MemberRatings)
      : undefined

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
        <div>
          <h1 className="text-3xl font-bold">Team Skill Radar</h1>
          {member && (
            <p className="text-muted-foreground">
              Viewing as: {member.name} — {member.role}
            </p>
          )}
        </div>

        {!hasData ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <h2 className="text-xl font-semibold">No data yet</h2>
            <p className="mt-2 text-muted-foreground">
              Team members haven&apos;t submitted their skill assessments yet.
              Share their personal form links to get started!
            </p>
          </div>
        ) : (
          <Suspense
            fallback={
              <p className="text-center text-muted-foreground">Loading charts...</p>
            }
          >
            {/* Section 1: Personal Overview (only if slug provided and member submitted) */}
            {member && viewerRatings?.submittedAt && (
              <PersonalOverview
                memberName={member.name}
                memberRatings={viewerRatings}
              />
            )}

            {/* Section 2: Team Overview with optional viewer overlay */}
            <TeamOverview
              allRatings={ratings}
              viewerRatings={viewerRatings?.submittedAt ? viewerRatings : undefined}
            />

            {/* Section 3: Category Summary Cards */}
            <CategorySummaryCards allRatings={ratings} />

            {/* Section 4: Category Deep-dive Radars */}
            <CategoryDeepDive
              allRatings={ratings}
              viewerRatings={viewerRatings?.submittedAt ? viewerRatings : undefined}
            />

            {/* Section 5: Skills Gap Table */}
            <SkillsGapTable allRatings={ratings} />

            {/* Section 6: Team Members Grid */}
            <TeamMembersGrid allRatings={ratings} />
          </Suspense>
        )}
      </div>
    </div>
  )
}

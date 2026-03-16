import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { findMember } from '@/data/team-roster'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ClipboardEdit, ArrowRight } from 'lucide-react'
import AppHeader from '@/components/app-header'
import { authClient } from '@/lib/auth-client'
import type { MemberAggregateResponse, TeamAggregateResponse } from '@/lib/types'

const PersonalOverview = lazy(() => import('@/components/dashboard/personal-overview'))
const TeamOverview = lazy(() => import('@/components/dashboard/team-overview'))
const CategorySummaryCards = lazy(() => import('@/components/dashboard/category-summary-cards'))
const CategoryDeepDive = lazy(() => import('@/components/dashboard/category-deep-dive'))
const SkillsGapTable = lazy(() => import('@/components/dashboard/skills-gap-table'))
const TeamMembersGrid = lazy(() => import('@/components/dashboard/team-members-grid'))
const ExpertFinder = lazy(() => import('@/components/dashboard/expert-finder'))
const SkillHeatmap = lazy(() => import('@/components/skill-heatmap'))

function useMemberAggregate(slug: string | undefined) {
  const [data, setData] = useState<(MemberAggregateResponse & { hasRatings?: boolean }) | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchAggregate = useCallback(async (memberSlug: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/aggregates/${memberSlug}`)
      if (!res.ok) {
        setData(null)
        return
      }
      const json = await res.json()
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (slug) {
      fetchAggregate(slug)
    }
  }, [slug, fetchAggregate])

  return { data, loading }
}

function useTeamAggregate() {
  const [data, setData] = useState<TeamAggregateResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchAggregate = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/aggregates')
      if (!res.ok) {
        setData(null)
        return
      }
      const json = await res.json()
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAggregate()
  }, [fetchAggregate])

  return { data, loading }
}

const tabFallback = (
  <p className="text-center text-muted-foreground">Chargement des graphiques...</p>
)

export default function DashboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const member = slug ? findMember(slug) : undefined
  const { data: memberAggregate, loading: memberLoading } = useMemberAggregate(slug)
  const { data: teamAggregate, loading: teamLoading } = useTeamAggregate()
  const { data: session } = authClient.useSession()

  const loading = memberLoading || teamLoading

  if (loading && !teamAggregate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement du tableau de bord...</p>
      </div>
    )
  }

  const hasTeamData = teamAggregate && teamAggregate.submittedCount > 0
  const defaultTab = slug ? 'profil' : 'equipe'

  const isOwnProfile = session && member && session.user.slug === member.slug
  const isLoggedInButOtherProfile = session && member && session.user.slug !== member.slug

  let headerActions: React.ReactNode = undefined
  if (member) {
    if (isOwnProfile) {
      headerActions = (
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" nativeButton={false} render={<Link to={`/form/${member.slug}`} />}>
          <ClipboardEdit className="h-4 w-4" />
          Modifier
        </Button>
      )
    } else if (isLoggedInButOtherProfile) {
      headerActions = (
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5 opacity-50 pointer-events-none" disabled tabIndex={-1}>
                <ClipboardEdit className="h-4 w-4" />
                Modifier
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Impossible de modifier un profil autre que le sien
            </TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" nativeButton={false} render={<Link to={`/dashboard/${session.user.slug}`} />}>
            <ArrowRight className="h-4 w-4" />
            Mon profil
          </Button>
        </div>
      )
    } else {
      headerActions = (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5 opacity-50 pointer-events-none" disabled tabIndex={-1}>
              <ClipboardEdit className="h-4 w-4" />
              Modifier
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Connectez-vous pour modifier votre evaluation
          </TooltipContent>
        </Tooltip>
      )
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader headerActions={headerActions} />
      <div className="mx-auto max-w-7xl space-y-8 p-4 pt-14 sm:p-8 sm:pt-14">
        {/* Header — always visible, outside tabs */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Radar des Competences</h1>
          {member && (
            <p className="mt-1 text-base text-muted-foreground">
              <span className="font-medium text-foreground">{member.name}</span> — {member.role}
            </p>
          )}
        </div>

        {/* Empty state — outside tabs */}
        {!hasTeamData && !memberAggregate ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <h2 className="text-xl font-semibold">Aucune donnée</h2>
            <p className="mt-2 text-muted-foreground">
              Les membres de l'équipe n'ont pas encore soumis leurs évaluations.
              Partagez leurs liens personnels pour commencer !
            </p>
          </div>
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList variant="line" className="w-full sm:w-auto">
              {slug && (
                <TabsTrigger value="profil">{isOwnProfile ? 'Mon profil' : 'Profil'}</TabsTrigger>
              )}
              <TabsTrigger value="equipe">Équipe</TabsTrigger>
              <TabsTrigger value="cartographie">Cartographie</TabsTrigger>
              <TabsTrigger value="expert">Trouver un expert</TabsTrigger>
            </TabsList>

            {/* T015: Personal Overview tab */}
            {slug && (
              <TabsContent value="profil" className="space-y-8 pt-6">
                <Suspense fallback={tabFallback}>
                  {member && memberAggregate && (
                    <PersonalOverview aggregate={memberAggregate} />
                  )}
                </Suspense>
              </TabsContent>
            )}

            {/* T016: Team tab — all team sections */}
            <TabsContent value="equipe" className="space-y-8 pt-6">
              <Suspense fallback={tabFallback}>
                {teamAggregate && hasTeamData && (
                  <>
                    <TeamOverview
                      categories={teamAggregate.categories}
                      teamSize={teamAggregate.teamSize}
                      submittedCount={teamAggregate.submittedCount}
                    />
                    <CategorySummaryCards
                      categories={teamAggregate.categories}
                      categoryTargets={teamAggregate.categoryTargets}
                    />
                    <CategoryDeepDive
                      categories={teamAggregate.categories}
                      members={teamAggregate.members}
                      viewerSlug={member?.slug}
                    />
                    <SkillsGapTable
                      members={teamAggregate.members}
                      categories={teamAggregate.categories}
                    />
                    <TeamMembersGrid members={teamAggregate.members} />
                  </>
                )}
              </Suspense>
            </TabsContent>

            {/* Cartographie (heatmap) tab */}
            <TabsContent value="cartographie" className="space-y-8 pt-6">
              <Suspense fallback={tabFallback}>
                {teamAggregate && hasTeamData && (
                  <SkillHeatmap members={teamAggregate.members} />
                )}
              </Suspense>
            </TabsContent>

            {/* T017: Expert Finder tab */}
            <TabsContent value="expert" className="space-y-8 pt-6">
              <Suspense fallback={tabFallback}>
                {teamAggregate && hasTeamData && (
                  <ExpertFinder members={teamAggregate.members} />
                )}
              </Suspense>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

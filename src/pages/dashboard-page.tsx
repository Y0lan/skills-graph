import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { findMember } from '@/data/team-roster'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MessageSquare, ArrowLeft } from 'lucide-react'
import { POLE_LABELS } from '@/lib/constants'
import AppHeader from '@/components/app-header'
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary'
import { TeamPopover } from '@/components/team-popover'
import { authClient } from '@/lib/auth-client'
import MemberAvatar from '@/components/member-avatar'
import type { MemberAggregateResponse, TeamAggregateResponse } from '@/lib/types'

const PersonalOverview = lazy(() => import('@/components/dashboard/personal-overview'))
const TeamOverview = lazy(() => import('@/components/dashboard/team-overview'))
const CategorySummaryCards = lazy(() => import('@/components/dashboard/category-summary-cards'))
const CategoryDeepDive = lazy(() => import('@/components/dashboard/category-deep-dive'))
const SkillsGapTable = lazy(() => import('@/components/dashboard/skills-gap-table'))
const TeamMembersGrid = lazy(() => import('@/components/dashboard/team-members-grid'))
const ExpertFinder = lazy(() => import('@/components/dashboard/expert-finder'))
const SkillHeatmap = lazy(() => import('@/components/skill-heatmap'))
const ChatPanel = lazy(() => import('@/components/dashboard/chat-panel'))

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

function useTeamAggregate(pole?: string | null) {
  const [data, setData] = useState<TeamAggregateResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchAggregate = useCallback(async () => {
    setLoading(true)
    try {
      const url = pole ? `/api/aggregates?pole=${pole}` : '/api/aggregates'
      const res = await fetch(url)
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
  }, [pole])

  useEffect(() => {
    fetchAggregate()
  }, [fetchAggregate])

  return { data, loading, refetch: fetchAggregate }
}

const tabFallback = (
  <p className="text-center text-muted-foreground">Chargement des graphiques...</p>
)

export default function DashboardPage() {
  const { slug: urlSlug } = useParams<{ slug: string }>()
  const { data: session } = authClient.useSession()

  // Auto-resolve to logged-in user's slug when visiting /dashboard/ without a slug
  const slug = urlSlug || (session?.user?.slug as string | undefined) || undefined
  const member = slug ? findMember(slug) : undefined
  const { data: memberAggregate, loading: memberLoading } = useMemberAggregate(slug)
  const [poleFilter, setPoleFilter] = useState<string | null>(member?.pole ?? null)
  const { data: teamAggregate, loading: teamLoading } = useTeamAggregate(poleFilter)

  const [activeTab, setActiveTab] = useState(slug ? 'profil' : 'equipe')
  const [expertCategoryHint, setExpertCategoryHint] = useState<string | null>(null)
  const [prevSlug, setPrevSlug] = useState(slug)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [chatInitialInput, setChatInitialInput] = useState<string | undefined>(undefined)
  const [chatInputNonce, setChatInputNonce] = useState(0)
  const [contextSlugs, setContextSlugs] = useState<string[]>([])
  const [prevContextKey, setPrevContextKey] = useState(`${activeTab}:${slug ?? ''}`)

  // When slug changes (session loaded, or navigating to another member), switch to profil tab
  if (slug && slug !== prevSlug) {
    setPrevSlug(slug)
    setActiveTab('profil')
  }

  // Auto-context: synchronously derive from active tab + slug changes
  const contextKey = `${activeTab}:${slug ?? ''}`
  if (contextKey !== prevContextKey) {
    setPrevContextKey(contextKey)
    if (activeTab === 'profil' && slug) {
      setContextSlugs([slug])
    } else {
      setContextSlugs([])
    }
  }

  const handleCompareChange = useCallback((compareSlug: string | null) => {
    setContextSlugs(prev => {
      if (!slug) return prev
      const base = [slug]
      if (compareSlug) base.push(compareSlug)
      return [...new Set(base)]
    })
  }, [slug])

  const handleOpenChat = useCallback((prefill: string) => {
    setChatInitialInput(prefill)
    setChatInputNonce(n => n + 1)
    setChatOpen(true)
  }, [])

  const loading = memberLoading || teamLoading

  if (loading && !teamAggregate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement du tableau de bord...</p>
      </div>
    )
  }

  const hasTeamData = teamAggregate && teamAggregate.submittedCount > 0

  const isOwnProfile = session && member && session.user.slug === member.slug

  const headerActions = <TeamPopover currentSlug={slug} />

  return (
    <div className="min-h-screen bg-background">
      <AppHeader headerActions={headerActions} />
      <div className="mx-auto max-w-7xl space-y-8 p-4 pt-14 sm:p-8 sm:pt-14">
            {/* Header — always visible, outside tabs */}
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                Radar des Compétences
              </h1>
              {member && (
                <div className="mt-1 flex items-center gap-3">
                  {!isOwnProfile && session?.user?.slug && (
                    <Link
                      to={`/dashboard/${session.user.slug}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      <MemberAvatar slug={session.user.slug as string} name={findMember(session.user.slug as string)?.name ?? ''} size={16} className="shrink-0" />
                      <ArrowLeft className="h-3 w-3" />
                      Mon profil
                    </Link>
                  )}
                  <div className="flex items-center gap-2 text-base text-muted-foreground">
                    <MemberAvatar slug={member.slug} name={member.name} size={24} className="shrink-0" />
                    <p>
                      <span className="font-medium text-foreground">{member.name}</span> — {member.role}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Empty state — outside tabs */}
            {!hasTeamData && !memberAggregate ? (
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-12 text-center">
                <h2 className="text-xl font-semibold">Aucune donnée</h2>
                <p className="mt-2 text-muted-foreground">
                  Les membres de l'équipe n'ont pas encore soumis leurs évaluations.
                  Partagez leurs liens personnels pour commencer !
                </p>
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={(tab) => {
                setActiveTab(tab)
                if (tab !== 'expert') setExpertCategoryHint(null)
              }}>
                <TabsList variant="line" className="w-full sm:w-auto">
                  {slug && (
                    <TabsTrigger value="profil">{isOwnProfile ? 'Mon profil' : 'Profil'}</TabsTrigger>
                  )}
                  <TabsTrigger value="equipe">Équipe</TabsTrigger>
                  <TabsTrigger value="cartographie">Cartographie</TabsTrigger>
                  <TabsTrigger value="expert">Trouver un expert</TabsTrigger>
                </TabsList>

                {/* Personal Overview tab */}
                {slug && (
                  <TabsContent value="profil" className="space-y-8 pt-6">
                    <SectionErrorBoundary>
                      <Suspense fallback={tabFallback}>
                        {member && memberAggregate && (
                          <PersonalOverview
                            aggregate={memberAggregate}
                            teamMembers={teamAggregate?.members}
                            teamCategories={teamAggregate?.categories}
                            isOwnProfile={!!isOwnProfile}
                            poleFilterActive={!!poleFilter}
                            onFindExpert={(categoryId) => {
                              setExpertCategoryHint(categoryId)
                              setActiveTab('expert')
                            }}
                            onCompareChange={handleCompareChange}
                            onOpenChat={handleOpenChat}
                          />
                        )}
                      </Suspense>
                    </SectionErrorBoundary>
                  </TabsContent>
                )}

                {/* Team tab — all team sections */}
                <TabsContent value="equipe" className="space-y-8 pt-6">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Pôle :</span>
                    <Select value={poleFilter ?? 'all'} onValueChange={v => setPoleFilter(v === 'all' ? null : v)}>
                      <SelectTrigger className="w-[200px]" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les pôles</SelectItem>
                        {Object.entries(POLE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <SectionErrorBoundary>
                    <Suspense fallback={tabFallback}>
                      {teamAggregate && hasTeamData && (
                        <>
                          <TeamOverview
                            categories={teamAggregate.categories}
                            teamSize={teamAggregate.teamSize}
                            submittedCount={teamAggregate.submittedCount}
                          />
                          <TeamMembersGrid members={teamAggregate.members} />
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
                        </>
                      )}
                    </Suspense>
                  </SectionErrorBoundary>
                </TabsContent>

                {/* Cartographie (heatmap) tab */}
                <TabsContent value="cartographie" className="space-y-8 pt-6">
                  <SectionErrorBoundary>
                    <Suspense fallback={tabFallback}>
                      {teamAggregate && hasTeamData && (
                        <SkillHeatmap members={teamAggregate.members} />
                      )}
                    </Suspense>
                  </SectionErrorBoundary>
                </TabsContent>

                {/* Expert Finder tab */}
                <TabsContent value="expert" className="space-y-8 pt-6">
                  <SectionErrorBoundary>
                    <Suspense fallback={tabFallback}>
                      {teamAggregate && hasTeamData && (
                        <ExpertFinder members={teamAggregate.members} initialCategoryId={expertCategoryHint} />
                      )}
                    </Suspense>
                  </SectionErrorBoundary>
                </TabsContent>
              </Tabs>
            )}
      </div>

      {/* Floating chat window — authenticated only */}
      {session && (
        <Suspense fallback={null}>
          {chatOpen ? (
            <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[400px] flex-col rounded-xl border border-primary/20 bg-background shadow-2xl ring-1 ring-primary/10">
              <ChatPanel
                contextSlugs={contextSlugs}
                onContextChange={setContextSlugs}
                teamMembers={teamAggregate?.members ?? []}
                onClose={() => { setChatOpen(false); setChatInitialInput(undefined) }}
                messages={chatMessages}
                onMessagesChange={setChatMessages}
                initialInput={chatInitialInput}
                initialInputNonce={chatInputNonce}
              />
            </div>
          ) : (
            <button
              onClick={() => setChatOpen(true)}
              className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              Assistant IA
            </button>
          )}
        </Suspense>
      )}
    </div>
  )
}

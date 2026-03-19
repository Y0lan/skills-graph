import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Sparkles, MessageSquare, TrendingUp, ArrowUp, ArrowRight, ArrowDown } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import VisxRadarChart from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import { useSkillHistory } from '@/hooks/use-skill-history'
import { shortLabel, cn, daysSince, freshnessColor } from '@/lib/utils'
import type { MemberAggregateResponse, TeamMemberAggregateResponse, TeamCategoryAggregateResponse, SkillChange } from '@/lib/types'
import SkillDetailAccordion from '@/components/dashboard/skill-detail-accordion'
import MentorSuggestions from '@/components/dashboard/mentor-suggestions'

interface PersonalOverviewProps {
  aggregate: MemberAggregateResponse & { hasRatings?: boolean }
  teamMembers?: TeamMemberAggregateResponse[]
  teamCategories?: TeamCategoryAggregateResponse[]
  isOwnProfile?: boolean
  onFindExpert?: (categoryId: string) => void
  onCompareChange?: (slug: string | null) => void
  onOpenChat?: (prefill: string) => void
}

export default function PersonalOverview({ aggregate, teamMembers, teamCategories, isOwnProfile = true, onFindExpert, onCompareChange, onOpenChat }: PersonalOverviewProps) {
  const { memberId, memberName, submittedAt, categories, topGaps, topStrengths } = aggregate
  const hasRatings = aggregate.hasRatings ?? categories.some((c) => c.avgRank > 0)
  const [view, setView] = useChartView()
  const [compareSlug, setCompareSlug] = useState<string | null>(null)
  const [profileSummary, setProfileSummary] = useState<string | null>(aggregate.profileSummary)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [comparisonSummary, setComparisonSummary] = useState<string | null>(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [compareAggregate, setCompareAggregate] = useState<MemberAggregateResponse | null>(null)

  // Client-side cache for comparison summaries (survives re-renders, cleared on profile change)
  const comparisonCache = useRef<Map<string, string>>(new Map())

  // Reset state when profile changes
  const [prevMemberId, setPrevMemberId] = useState(memberId)
  if (memberId !== prevMemberId) {
    setPrevMemberId(memberId)
    setCompareSlug(null)
    onCompareChange?.(null)
    setComparisonSummary(null)
    setCompareAggregate(null)
    setProfileSummary(aggregate.profileSummary)
    comparisonCache.current.clear()
  }

  // Feature #4: Freshness counter
  const { changes } = useSkillHistory(memberId)
  const lastUpdateDate = useMemo(() => {
    if (changes.length === 0) return submittedAt ?? null
    return changes.reduce((latest, c) =>
      c.changedAt > latest ? c.changedAt : latest, changes[0].changedAt)
  }, [changes, submittedAt])
  const freshnessDays = lastUpdateDate ? daysSince(lastUpdateDate) : null

  // Feature #11: Progression summary data
  const progressionData = useMemo(() => {
    if (changes.length === 0) return null

    // Compute initial levels (first change per skill = old level or first recorded level)
    const firstLevelBySkill: Record<string, number> = {}
    const currentLevelBySkill: Record<string, number> = {}
    for (const c of changes) {
      if (!(c.skillId in firstLevelBySkill)) {
        // First entry for this skill is the initial assessment (oldLevel=0, newLevel=X)
        firstLevelBySkill[c.skillId] = c.oldLevel === 0 ? c.newLevel : c.oldLevel
      }
      currentLevelBySkill[c.skillId] = c.newLevel
    }

    const initialLevels = Object.values(firstLevelBySkill)
    const currentLevels = Object.values(currentLevelBySkill)
    if (initialLevels.length === 0) return null

    const initialAvg = initialLevels.reduce((a, b) => a + b, 0) / initialLevels.length
    const currentAvg = currentLevels.reduce((a, b) => a + b, 0) / currentLevels.length
    const delta = Math.round((currentAvg - initialAvg) * 10) / 10

    // Count skills that have been updated (more than 1 change entry)
    const skillChangeCounts: Record<string, number> = {}
    for (const c of changes) {
      skillChangeCounts[c.skillId] = (skillChangeCounts[c.skillId] ?? 0) + 1
    }
    const updatedSkillCount = Object.values(skillChangeCounts).filter(n => n > 1).length

    // Build sparkline: running average over time
    const latestLevel: Record<string, number> = {}
    const points: { level: number }[] = []
    for (const c of changes) {
      latestLevel[c.skillId] = c.newLevel
      const levels = Object.values(latestLevel)
      const avg = levels.reduce((a, b) => a + b, 0) / levels.length
      points.push({ level: Math.round(avg * 10) / 10 })
    }

    // Get first change date for "depuis" label
    const firstDate = changes[0].changedAt.split('T')[0]
    const firstMonth = new Date(firstDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    return { currentAvg, delta, updatedSkillCount, sparklineData: points.slice(-10), firstMonth }
  }, [changes])

  const handleGenerateSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const res = await fetch(`/api/ratings/${memberId}/generate-summary`, { method: 'POST', credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        if (data.profileSummary) setProfileSummary(data.profileSummary)
      }
    } catch { /* silent */ }
    setSummaryLoading(false)
  }, [memberId])

  const handleCompare = useCallback(async () => {
    if (!compareSlug) return

    // Check client cache first
    const cacheKey = [memberId, compareSlug].sort().join(':')
    const cached = comparisonCache.current.get(cacheKey)
    if (cached) {
      setComparisonSummary(cached)
      return
    }

    setComparisonLoading(true)
    try {
      const res = await fetch('/api/aggregates/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slugA: memberId, slugB: compareSlug }),
      })
      if (res.ok) {
        const data = await res.json()
        const summary = data.summary ?? null
        setComparisonSummary(summary)
        if (summary) comparisonCache.current.set(cacheKey, summary)
      }
    } catch { /* silent */ }
    setComparisonLoading(false)
  }, [memberId, compareSlug])

  // Fetch compared member's full aggregate when compareSlug changes
  useEffect(() => {
    if (!compareSlug) {
      setCompareAggregate(null)
      return
    }
    let cancelled = false
    fetch(`/api/aggregates/${compareSlug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setCompareAggregate(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [compareSlug])

  // Empty state: no ratings at all
  if (!hasRatings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{isOwnProfile ? 'Mon profil' : memberName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-12 text-center">
            {isOwnProfile ? (
              <>
                <p className="text-lg font-semibold">Aucune évaluation soumise</p>
                <p className="mt-2 text-muted-foreground">
                  Commencez votre auto-évaluation pour voir votre radar personnel.
                </p>
                <Link
                  to={`/form/${memberId}`}
                  className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Démarrer l'évaluation
                </Link>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">Aucune évaluation</p>
                <p className="mt-2 text-muted-foreground">
                  Ce membre n'a pas encore soumis d'évaluation.
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const isDraft = !submittedAt

  const data = categories.map((cat) => ({
    label: shortLabel(cat.categoryLabel),
    value: cat.avgRank,
    fullMark: 5,
  }))

  const compareTarget = compareSlug
    ? teamMembers?.find(m => m.slug === compareSlug)
    : null

  const overlayData = categories.map((cat) => ({
    label: shortLabel(cat.categoryLabel),
    value: compareTarget
      ? (compareTarget.categoryAverages[cat.categoryId] ?? 0)
      : cat.teamAvgRank,
    fullMark: 5,
  }))

  const overlayLabel = compareTarget ? compareTarget.name : 'Moyenne équipe'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>{isOwnProfile ? 'Mon profil' : memberName}</CardTitle>
            {isDraft && (
              <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                Brouillon
              </Badge>
            )}
            {/* Feature #4: Freshness counter */}
            {freshnessDays !== null && (
              <span className={cn('text-xs', freshnessColor(freshnessDays))}>
                Mis à jour il y a {freshnessDays}j
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {teamMembers && teamMembers.length > 0 && (
              <>
                <Select value={compareSlug ?? ''} onValueChange={(v) => {
                  const newSlug = v || null
                  if (newSlug === compareSlug) return // Same selection — skip reset
                  setCompareSlug(newSlug)
                  onCompareChange?.(newSlug)
                  setCompareAggregate(null)
                  // Restore from cache if available
                  if (newSlug) {
                    const key = [memberId, newSlug].sort().join(':')
                    setComparisonSummary(comparisonCache.current.get(key) ?? null)
                  } else {
                    setComparisonSummary(null)
                  }
                }}>
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Comparer avec : Moyenne équipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Moyenne équipe</SelectItem>
                    {teamMembers.filter(m => m.slug !== memberId && m.submittedAt).map(m => (
                      <SelectItem key={m.slug} value={m.slug}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {compareSlug && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCompare}
                    disabled={comparisonLoading}
                    className="gap-1.5 shrink-0"
                  >
                    {comparisonLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                    Comparer avec l'IA
                  </Button>
                )}
              </>
            )}
            <ChartViewToggle view={view} onChange={setView} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Feature #11: Progression summary card */}
        {progressionData ? (
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Progression
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold tabular-nums">{progressionData.currentAvg.toFixed(1)}/5</span>
              {progressionData.delta > 0.05 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <ArrowUp className="h-3 w-3" />
                  +{progressionData.delta.toFixed(1)} depuis {progressionData.firstMonth}
                </span>
              ) : progressionData.delta < -0.05 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <ArrowDown className="h-3 w-3" />
                  {progressionData.delta.toFixed(1)} depuis {progressionData.firstMonth}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <ArrowRight className="h-3 w-3" />
                  Stable depuis {progressionData.firstMonth}
                </span>
              )}
              {progressionData.sparklineData.length >= 2 && (
                <div className="inline-block align-middle ml-auto" style={{ width: 80, height: 24 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={progressionData.sparklineData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                      <Line type="monotone" dataKey="level" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            {progressionData.updatedSkillCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {progressionData.updatedSkillCount} compétence{progressionData.updatedSkillCount > 1 ? 's' : ''} mise{progressionData.updatedSkillCount > 1 ? 's' : ''} à jour
              </p>
            )}
          </div>
        ) : hasRatings ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Pas encore de progression — mettez à jour vos compétences pour voir l'évolution
            </div>
          </div>
        ) : null}

        {/* Summary block: pill badges + AI narrative — hidden when side-by-side is active */}
        {!compareSlug && ((topStrengths && topStrengths.length > 0) || topGaps.length > 0) && (
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {topStrengths.map(s => (
                <Badge key={s.categoryId} className="bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/30">
                  {shortLabel(s.categoryLabel)}
                </Badge>
              ))}
              {topGaps.map(g => (
                <Badge key={g.categoryId} className="bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30">
                  {shortLabel(g.categoryLabel)}
                </Badge>
              ))}
            </div>
            {profileSummary ? (
              <p className="text-muted-foreground italic mt-3">{profileSummary}</p>
            ) : isOwnProfile && submittedAt ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
                disabled={summaryLoading}
                className="mt-3 gap-1.5"
              >
                {summaryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Générer ma synthèse
              </Button>
            ) : isOwnProfile && !submittedAt ? (
              <p className="text-muted-foreground text-xs mt-3">
                Terminez votre évaluation pour générer une synthèse.{' '}
                <Link to={`/form/${memberId}`} className="text-primary hover:underline">Reprendre →</Link>
              </p>
            ) : null}
          </div>
        )}

        {/* Side-by-side summaries + AI comparison — replaces main summary when comparing */}
        {compareSlug && compareTarget && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Current profile */}
              <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{isOwnProfile ? 'Mon profil' : memberName}</p>
                {((topStrengths && topStrengths.length > 0) || topGaps.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {topStrengths.map(s => (
                      <Badge key={s.categoryId} className="bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/30 text-[10px] px-1.5 h-4">
                        {shortLabel(s.categoryLabel)}
                      </Badge>
                    ))}
                    {topGaps.map(g => (
                      <Badge key={g.categoryId} className="bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30 text-[10px] px-1.5 h-4">
                        {shortLabel(g.categoryLabel)}
                      </Badge>
                    ))}
                  </div>
                )}
                {profileSummary ? (
                  <p className="text-muted-foreground italic text-xs">{profileSummary}</p>
                ) : (
                  <p className="text-muted-foreground/50 text-xs">Pas de synthèse disponible</p>
                )}
              </div>
              {/* Compared profile */}
              <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{compareTarget.name}</p>
                {compareAggregate && ((compareAggregate.topStrengths?.length > 0) || (compareAggregate.topGaps?.length > 0)) && (
                  <div className="flex flex-wrap gap-1">
                    {compareAggregate.topStrengths.map(s => (
                      <Badge key={s.categoryId} className="bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/30 text-[10px] px-1.5 h-4">
                        {shortLabel(s.categoryLabel)}
                      </Badge>
                    ))}
                    {compareAggregate.topGaps.map(g => (
                      <Badge key={g.categoryId} className="bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30 text-[10px] px-1.5 h-4">
                        {shortLabel(g.categoryLabel)}
                      </Badge>
                    ))}
                  </div>
                )}
                {compareAggregate?.profileSummary ? (
                  <p className="text-muted-foreground italic text-xs">{compareAggregate.profileSummary}</p>
                ) : (
                  <p className="text-muted-foreground/50 text-xs">Pas de synthèse disponible</p>
                )}
              </div>
            </div>
            {/* AI comparison narrative */}
            {comparisonSummary && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3" />
                  Analyse comparative IA
                </p>
                <p className="text-muted-foreground italic">{comparisonSummary}</p>
              </div>
            )}
          </div>
        )}

        {view === 'radar' ? (
          <VisxRadarChart
            data={data}
            overlay={overlayData}
            height={400}
            primaryLabel={isOwnProfile ? 'Moi' : memberName}
            overlayLabel={overlayLabel}
            showOverlayToggle
            showExport
          />
        ) : (
          <BarComparisonChart
            data={data}
            overlay={overlayData}
            primaryLabel={isOwnProfile ? 'Moi' : memberName}
            overlayLabel={overlayLabel}
          />
        )}

        {topGaps.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Principaux écarts vs cible
            </h3>
            <div className="space-y-2">
              {topGaps.map((gap) => (
                <div
                  key={gap.categoryId}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-medium">{gap.categoryLabel}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Actuel : <span className="font-semibold tabular-nums">{gap.avgRank.toFixed(1)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Cible : <span className="font-semibold tabular-nums">{gap.targetRank}</span>
                    </span>
                    <span className="font-semibold tabular-nums text-red-500">
                      -{gap.gap.toFixed(1)}
                    </span>
                    {onFindExpert && (
                      <button
                        onClick={() => onFindExpert(gap.categoryId)}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Trouver un expert →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasRatings && teamMembers && teamCategories && (
          <SkillDetailAccordion
            memberId={memberId}
            categories={categories}
            teamMembers={teamMembers}
            teamCategories={teamCategories}
            comparedMember={compareSlug && compareTarget ? {
              slug: compareSlug,
              name: compareTarget.name,
              skillRatings: compareTarget.skillRatings,
            } : null}
            isOwnProfile={isOwnProfile}
            onOpenChat={onOpenChat}
          />
        )}

        {hasRatings && topGaps.length > 0 && teamMembers && (
          <MentorSuggestions
            memberId={memberId}
            categories={categories}
            teamMembers={teamMembers}
          />
        )}

        {isDraft && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            {isOwnProfile ? (
              <>
                Votre évaluation n'a pas encore été soumise.{' '}
                <Link
                  to={`/form/${memberId}`}
                  className="font-medium underline hover:no-underline"
                >
                  Reprendre l'évaluation
                </Link>
              </>
            ) : (
              "Cette évaluation n'a pas encore été soumise."
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

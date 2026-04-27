import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Sparkles, MessageSquare, ArrowUp, ArrowDown, Trophy, Target } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from '@/components/ui/select'
import VisxRadarChart from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import { useSkillHistory } from '@/hooks/use-skill-history'
import { shortLabel, cn, daysSince, freshnessColor, humanFreshness } from '@/lib/utils'
import { POLE_LABELS } from '@/lib/constants'
import { usePoleLayout, usePoleMappings } from '@/lib/pole-segments'
import type { MemberAggregateResponse, TeamMemberAggregateResponse, TeamCategoryAggregateResponse } from '@/lib/types'
import MemberAvatar from '@/components/member-avatar'
import SkillDetailAccordion from '@/components/dashboard/skill-detail-accordion'
import MentorSuggestions from '@/components/dashboard/mentor-suggestions'

const COMPARE_AVERAGE = '__average__'

interface PersonalOverviewProps {
  aggregate: MemberAggregateResponse & { hasRatings?: boolean }
  teamMembers?: TeamMemberAggregateResponse[]
  teamCategories?: TeamCategoryAggregateResponse[]
  isOwnProfile?: boolean
  poleFilterActive?: boolean
  onFindExpert?: (categoryId: string) => void
  onCompareChange?: (slug: string | null) => void
  onOpenChat?: (prefill: string) => void
}

export default function PersonalOverview({ aggregate, teamMembers, teamCategories, isOwnProfile = true, poleFilterActive, onFindExpert, onCompareChange, onOpenChat }: PersonalOverviewProps) {
  const { memberId, memberName, submittedAt, categories, topGaps, topStrengths } = aggregate
  const hasRatings = aggregate.hasRatings ?? categories.some((c) => c.avgRank > 0)
  const [view, setView] = useChartView()
  const [compareSlug, setCompareSlug] = useState<string | null>(null)
  const [profileSummary, setProfileSummary] = useState<string | null>(aggregate.profileSummary)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [comparisonSummary, setComparisonSummary] = useState<string | null>(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [compareAggregate, setCompareAggregate] = useState<MemberAggregateResponse | null>(null)
  const currentMemberPole = teamMembers?.find(m => m.slug === memberId)?.pole ?? null

  const comparableMembers = useMemo(() => {
    if (!teamMembers) return []
    return teamMembers.filter(m => m.slug !== memberId && m.submittedAt)
  }, [teamMembers, memberId])

  // Group comparable members by pole for the dropdown
  const membersByPole = useMemo(() => {
    const groups: { pole: string | null; label: string; members: typeof comparableMembers }[] = []
    const byPole = new Map<string | null, typeof comparableMembers>()
    for (const m of comparableMembers) {
      const key = m.pole
      if (!byPole.has(key)) byPole.set(key, [])
      byPole.get(key)!.push(m)
    }
    // Own pole first
    if (currentMemberPole && byPole.has(currentMemberPole)) {
      groups.push({ pole: currentMemberPole, label: POLE_LABELS[currentMemberPole] ?? currentMemberPole, members: byPole.get(currentMemberPole)! })
    }
    // Other poles alphabetically
    const otherPoles = [...byPole.keys()]
      .filter(p => p !== null && p !== currentMemberPole)
      .sort((a, b) => (POLE_LABELS[a!] ?? a!).localeCompare(POLE_LABELS[b!] ?? b!))
    for (const p of otherPoles) {
      groups.push({ pole: p, label: POLE_LABELS[p!] ?? p!, members: byPole.get(p)! })
    }
    // Null-pole members
    if (byPole.has(null)) {
      groups.push({ pole: null, label: 'Direction / Transverse', members: byPole.get(null)! })
    }
    return groups.filter(g => g.members.length > 0)
  }, [comparableMembers, currentMemberPole])

  // Client-side cache for comparison summaries (survives re-renders, cleared on profile change)
  const comparisonCache = useRef<Map<string, string>>(new Map())

  // Radar focus state — declared here (not deep in the file) so the
  // member-change reset below can reset it together with the other
  // per-member state. Default: focus on home pôle when one is known
  // (falls back to 'all' if not). The list of axes degrades gracefully
  // until pole mappings load.
  const initialRadarScope: 'pole' | 'all' = currentMemberPole ? 'pole' : 'all'
  const [radarScope, setRadarScope] = useState<'pole' | 'all'>(initialRadarScope)

  // Reset state when profile changes
  const [prevMemberId, setPrevMemberId] = useState(memberId)
  if (memberId !== prevMemberId) {
    setPrevMemberId(memberId)
    setCompareSlug(null)
    onCompareChange?.(null)
    setComparisonSummary(null)
    setCompareAggregate(null)
    setProfileSummary(aggregate.profileSummary)
    setRadarScope(currentMemberPole ? 'pole' : 'all')
    comparisonCache.current.clear() // eslint-disable-line react-hooks/refs
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

  // Task 8: Compute shared categories when comparing
  const sharedCategoryIds = useMemo(() => {
    if (!compareSlug || !compareAggregate || !aggregate) return null
    const myRated = new Set(
      aggregate.categories
        .filter(c => c.avgRank > 0)
        .map(c => c.categoryId)
    )
    const theirRated = new Set(
      compareAggregate.categories
        .filter(c => c.avgRank > 0)
        .map(c => c.categoryId)
    )
    return [...myRated].filter(id => theirRated.has(id))
  }, [compareSlug, aggregate, compareAggregate])

  // Detect cross-pole comparison
  const isCrossPole = compareSlug &&
    teamMembers?.find(m => m.slug === compareSlug)?.pole !==
    teamMembers?.find(m => m.slug === memberId)?.pole

  // Radar focus: 'pole' (default — only the user's home-pôle categories,
  // 5-6 axes, legible) vs 'all' (the full 18-axis view, on demand).
  // Members with no home pôle (e.g. transverse / direction) skip the
  // restriction since there's nothing meaningful to focus on.
  //
  // Init key bug: pole mappings are fetched async, so we can't gate the
  // initial state on them — that'd default everyone to 'all' and the user
  // would have to manually click "Recentrer". Instead, default to 'pole'
  // whenever a member HAS a home pôle (a synchronous check), and let
  // displayCategoriesUnsorted gracefully degrade to all categories until
  // the mapping arrives a moment later.
  const poleMappings = usePoleMappings()
  const homePoleCategoryIds = useMemo(() => {
    if (!currentMemberPole || !poleMappings) return null
    const ids = poleMappings[currentMemberPole] ?? []
    return ids.length > 0 ? new Set(ids) : null
  }, [currentMemberPole, poleMappings])
  const hasHomePole = currentMemberPole !== null

  // Categories the radar will display, sorted by pole so each pole's
  // exclusive categories cluster together (matches the Équipe tab pattern).
  // Hooks must run unconditionally — they fall back to the original order
  // if pole mappings haven't loaded yet, and are no-ops in the empty-state
  // path below.
  const displayCategoriesUnsorted = useMemo(() => {
    // 'all' mode is the user's explicit ask to see every category, so it
    // must override BOTH the pôle restriction AND the compare-mode shared
    // filter. Otherwise the toggle silently no-ops when comparing with
    // someone from the same pôle (pole ⊂ shared → identical chart).
    // The "Comparaison sur :" status line below the chart still clarifies
    // which subset is meaningfully compared, and the overlay polygon
    // shows 0 for categories the other person didn't rate.
    if (radarScope === 'all') return categories
    const base = sharedCategoryIds
      ? categories.filter(cat => sharedCategoryIds.includes(cat.categoryId))
      : categories
    if (!homePoleCategoryIds) return base
    const focused = base.filter(c => homePoleCategoryIds.has(c.categoryId))
    return focused.length > 0 ? focused : base
  }, [sharedCategoryIds, categories, radarScope, homePoleCategoryIds])
  const { order: poleOrder, segments } = usePoleLayout(
    displayCategoriesUnsorted.map(c => c.categoryId),
  )
  const displayCategories = useMemo(() => {
    const byId = new Map(displayCategoriesUnsorted.map(c => [c.categoryId, c]))
    return poleOrder
      .map(id => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
  }, [displayCategoriesUnsorted, poleOrder])

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

  // Header stats
  const ratedCategories = categories.filter(c => c.avgRank > 0)
  const overallAvg = ratedCategories.length > 0
    ? Math.round((ratedCategories.reduce((sum, c) => sum + c.avgRank, 0) / ratedCategories.length) * 10) / 10
    : 0
  const totalRated = categories.reduce((sum, c) => sum + c.ratedCount, 0)
  const totalSkills = categories.reduce((sum, c) => sum + c.totalCount, 0)
  const memberRole = teamMembers?.find(m => m.slug === memberId)?.role ?? aggregate.role

  const compareTarget = compareSlug
    ? teamMembers?.find(m => m.slug === compareSlug)
    : null

  const data = displayCategories.map((cat) => ({
    label: shortLabel(cat.categoryLabel),
    value: cat.avgRank,
    fullMark: 5,
  }))

  const overlayData = displayCategories.map((cat) => ({
    label: shortLabel(cat.categoryLabel),
    value: compareTarget
      ? (compareTarget.categoryAverages[cat.categoryId] ?? 0)
      : cat.teamAvgRank,
    fullMark: 5,
  }))

  const overlayLabel = compareTarget ? compareTarget.name : (poleFilterActive ? 'Moyenne de mon pôle' : 'Moyenne globale')

  // Filter strengths/gaps to shared categories when comparing
  const displayStrengths = sharedCategoryIds
    ? topStrengths.filter(s => sharedCategoryIds.includes(s.categoryId))
    : topStrengths
  const displayGaps = sharedCategoryIds
    ? topGaps.filter(g => sharedCategoryIds.includes(g.categoryId))
    : topGaps

  return (
    <Card>
      <CardHeader className="space-y-3">
        {/* Row 1: Avatar + name + role + controls */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <MemberAvatar slug={memberId} name={memberName} size={40} className="shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{isOwnProfile ? 'Mon profil' : memberName}</CardTitle>
                {isDraft && (
                  <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    Brouillon
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{memberRole}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {teamMembers && teamMembers.length > 0 && (
              <>
                <Select value={compareSlug ?? COMPARE_AVERAGE} onValueChange={(v) => {
                  const newSlug = v === COMPARE_AVERAGE ? null : v
                  if (newSlug === compareSlug) return
                  setCompareSlug(newSlug)
                  onCompareChange?.(newSlug)
                  setCompareAggregate(null)
                  if (newSlug) {
                    const key = [memberId, newSlug].sort().join(':')
                    setComparisonSummary(comparisonCache.current.get(key) ?? null)
                  } else {
                    setComparisonSummary(null)
                  }
                }}>
                  <SelectTrigger size="sm" className="min-w-[180px]">
                    <span className="flex flex-1 text-left truncate">
                      {compareSlug
                        ? (teamMembers?.find(m => m.slug === compareSlug)?.name ?? compareSlug)
                        : (poleFilterActive ? 'Moyenne de mon pôle' : 'Moyenne globale')
                      }
                    </span>
                  </SelectTrigger>
                  <SelectContent className="min-w-[220px]">
                    <SelectItem value={COMPARE_AVERAGE}>{poleFilterActive ? 'Moyenne de mon pôle' : 'Moyenne globale'}</SelectItem>
                    {membersByPole.map(group => (
                      <SelectGroup key={group.pole ?? '__null'}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.members.map(m => (
                          <SelectItem key={m.slug} value={m.slug}>{m.name}</SelectItem>
                        ))}
                      </SelectGroup>
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
        {/* Row 2: Key stats at a glance */}
        <div className="flex items-center gap-4 text-sm">
          <span className="font-bold tabular-nums text-lg">{overallAvg.toFixed(1)}<span className="text-muted-foreground font-normal text-sm">/5</span></span>
          {progressionData && progressionData.delta > 0.05 ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ArrowUp className="h-3 w-3" />+{progressionData.delta.toFixed(1)}
            </span>
          ) : progressionData && progressionData.delta < -0.05 ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <ArrowDown className="h-3 w-3" />{progressionData.delta.toFixed(1)}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">{totalRated}/{totalSkills} compétences évaluées</span>
          {freshnessDays !== null && (
            <span className={cn('text-xs', freshnessColor(freshnessDays))}>
              {humanFreshness(freshnessDays)}
            </span>
          )}
          {progressionData?.sparklineData && progressionData.sparklineData.length >= 2 && (
            <div className="inline-block align-middle ml-auto" style={{ width: 80, height: 24 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressionData.sparklineData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <Line type="monotone" dataKey="level" stroke="var(--color-primary)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Forces / Écarts side-by-side cards — primary signal of "where am I?
            and what should I work on?". Replaces the old chip-soup summary
            block. The AI synthèse and form-completion CTA live below. */}
        {!compareSlug && ((displayStrengths && displayStrengths.length > 0) || displayGaps.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/15 dark:border-emerald-900/50 p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Mes forces</h3>
              </div>
              {displayStrengths.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Pas encore de forces identifiées — complétez plus d'évaluations.</p>
              ) : (
                <ul className="space-y-1.5">
                  {displayStrengths.slice(0, 5).map(s => (
                    <li key={s.categoryId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground/90">{s.categoryLabel}</span>
                      <span className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                        {s.avgRank.toFixed(1)}
                        <span className="text-[10px] text-muted-foreground ml-0.5">/5</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-red-500/30 bg-red-50/40 dark:bg-red-950/15 dark:border-red-900/50 p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">Mes écarts prioritaires</h3>
              </div>
              {displayGaps.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Pas d'écart majeur vs cible. 🎉</p>
              ) : (
                <ul className="space-y-1.5">
                  {displayGaps.slice(0, 5).map(g => (
                    <li key={g.categoryId} className="flex items-center justify-between gap-2 text-sm">
                      <span
                        className="truncate text-foreground/90"
                        title={`Actuel ${g.avgRank.toFixed(1)} · Cible ${g.targetRank}`}
                      >
                        {g.categoryLabel}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="tabular-nums font-semibold text-red-700 dark:text-red-400"
                          title={`Actuel ${g.avgRank.toFixed(1)} · Cible ${g.targetRank}`}
                        >
                          -{g.gap.toFixed(1)}
                        </span>
                        {onFindExpert && (
                          <button
                            onClick={() => onFindExpert(g.categoryId)}
                            className="text-xs text-primary hover:underline whitespace-nowrap font-medium"
                            aria-label={`Trouver un expert pour ${g.categoryLabel}`}
                          >
                            expert →
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* AI synthèse / completion CTA — separated from the cards above so the
            forces/gaps signal stays uncluttered. */}
        {!compareSlug && (profileSummary || (isOwnProfile && (submittedAt || !submittedAt))) && (
          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
            {profileSummary ? (
              <p className="text-muted-foreground italic">{profileSummary}</p>
            ) : isOwnProfile && submittedAt ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
                disabled={summaryLoading}
                className="gap-1.5"
              >
                {summaryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Générer ma synthèse
              </Button>
            ) : isOwnProfile && !submittedAt ? (
              <p className="text-muted-foreground text-xs">
                Terminez votre évaluation pour générer une synthèse.{' '}
                <Link to={`/form/${memberId}`} className="text-primary hover:underline">Reprendre →</Link>
              </p>
            ) : null}
          </div>
        )}

        {/* Side-by-side summaries + AI comparison — replaces main summary when comparing */}
        {compareSlug && compareTarget && (
          <div className="space-y-3">
            {/* Cross-pole banner */}
            {isCrossPole && sharedCategoryIds && (
              <div className="rounded-lg border-2 border-dashed border-primary/40 bg-gradient-to-r from-primary/5 to-primary/10 px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">Comparaison inter-pôles</span>
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                    {POLE_LABELS[currentMemberPole!] ?? currentMemberPole}
                  </Badge>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                    {POLE_LABELS[teamMembers?.find(m => m.slug === compareSlug)?.pole ?? ''] ?? 'Autre pôle'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {sharedCategoryIds.length} catégorie{sharedCategoryIds.length > 1 ? 's' : ''} commune{sharedCategoryIds.length > 1 ? 's' : ''} sur {categories.length}.
                  Les catégories spécifiques à chaque pôle sont exclues.
                </p>
                {categories.filter(c => !sharedCategoryIds.includes(c.categoryId) && c.avgRank > 0).length > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">
                      Catégories exclues ({categories.filter(c => !sharedCategoryIds.includes(c.categoryId) && c.avgRank > 0).length})
                    </summary>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {categories
                        .filter(c => !sharedCategoryIds.includes(c.categoryId) && c.avgRank > 0)
                        .map(c => (
                          <Badge key={c.categoryId} variant="outline" className="text-[10px] opacity-60">
                            {shortLabel(c.categoryLabel)}
                          </Badge>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Current profile */}
              <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{isOwnProfile ? 'Mon profil' : memberName}</p>
                {((displayStrengths && displayStrengths.length > 0) || displayGaps.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {displayStrengths.map(s => (
                      <Badge key={s.categoryId} className="bg-primary/20 text-[#1B6179] dark:text-primary border border-primary/30 text-[10px] px-1.5 h-4">
                        {shortLabel(s.categoryLabel)}
                      </Badge>
                    ))}
                    {displayGaps.map(g => (
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
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">{compareTarget.name}</p>
                  {compareTarget.progressionDelta > 0.05 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <ArrowUp className="h-2.5 w-2.5" />+{compareTarget.progressionDelta.toFixed(1)}
                    </span>
                  )}
                  {compareTarget.lastActivityAt && (
                    <span className={cn('text-[10px]', freshnessColor(daysSince(compareTarget.lastActivityAt)))}>
                      {humanFreshness(daysSince(compareTarget.lastActivityAt))}
                    </span>
                  )}
                </div>
                {compareAggregate && ((compareAggregate.topStrengths?.length > 0) || (compareAggregate.topGaps?.length > 0)) && (
                  <div className="flex flex-wrap gap-1">
                    {compareAggregate.topStrengths.map(s => (
                      <Badge key={s.categoryId} className="bg-primary/20 text-[#1B6179] dark:text-primary border border-primary/30 text-[10px] px-1.5 h-4">
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

        {sharedCategoryIds !== null && sharedCategoryIds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-8 text-center">
            <p className="font-medium">Pas de catégories en commun.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Complétez vos compétences supplémentaires pour enrichir la comparaison.
            </p>
          </div>
        ) : view === 'radar' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {segments && segments.map(seg => (
                  <div key={seg.label} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-muted-foreground">{seg.label}</span>
                  </div>
                ))}
              </div>
              {hasHomePole && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRadarScope(s => s === 'pole' ? 'all' : 'pole')}
                  className="text-xs"
                >
                  {radarScope === 'pole'
                    ? `Voir toutes les catégories (${categories.length})`
                    : `Recentrer sur ${POLE_LABELS[currentMemberPole!] ?? 'mon pôle'}`}
                </Button>
              )}
            </div>
            <VisxRadarChart
              data={data}
              overlay={overlayData}
              segments={segments}
              height={400}
              primaryLabel={isOwnProfile ? 'Moi' : memberName}
              overlayLabel={overlayLabel}
              showOverlayToggle
              showExport
            />
            {sharedCategoryIds && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Comparaison sur : {sharedCategoryIds.map(id => {
                  const cat = aggregate.categories.find(c => c.categoryId === id)
                  return cat?.categoryLabel ?? id
                }).join(', ')}
              </p>
            )}
          </>
        ) : (
          <>
            <BarComparisonChart
              data={data}
              overlay={overlayData}
              primaryLabel={isOwnProfile ? 'Moi' : memberName}
              overlayLabel={overlayLabel}
            />
            {sharedCategoryIds && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Comparaison sur : {sharedCategoryIds.map(id => {
                  const cat = aggregate.categories.find(c => c.categoryId === id)
                  return cat?.categoryLabel ?? id
                }).join(', ')}
              </p>
            )}
          </>
        )}

        {hasRatings && teamMembers && teamCategories && (
          <SkillDetailAccordion
            memberId={memberId}
            categories={
              // Mirror the radar's focus: when in pôle scope we don't want
              // the accordion to surface 16 "Non évalué" lines from pôles
              // the user doesn't belong to. The toggle above stays the
              // single source of truth for "show me everything vs only my
              // pôle". `displayCategories` is already pole-sorted; for
              // pôle-scope it's the filtered list, for 'all' it's everything.
              radarScope === 'pole' && homePoleCategoryIds
                ? categories.filter(c => homePoleCategoryIds.has(c.categoryId))
                : categories
            }
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

import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Sparkles, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import VisxRadarChart from '@/components/visx-radar-chart'
import BarComparisonChart from '@/components/bar-comparison-chart'
import ChartViewToggle from '@/components/chart-view-toggle'
import { useChartView } from '@/hooks/use-chart-view'
import { shortLabel } from '@/lib/utils'
import type { MemberAggregateResponse, TeamMemberAggregateResponse } from '@/lib/types'

interface PersonalOverviewProps {
  aggregate: MemberAggregateResponse & { hasRatings?: boolean }
  teamMembers?: TeamMemberAggregateResponse[]
  isOwnProfile?: boolean
  onFindExpert?: (categoryId: string) => void
}

export default function PersonalOverview({ aggregate, teamMembers, isOwnProfile = true, onFindExpert }: PersonalOverviewProps) {
  const { memberId, memberName, submittedAt, categories, topGaps, topStrengths } = aggregate
  const hasRatings = aggregate.hasRatings ?? categories.some((c) => c.avgRank > 0)
  const [view, setView] = useChartView()
  const [compareSlug, setCompareSlug] = useState<string | null>(null)
  const [profileSummary, setProfileSummary] = useState<string | null>(aggregate.profileSummary)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [comparisonSummary, setComparisonSummary] = useState<string | null>(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)

  // Reset state when profile changes
  const [prevMemberId, setPrevMemberId] = useState(memberId)
  if (memberId !== prevMemberId) {
    setPrevMemberId(memberId)
    setCompareSlug(null)
    setComparisonSummary(null)
    setProfileSummary(aggregate.profileSummary)
  }

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
        setComparisonSummary(data.summary ?? null)
      }
    } catch { /* silent */ }
    setComparisonLoading(false)
  }, [memberId, compareSlug])

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
          </div>
          <div className="flex items-center gap-2">
            {teamMembers && teamMembers.length > 0 && (
              <>
                <Select value={compareSlug ?? ''} onValueChange={(v) => { setCompareSlug(v || null); setComparisonSummary(null) }}>
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
        {/* Summary block: pill badges + AI narrative */}
        {topStrengths && topStrengths.length > 0 && (
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

        {comparisonSummary && (
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
            <p className="text-muted-foreground italic">{comparisonSummary}</p>
          </div>
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

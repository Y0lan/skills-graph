import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import { sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey'
import { ParentSize } from '@visx/responsive'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface FunnelNode { id: string; label: string; count: number }
interface FunnelLink {
  source: string
  target: string
  value: number
  p50_days_in_source?: number
  p90_days_in_source?: number
}
interface FunnelInsight {
  type: 'bottleneck' | 'none'
  source?: string
  target?: string
  p50_days?: number
  message?: string
}
interface FunnelPayload {
  nodes: FunnelNode[]
  links: FunnelLink[]
  totals: { all: number; hired: number; refused: number; in_progress: number }
  insight?: FunnelInsight
}

type PageState = 'loading' | 'error' | 'loaded'

const STATUS_COLOR: Record<string, string> = {
  postule: '#94a3b8',          // slate-400
  preselectionne: '#60a5fa',   // blue-400
  skill_radar_envoye: '#818cf8', // indigo-400
  skill_radar_complete: '#a78bfa', // violet-400
  entretien_1: '#c084fc',      // purple-400
  aboro: '#e879f9',            // fuchsia-400
  entretien_2: '#f472b6',      // pink-400
  proposition: '#fbbf24',      // amber-400
  embauche: '#34d399',         // emerald-400
  refuse: '#f87171',           // red-400
}

const TIME_RANGES: { label: string; days: number | null }[] = [
  { label: '30 derniers jours', days: 30 },
  { label: '90 derniers jours', days: 90 },
  { label: '1 an', days: 365 },
  { label: 'Tout', days: null },
]

const POLES = [
  { value: 'all', label: 'Tous les pôles' },
  { value: 'java_modernisation', label: 'Java / Modernisation' },
  { value: 'legacy', label: 'Legacy / Adélia' },
]

interface CompareResponse {
  a: { label: string; funnel: FunnelPayload }
  b: { label: string; funnel: FunnelPayload }
  linkDiffs: Array<{ source: string; target: string; aValue: number; bValue: number; delta: number; deltaPct: number | null }>
  totalsDelta: { all: number; hired: number; refused: number; in_progress: number }
}

export default function RecruitFunnelPage() {
  const [days, setDays] = useState<number | null>(90)
  const [pole, setPole] = useState<string>('all')
  const [state, setState] = useState<PageState>('loading')
  const [data, setData] = useState<FunnelPayload | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareDays, setCompareDays] = useState<number | null>(365)
  const [compareData, setCompareData] = useState<CompareResponse | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchFunnel = async () => {
      setState('loading')
      try {
        const params = new URLSearchParams()
        if (days !== null) params.set('days', String(days))
        if (pole !== 'all') params.set('pole', pole)
        const res = await fetch(`/api/recruitment/funnel?${params}`, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload: FunnelPayload = await res.json()
        if (cancelled) return
        setData(payload)
        setState('loaded')
      } catch (err) {
        console.error('[Funnel] Error:', err)
        if (!cancelled) setState('error')
      }
    }
    fetchFunnel()
    return () => { cancelled = true }
  }, [days, pole])

  // Compare-mode fetch
  useEffect(() => {
    if (!compareMode) {
      setCompareData(null)
      setCompareError(null)
      return
    }
    let cancelled = false
    setCompareLoading(true)
    setCompareError(null)
    const params = new URLSearchParams()
    if (days !== null) params.set('aDays', String(days))
    if (compareDays !== null) params.set('bDays', String(compareDays))
    if (pole !== 'all') params.set('pole', pole)
    fetch(`/api/recruitment/funnel/compare?${params}`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<CompareResponse>
      })
      .then(d => { if (!cancelled) setCompareData(d) })
      .catch(err => { if (!cancelled) setCompareError(err instanceof Error ? err.message : 'Erreur') })
      .finally(() => { if (!cancelled) setCompareLoading(false) })
    return () => { cancelled = true }
  }, [compareMode, days, compareDays, pole])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/recruit">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Funnel de recrutement</h1>
            <p className="text-sm text-muted-foreground">
              Visualisation des flux de candidats entre les étapes du pipeline.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={String(days ?? 'all')} onValueChange={v => setDays(v === 'all' ? null : Number(v))}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(r => (
                <SelectItem key={r.label} value={String(r.days ?? 'all')}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pole} onValueChange={v => setPole(v ?? 'all')}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POLES.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={compareMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCompareMode(!compareMode)}
            title="Comparer deux fenêtres temporelles côte à côte"
          >
            {compareMode ? '× Fermer comparaison' : '⇄ Comparer 2 cohortes'}
          </Button>
          {compareMode && (
            <Select value={String(compareDays ?? 'all')} onValueChange={v => setCompareDays(v === 'all' ? null : Number(v))}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map(r => (
                  <SelectItem key={String(r.days ?? 'all')} value={String(r.days ?? 'all')}>vs {r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Totals */}
        {data && state === 'loaded' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total candidats" value={data.totals.all} />
            <StatCard label="En cours" value={data.totals.in_progress} accent="text-blue-600" />
            <StatCard label="Embauchés" value={data.totals.hired} accent="text-emerald-600" />
            <StatCard label="Refusés" value={data.totals.refused} accent="text-red-600" />
          </div>
        )}

        {/* Insight banner — surfaces the slowest stage */}
        {state === 'loaded' && data?.insight?.type === 'bottleneck' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{data.insight.message}</p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">Survolez chaque flèche pour voir la médiane et le P90 du temps passé.</p>
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="rounded-lg border bg-card p-4 min-h-[500px]">
          {state === 'loading' && (
            <div className="flex items-center justify-center min-h-[500px]" data-testid="state-loading">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {state === 'error' && (
            <div className="flex items-center justify-center min-h-[500px]" data-testid="state-error">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span>Erreur lors du chargement du funnel.</span>
              </div>
            </div>
          )}
          {state === 'loaded' && data && data.links.length === 0 && (
            <div className="flex items-center justify-center min-h-[500px]" data-testid="state-empty">
              <div className="text-center text-muted-foreground">
                <p className="font-medium mb-1">Pas encore assez de transitions</p>
                <p className="text-sm">
                  Une fois que les candidats commencent à passer entre les étapes, le funnel apparaîtra ici.
                </p>
              </div>
            </div>
          )}
          {state === 'loaded' && data && data.links.length > 0 && (
            <ParentSize>
              {({ width }) => (
                <SankeyChart width={Math.max(width, 600)} height={500} data={data} />
              )}
            </ParentSize>
          )}
        </div>

        {/* Compare-mode panel */}
        {compareMode && (
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                Comparaison <span className="text-muted-foreground font-normal">— {compareData?.a.label ?? '?'} (A) vs {compareData?.b.label ?? '?'} (B)</span>
              </h2>
              {compareLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {compareError && (
              <div className="text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> {compareError}
              </div>
            )}
            {compareData && !compareLoading && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <DeltaCard label="Total candidats" delta={compareData.totalsDelta.all} />
                  <DeltaCard label="En cours" delta={compareData.totalsDelta.in_progress} />
                  <DeltaCard label="Embauchés" delta={compareData.totalsDelta.hired} positiveTone />
                  <DeltaCard label="Refusés" delta={compareData.totalsDelta.refused} positiveTone={false} />
                </div>

                <div className="grid lg:grid-cols-2 gap-3 min-h-[420px]">
                  <div className="rounded border bg-background p-2">
                    <p className="text-xs text-muted-foreground mb-1">A — {compareData.a.label}</p>
                    <ParentSize>
                      {({ width }) => (
                        <SankeyChart width={Math.max(width, 300)} height={380} data={compareData.a.funnel} />
                      )}
                    </ParentSize>
                  </div>
                  <div className="rounded border bg-background p-2">
                    <p className="text-xs text-muted-foreground mb-1">B — {compareData.b.label}</p>
                    <ParentSize>
                      {({ width }) => (
                        <SankeyChart width={Math.max(width, 300)} height={380} data={compareData.b.funnel} />
                      )}
                    </ParentSize>
                  </div>
                </div>

                {compareData.linkDiffs.filter(d => d.delta !== 0).length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Plus gros écarts (B − A)</p>
                    <div className="space-y-1">
                      {compareData.linkDiffs.filter(d => d.delta !== 0).slice(0, 8).map((d, i) => {
                        const direction = d.delta > 0 ? '↑' : '↓'
                        const tone = d.delta > 0 ? 'text-emerald-600' : 'text-rose-600'
                        return (
                          <div key={i} className="flex items-center justify-between text-sm gap-2">
                            <span className="truncate">{d.source} → {d.target}</span>
                            <span className={`tabular-nums ${tone}`}>
                              {direction} {Math.abs(d.delta)} {d.deltaPct !== null ? `(${d.deltaPct > 0 ? '+' : ''}${d.deltaPct}%)` : ''}
                              <span className="text-[11px] text-muted-foreground ml-1">A:{d.aValue} → B:{d.bValue}</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DeltaCard({ label, delta, positiveTone }: { label: string; delta: number; positiveTone?: boolean }) {
  const sign = delta > 0 ? '+' : ''
  // For "hired", a positive delta is good (green). For "refused", positive is bad (red).
  // For neutral (in_progress, total), we just show the sign.
  let tone = 'text-foreground'
  if (positiveTone === true) tone = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-muted-foreground'
  else if (positiveTone === false) tone = delta > 0 ? 'text-rose-600' : delta < 0 ? 'text-emerald-600' : 'text-muted-foreground'
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${tone}`}>{sign}{delta}</div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${accent ?? ''}`}>{value}</div>
    </div>
  )
}

interface SankeyChartProps {
  width: number
  height: number
  data: FunnelPayload
}

function SankeyChart({ width, height, data }: SankeyChartProps) {
  // Build the sankey layout. We deduplicate links and only include nodes that
  // appear in at least one link (or are a starting node like 'postule').
  const sankeyData = useMemo(() => {
    const usedNodeIds = new Set<string>()
    for (const l of data.links) {
      usedNodeIds.add(l.source)
      usedNodeIds.add(l.target)
    }
    // Keep node ordering canonical (matches STATUS_ORDER in backend).
    const nodes = data.nodes
      .filter(n => usedNodeIds.has(n.id))
      .map(n => ({ id: n.id, name: n.label, count: n.count }))
    const idToIndex = new Map(nodes.map((n, i) => [n.id, i]))
    const links = data.links
      .filter(l => idToIndex.has(l.source) && idToIndex.has(l.target))
      .map(l => ({
        source: idToIndex.get(l.source)!,
        target: idToIndex.get(l.target)!,
        value: l.value,
        sourceId: l.source,
        targetId: l.target,
        p50: l.p50_days_in_source,
        p90: l.p90_days_in_source,
      }))
    return { nodes, links }
  }, [data])

  const layout = useMemo(() => {
    if (sankeyData.nodes.length === 0 || sankeyData.links.length === 0) return null
    const sankeyGen = sankey<{ id: string; name: string; count: number }, { sourceId: string; targetId: string; value: number; p50?: number; p90?: number }>()
      .nodeId(d => d.id)
      .nodeAlign(sankeyLeft)
      .nodeWidth(14)
      .nodePadding(16)
      .extent([[10, 10], [width - 10, height - 10]])
    try {
      // d3-sankey mutates inputs, so deep-copy.
      const cloned = {
        nodes: sankeyData.nodes.map(n => ({ ...n })),
        links: sankeyData.links.map(l => ({ ...l })),
      }
      return sankeyGen(cloned)
    } catch (err) {
      console.error('[Sankey] layout failed (likely a cycle in the data):', err)
      return null
    }
  }, [sankeyData, width, height])

  if (!layout) {
    return (
      <div className="flex items-center justify-center min-h-[500px] text-muted-foreground text-sm">
        Le funnel contient un cycle qui ne peut pas être affiché.
      </div>
    )
  }

  return (
    <svg width={width} height={height} role="img" aria-label="Funnel de recrutement">
      <g>
        {layout.links.map((link, i) => {
          const path = sankeyLinkHorizontal()(link as never)
          const sourceId = (link.source as { id: string }).id
          return (
            <path
              key={i}
              d={path ?? undefined}
              fill="none"
              stroke={STATUS_COLOR[sourceId] ?? '#94a3b8'}
              strokeOpacity={0.45}
              strokeWidth={Math.max(1, link.width ?? 1)}
            >
              <title>
                {`${(link.source as { name: string }).name} → ${(link.target as { name: string }).name}: ${link.value} candidat${link.value > 1 ? 's' : ''}`}
                {(link as { p50?: number; p90?: number }).p50 !== undefined && `\nMédiane temps en ${(link.source as { name: string }).name}: ${(link as { p50?: number }).p50}j`}
                {(link as { p50?: number; p90?: number }).p90 !== undefined && ` · P90: ${(link as { p90?: number }).p90}j`}
              </title>
            </path>
          )
        })}
      </g>
      <g>
        {layout.nodes.map((node, i) => {
          const x0 = node.x0 ?? 0
          const x1 = node.x1 ?? 0
          const y0 = node.y0 ?? 0
          const y1 = node.y1 ?? 0
          const isRightHalf = x0 > width / 2
          return (
            <g key={i}>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={Math.max(2, y1 - y0)}
                fill={STATUS_COLOR[node.id] ?? '#94a3b8'}
              >
                <title>{`${node.name}: ${node.count} candidats`}</title>
              </rect>
              <text
                x={isRightHalf ? x0 - 6 : x1 + 6}
                y={(y0 + y1) / 2}
                dy="0.35em"
                textAnchor={isRightHalf ? 'end' : 'start'}
                className="fill-foreground text-xs font-medium"
              >
                {node.name}
                <tspan className="fill-muted-foreground" dx="6">
                  {node.count}
                </tspan>
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}

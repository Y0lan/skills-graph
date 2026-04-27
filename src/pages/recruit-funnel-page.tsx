import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertTriangle, X, ExternalLink, Clock } from 'lucide-react'
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

interface FlowCandidate {
  candidature_id: string
  candidate_id: string
  full_name: string | null
  poste_titre: string | null
  pole: string | null
  days_in_source: number
  sla: 'ok' | 'warn' | 'over'
  transitioned_at: string
}

interface FlowPayload {
  source: string
  target: string
  source_label: string
  target_label: string
  total: number
  p50_days: number | null
  p90_days: number | null
  candidates: FlowCandidate[]
}

type PageState = 'loading' | 'error' | 'loaded'

const STATUS_COLOR: Record<string, string> = {
  postule: '#94a3b8',
  preselectionne: '#60a5fa',
  skill_radar_envoye: '#818cf8',
  skill_radar_complete: '#a78bfa',
  entretien_1: '#c084fc',
  aboro: '#e879f9',
  entretien_2: '#f472b6',
  proposition: '#fbbf24',
  embauche: '#34d399',
  refuse: '#f87171',
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

interface SelectedFlow { from: string; to: string }

export default function RecruitFunnelPage() {
  const [days, setDays] = useState<number | null>(90)
  const [pole, setPole] = useState<string>('all')
  const [state, setState] = useState<PageState>('loading')
  const [data, setData] = useState<FunnelPayload | null>(null)
  const [selectedFlow, setSelectedFlow] = useState<SelectedFlow | null>(null)
  const [flow, setFlow] = useState<FlowPayload | null>(null)
  const [flowState, setFlowState] = useState<'idle' | 'loading' | 'error' | 'loaded'>('idle')

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

  // Filter changes invalidate the drill-down — clear it.
  useEffect(() => {
    setSelectedFlow(null)
    setFlow(null)
    setFlowState('idle')
  }, [days, pole])

  useEffect(() => {
    if (!selectedFlow) return
    let cancelled = false
    const ctrl = new AbortController()
    const fetchFlow = async () => {
      setFlowState('loading')
      try {
        const params = new URLSearchParams()
        params.set('from', selectedFlow.from)
        params.set('to', selectedFlow.to)
        if (days !== null) params.set('days', String(days))
        if (pole !== 'all') params.set('pole', pole)
        const res = await fetch(`/api/recruitment/funnel/flow?${params}`, { credentials: 'include', signal: ctrl.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload: FlowPayload = await res.json()
        if (cancelled) return
        setFlow(payload)
        setFlowState('loaded')
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('[FunnelFlow] Error:', err)
        if (!cancelled) setFlowState('error')
      }
    }
    fetchFlow()
    return () => { cancelled = true; ctrl.abort() }
  }, [selectedFlow, days, pole])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
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
              Cliquez sur une flèche pour voir les candidats du flux et repérer ceux qui traînent.
            </p>
          </div>
        </div>

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
        </div>

        {data && state === 'loaded' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total candidats" value={data.totals.all} />
            <StatCard label="En cours" value={data.totals.in_progress} accent="text-blue-600" />
            <StatCard label="Embauchés" value={data.totals.hired} accent="text-emerald-600" />
            <StatCard label="Refusés" value={data.totals.refused} accent="text-red-600" />
          </div>
        )}

        {state === 'loaded' && data?.insight?.type === 'bottleneck' && (
          <button
            type="button"
            onClick={() => {
              if (data.insight?.source && data.insight?.target) {
                setSelectedFlow({ from: data.insight.source, to: data.insight.target })
              }
            }}
            className="w-full text-left rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-3 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors"
          >
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{data.insight.message}</p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">Cliquez pour voir les candidats concernés.</p>
            </div>
          </button>
        )}

        {/* Split layout: chart on the left, drill-down panel on the right. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
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
                  <SankeyChart
                    width={Math.max(width, 600)}
                    height={500}
                    data={data}
                    selectedFlow={selectedFlow}
                    onSelectFlow={(from, to) => setSelectedFlow({ from, to })}
                  />
                )}
              </ParentSize>
            )}
          </div>

          <FlowPanel
            selectedFlow={selectedFlow}
            flow={flow}
            flowState={flowState}
            onClose={() => { setSelectedFlow(null); setFlow(null); setFlowState('idle') }}
          />
        </div>
      </div>
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
  selectedFlow: SelectedFlow | null
  onSelectFlow: (from: string, to: string) => void
}

function SankeyChart({ width, height, data, selectedFlow, onSelectFlow }: SankeyChartProps) {
  const sankeyData = useMemo(() => {
    const usedNodeIds = new Set<string>()
    for (const l of data.links) {
      usedNodeIds.add(l.source)
      usedNodeIds.add(l.target)
    }
    const nodes = data.nodes
      .filter(n => usedNodeIds.has(n.id))
      .map(n => ({ id: n.id, name: n.label, count: n.count }))
    const idById = new Set(nodes.map(n => n.id))
    const links = data.links
      .filter(l => idById.has(l.source) && idById.has(l.target))
      .map(l => ({
        source: l.source,
        target: l.target,
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
          const targetId = (link.target as { id: string }).id
          const isSelected = selectedFlow !== null && selectedFlow.from === sourceId && selectedFlow.to === targetId
          const isDimmed = selectedFlow !== null && !isSelected
          return (
            <path
              key={i}
              d={path ?? undefined}
              fill="none"
              stroke={STATUS_COLOR[sourceId] ?? '#94a3b8'}
              strokeOpacity={isSelected ? 0.85 : isDimmed ? 0.15 : 0.45}
              strokeWidth={Math.max(1, link.width ?? 1)}
              style={{ cursor: 'pointer', transition: 'stroke-opacity 120ms ease' }}
              onClick={() => onSelectFlow(sourceId, targetId)}
            >
              <title>
                {`${(link.source as { name: string }).name} → ${(link.target as { name: string }).name}: ${link.value} candidat${link.value > 1 ? 's' : ''}`}
                {(link as { p50?: number }).p50 !== undefined && `\nMédiane temps en ${(link.source as { name: string }).name}: ${(link as { p50?: number }).p50}j`}
                {(link as { p90?: number }).p90 !== undefined && ` · P90: ${(link as { p90?: number }).p90}j`}
                {`\nClic pour voir les candidats de ce flux`}
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

interface FlowPanelProps {
  selectedFlow: SelectedFlow | null
  flow: FlowPayload | null
  flowState: 'idle' | 'loading' | 'error' | 'loaded'
  onClose: () => void
}

function FlowPanel({ selectedFlow, flow, flowState, onClose }: FlowPanelProps) {
  if (!selectedFlow) {
    return (
      <div className="rounded-lg border bg-card p-6 flex items-center justify-center text-center min-h-[500px]">
        <div className="space-y-2 text-muted-foreground">
          <p className="text-sm font-medium">Aucun flux sélectionné</p>
          <p className="text-xs">
            Cliquez sur une flèche du funnel pour voir les candidats qui passent
            par cette transition, leur temps d'attente et les éventuels retards.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card flex flex-col min-h-[500px]">
      <div className="p-4 border-b flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Flux sélectionné</p>
          <p className="text-sm font-semibold mt-0.5 truncate">
            {flow?.source_label ?? selectedFlow.from} → {flow?.target_label ?? selectedFlow.to}
          </p>
          {flow && flowState === 'loaded' && (
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{flow.total} candidat{flow.total > 1 ? 's' : ''}</span>
              {flow.p50_days !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Médiane {flow.p50_days}j
                </span>
              )}
              {flow.p90_days !== null && (
                <span>P90 {flow.p90_days}j</span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le flux"
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {flowState === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {flowState === 'error' && (
          <div className="flex items-center justify-center py-12 text-destructive text-sm gap-2">
            <AlertTriangle className="h-4 w-4" />
            Erreur de chargement.
          </div>
        )}
        {flowState === 'loaded' && flow && flow.candidates.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Aucun candidat dans ce flux pour la période sélectionnée.
          </div>
        )}
        {flowState === 'loaded' && flow && flow.candidates.length > 0 && (
          <ul className="divide-y">
            {flow.candidates.map(c => (
              <li key={c.candidature_id}>
                <Link
                  to={`/recruit/${c.candidate_id}`}
                  className="block px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.full_name ?? 'Candidat sans nom'}</p>
                      {c.poste_titre && (
                        <p className="text-xs text-muted-foreground truncate">{c.poste_titre}</p>
                      )}
                    </div>
                    <SlaBadge sla={c.sla} days={c.days_in_source} />
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SlaBadge({ sla, days }: { sla: 'ok' | 'warn' | 'over'; days: number }) {
  const styles = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    warn: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    over: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
  }[sla]
  const icon = sla === 'ok' ? null : (
    <AlertTriangle className={sla === 'over' ? 'h-3 w-3' : 'h-3 w-3'} />
  )
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${styles}`}>
      {icon}
      {days}j
    </span>
  )
}

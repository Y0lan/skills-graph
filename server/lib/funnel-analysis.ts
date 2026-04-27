import { getDb } from './db.js'
import { STATUT_LABELS } from './constants.js'

export interface FunnelNode {
  id: string
  label: string
  count: number
}

export interface FunnelLink {
  source: string
  target: string
  value: number
  /** Median days spent in `source` before transitioning to `target`. */
  p50_days_in_source?: number
  /** 90th percentile days spent in `source` before transitioning to `target`. */
  p90_days_in_source?: number
}

/**
 * Insight surfaced on the funnel page header — points at the slowest stage so
 * the recruiter sees where to push attention.
 */
export interface FunnelInsight {
  type: 'bottleneck' | 'none'
  source?: string
  target?: string
  p50_days?: number
  message?: string
}

export interface FunnelData {
  nodes: FunnelNode[]
  links: FunnelLink[]
  totals: { all: number; hired: number; refused: number; in_progress: number }
  insight?: FunnelInsight
}

export const STATUS_ORDER = [
  'postule',
  'preselectionne',
  'skill_radar_envoye',
  'skill_radar_complete',
  'entretien_1',
  'aboro',
  'entretien_2',
  'proposition',
  'embauche',
  'refuse',
] as const

const TERMINAL = new Set(['embauche', 'refuse'])

export interface BuildFunnelOpts {
  days?: number | null
  pole?: string | null
}

export function buildFunnel(opts: BuildFunnelOpts = {}): FunnelData {
  const { days, pole } = opts
  const db = getDb()

  const candidatureFilters: string[] = []
  const candidatureParams: (string | number)[] = []
  if (typeof days === 'number' && days > 0) {
    candidatureFilters.push("c.created_at >= datetime('now', ?)")
    candidatureParams.push(`-${days} days`)
  }
  if (pole && pole !== 'all') {
    candidatureFilters.push('p.pole = ?')
    candidatureParams.push(pole)
  }
  const whereSql = candidatureFilters.length > 0 ? `WHERE ${candidatureFilters.join(' AND ')}` : ''

  const candidatures = db.prepare(`
    SELECT c.id, c.statut, c.created_at
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    ${whereSql}
  `).all(...candidatureParams) as { id: string; statut: string; created_at: string }[]

  if (candidatures.length === 0) {
    return {
      nodes: STATUS_ORDER.map(id => ({ id, label: STATUT_LABELS[id] ?? id, count: 0 })),
      links: [],
      totals: { all: 0, hired: 0, refused: 0, in_progress: 0 },
    }
  }

  const candidatureIds = candidatures.map(c => c.id)

  // Aggregate transitions. Use placeholders for the IN clause.
  const placeholders = candidatureIds.map(() => '?').join(',')
  const eventRows = db.prepare(`
    SELECT statut_from, statut_to, COUNT(DISTINCT candidature_id) as cnt
    FROM candidature_events
    WHERE type = 'status_change'
      AND statut_from IS NOT NULL
      AND statut_to IS NOT NULL
      AND candidature_id IN (${placeholders})
    GROUP BY statut_from, statut_to
  `).all(...candidatureIds) as { statut_from: string; statut_to: string; cnt: number }[]

  // Per-link time-in-source-stage stats. Walked in JS so we can pair each
  // exit event with the matching entry event chronologically per candidature.
  const allEvents = db.prepare(`
    SELECT candidature_id, statut_from, statut_to, created_at
    FROM candidature_events
    WHERE type = 'status_change'
      AND statut_to IS NOT NULL
      AND candidature_id IN (${placeholders})
    ORDER BY candidature_id, created_at ASC
  `).all(...candidatureIds) as { candidature_id: string; statut_from: string | null; statut_to: string; created_at: string }[]

  const candidatureCreatedAt = new Map(candidatures.map(c => [c.id, c.created_at]))
  const linkDurationsDays = new Map<string, number[]>()

  let currentCandidate: string | null = null
  let stageEnteredAt: Date | null = null
  let currentStage: string | null = null
  for (const ev of allEvents) {
    if (ev.candidature_id !== currentCandidate) {
      currentCandidate = ev.candidature_id
      // Each candidature begins in 'postule' at its created_at.
      const createdAt = candidatureCreatedAt.get(currentCandidate)
      stageEnteredAt = createdAt ? new Date(createdAt + 'Z') : null
      currentStage = 'postule'
    }
    if (currentStage && stageEnteredAt && ev.statut_from === currentStage) {
      const exitTime = new Date(ev.created_at + 'Z')
      const durationDays = Math.max(0, (exitTime.getTime() - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24))
      const key = `${currentStage}→${ev.statut_to}`
      const arr = linkDurationsDays.get(key) ?? []
      arr.push(durationDays)
      linkDurationsDays.set(key, arr)
    }
    // Advance to the new stage.
    currentStage = ev.statut_to
    stageEnteredAt = new Date(ev.created_at + 'Z')
  }

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
    return Math.round(sorted[idx] * 10) / 10
  }

  // d3-sankey rejects both self-loops AND cycles. Status reverts (e.g.
  // a recruiter undoing a transition: preselectionne → postule) create
  // backward edges which combined with later forward edges form a
  // cycle and crash the layout. Drop any link where target isn't
  // strictly later in STATUS_ORDER than source. Reverts remain in the
  // event log; they just don't contribute to the funnel viz.
  const orderIndex: Record<string, number> = Object.fromEntries(
    STATUS_ORDER.map((s, i) => [s, i]),
  )
  const links: FunnelLink[] = eventRows
    .filter(r => {
      if (r.statut_from === r.statut_to) return false // self-loop
      const fromIdx = orderIndex[r.statut_from] ?? -1
      const toIdx = orderIndex[r.statut_to] ?? -1
      if (fromIdx === -1 || toIdx === -1) return false // unknown status
      return toIdx > fromIdx // forward only — drop reverts
    })
    .map(r => {
      const durations = (linkDurationsDays.get(`${r.statut_from}→${r.statut_to}`) ?? []).slice().sort((a, b) => a - b)
      return {
        source: r.statut_from,
        target: r.statut_to,
        value: r.cnt,
        p50_days_in_source: durations.length > 0 ? percentile(durations, 0.5) : undefined,
        p90_days_in_source: durations.length > 0 ? percentile(durations, 0.9) : undefined,
      }
    })

  // Identify the slowest non-terminal source stage (highest p50) with at least 3 samples.
  let bottleneck: { source: string; target: string; p50: number; samples: number } | null = null
  for (const link of links) {
    const samples = linkDurationsDays.get(`${link.source}→${link.target}`)?.length ?? 0
    if (samples < 3) continue
    if (link.p50_days_in_source === undefined) continue
    if (TERMINAL.has(link.source)) continue
    if (!bottleneck || link.p50_days_in_source > bottleneck.p50) {
      bottleneck = { source: link.source, target: link.target, p50: link.p50_days_in_source, samples }
    }
  }
  const insight: FunnelInsight = bottleneck
    ? {
        type: 'bottleneck',
        source: bottleneck.source,
        target: bottleneck.target,
        p50_days: bottleneck.p50,
        message: `Ralentissement détecté en "${STATUT_LABELS[bottleneck.source] ?? bottleneck.source}" — médiane ${bottleneck.p50}j avant transition vers "${STATUT_LABELS[bottleneck.target] ?? bottleneck.target}" (${bottleneck.samples} candidats).`,
      }
    : { type: 'none' }

  // Compute node counts: candidatures whose CURRENT status is this node, plus candidatures
  // that have ever passed through this node (touched by an event statut_to or statut_from).
  // We use the ever-touched count so the Sankey balance reflects historical flow.
  const everTouchedQuery = db.prepare(`
    SELECT statut_to as statut, COUNT(DISTINCT candidature_id) as cnt
    FROM candidature_events
    WHERE type = 'status_change'
      AND statut_to IS NOT NULL
      AND candidature_id IN (${placeholders})
    GROUP BY statut_to
  `).all(...candidatureIds) as { statut: string; cnt: number }[]
  const touchedMap = new Map<string, number>()
  for (const r of everTouchedQuery) touchedMap.set(r.statut, r.cnt)

  // Postulé baseline: every candidature was once postulé (initial state).
  touchedMap.set('postule', candidatures.length)

  const nodes: FunnelNode[] = STATUS_ORDER.map(id => ({
    id,
    label: STATUT_LABELS[id] ?? id,
    count: touchedMap.get(id) ?? 0,
  }))

  let hired = 0
  let refused = 0
  let in_progress = 0
  for (const c of candidatures) {
    if (c.statut === 'embauche') hired++
    else if (c.statut === 'refuse') refused++
    else if (!TERMINAL.has(c.statut)) in_progress++
  }

  return {
    nodes,
    links,
    totals: { all: candidatures.length, hired, refused, in_progress },
    insight,
  }
}

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
}

export interface FunnelData {
  nodes: FunnelNode[]
  links: FunnelLink[]
  totals: { all: number; hired: number; refused: number; in_progress: number }
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
    SELECT c.id, c.statut
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    ${whereSql}
  `).all(...candidatureParams) as { id: string; statut: string }[]

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

  const links: FunnelLink[] = eventRows
    .filter(r => r.statut_from !== r.statut_to) // d3-sankey rejects self-loops
    .map(r => ({ source: r.statut_from, target: r.statut_to, value: r.cnt }))

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
  }
}

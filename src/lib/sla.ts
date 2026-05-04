import { parseAppDate } from './constants'

// Per-status SLA: how long is "normal" before a candidature should move on.
// Beyond this many days, the StatusChip shows a breach border so recruiters
// can spot stuck candidates at a glance. Tune per-pole / per-stage as needed.
export const STATUT_SLA_DAYS: Record<string, number> = {
  postule: 3,
  preselectionne: 7,
  skill_radar_envoye: 7,
  skill_radar_complete: 5,
  entretien_1: 5,
  aboro: 14,        // Aboro is paid + scheduled — longer SLA is realistic
  entretien_2: 5,
  proposition: 7,
  embauche: Infinity,
  refuse: Infinity,
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  const then = parseAppDate(iso)?.getTime() ?? Date.now()
  return Math.max(0, (Date.now() - then) / (1000 * 60 * 60 * 24))
}

export interface SlaState {
  daysInStatus: number
  slaDays: number
  isBreached: boolean
  daysOver: number
}

export function slaState(statut: string, enteredStatusAt: string | null | undefined): SlaState {
  const days = daysSince(enteredStatusAt)
  const sla = STATUT_SLA_DAYS[statut] ?? Infinity
  return {
    daysInStatus: days,
    slaDays: sla,
    isBreached: sla !== Infinity && days > sla,
    daysOver: sla === Infinity ? 0 : Math.max(0, days - sla),
  }
}

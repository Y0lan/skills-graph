import type { AboroProfile } from './aboro-extraction.js'

export interface SoftSkillResult {
  score: number          // 0-100
  alerts: { trait: string; value: number; threshold: number; message: string }[]
}

// Traits mapped to SINAPSE criteria (design doc §4):
// - "Capacité travail d'équipe" -> consultation, ouverture, critique
// - "Remise en question" -> critique, changement
// - "Posture collaborative" -> consultation, sociabilite
const COLLABORATION_TRAITS = ['consultation', 'ouverture', 'critique', 'sociabilite'] as const
const ADAPTABILITY_TRAITS = ['changement', 'taches_variees', 'inventivite'] as const
const LEADERSHIP_TRAITS = ['ascendant', 'conviction', 'initiative'] as const

const ALERT_THRESHOLD = 4  // Below 4/10 = alert (not eliminatory, human decides)

export function calculateSoftSkillScore(profile: AboroProfile): SoftSkillResult {
  const alerts: SoftSkillResult['alerts'] = []
  const allTraits: Record<string, number> = {}
  for (const axis of Object.values(profile.traits)) {
    for (const [key, val] of Object.entries(axis)) {
      allTraits[key] = val as number
    }
  }

  const collab = avg(COLLABORATION_TRAITS.map(t => allTraits[t] ?? 1))
  const adapt = avg(ADAPTABILITY_TRAITS.map(t => allTraits[t] ?? 1))
  const lead = avg(LEADERSHIP_TRAITS.map(t => allTraits[t] ?? 1))
  const score = Math.round((collab * 0.4 + adapt * 0.3 + lead * 0.3) * 10)

  // Check thresholds on collaboration + adaptability traits
  for (const t of [...COLLABORATION_TRAITS, ...ADAPTABILITY_TRAITS]) {
    if ((allTraits[t] ?? 1) < ALERT_THRESHOLD) {
      alerts.push({ trait: t, value: allTraits[t] ?? 1, threshold: ALERT_THRESHOLD,
        message: `${t}: ${allTraits[t]}/10 (seuil: ${ALERT_THRESHOLD})` })
    }
  }
  return { score, alerts }
}

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 5
}

export interface SoftSkillBreakdown {
  total: number
  groups: Array<{
    name: 'collaboration' | 'adaptability' | 'leadership'
    weight: number
    avg: number
    contribution: number
    traits: { name: string; value: number }[]
  }>
  alerts: SoftSkillResult['alerts']
}

const GROUP_WEIGHTS = { collaboration: 0.4, adaptability: 0.3, leadership: 0.3 } as const

export function getSoftSkillBreakdown(profile: AboroProfile): SoftSkillBreakdown {
  const allTraits: Record<string, number> = {}
  for (const axis of Object.values(profile.traits)) {
    for (const [key, val] of Object.entries(axis)) {
      allTraits[key] = val as number
    }
  }

  const collabTraits = COLLABORATION_TRAITS.map(t => ({ name: t, value: allTraits[t] ?? 1 }))
  const adaptTraits = ADAPTABILITY_TRAITS.map(t => ({ name: t, value: allTraits[t] ?? 1 }))
  const leadTraits = LEADERSHIP_TRAITS.map(t => ({ name: t, value: allTraits[t] ?? 1 }))

  const collab = avg(collabTraits.map(t => t.value))
  const adapt = avg(adaptTraits.map(t => t.value))
  const lead = avg(leadTraits.map(t => t.value))
  const total = Math.round((collab * GROUP_WEIGHTS.collaboration + adapt * GROUP_WEIGHTS.adaptability + lead * GROUP_WEIGHTS.leadership) * 10)

  const alerts: SoftSkillResult['alerts'] = []
  for (const t of [...COLLABORATION_TRAITS, ...ADAPTABILITY_TRAITS]) {
    if ((allTraits[t] ?? 1) < ALERT_THRESHOLD) {
      alerts.push({ trait: t, value: allTraits[t] ?? 1, threshold: ALERT_THRESHOLD,
        message: `${t}: ${allTraits[t]}/10 (seuil: ${ALERT_THRESHOLD})` })
    }
  }

  return {
    total,
    groups: [
      { name: 'collaboration', weight: GROUP_WEIGHTS.collaboration, avg: Math.round(collab * 10) / 10, contribution: Math.round(collab * GROUP_WEIGHTS.collaboration * 10), traits: collabTraits },
      { name: 'adaptability', weight: GROUP_WEIGHTS.adaptability, avg: Math.round(adapt * 10) / 10, contribution: Math.round(adapt * GROUP_WEIGHTS.adaptability * 10), traits: adaptTraits },
      { name: 'leadership', weight: GROUP_WEIGHTS.leadership, avg: Math.round(lead * 10) / 10, contribution: Math.round(lead * GROUP_WEIGHTS.leadership * 10), traits: leadTraits },
    ],
    alerts,
  }
}

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

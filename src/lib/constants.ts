export const STATUT_LABELS: Record<string, string> = {
  postule: 'Postulé',
  preselectionne: 'Présélectionné',
  skill_radar_envoye: 'Skill Radar envoyé',
  skill_radar_complete: 'Skill Radar complété',
  entretien_1: 'Entretien 1',
  aboro: 'Test Âboro',
  entretien_2: 'Entretien 2',
  proposition: 'Proposition',
  embauche: 'Embauché',
  refuse: 'Refusé',
}

/** One-line explanation of each pipeline stage, shown in the stepper tooltip.
 *  Kept terse — reads like a legend, not a spec. */
export const STATUT_DESCRIPTIONS: Record<string, string> = {
  postule: 'Candidature reçue. Étape initiale de chaque candidat.',
  preselectionne: 'Profil validé par le recruteur après lecture du dossier.',
  skill_radar_envoye: 'Lien vers le formulaire d\'auto-évaluation envoyé au candidat.',
  skill_radar_complete: 'Le candidat a soumis son auto-évaluation. Radar disponible.',
  entretien_1: 'Premier entretien planifié (BENOIT + SAVALLE).',
  aboro: 'Test de personnalité SWIPE/Âboro (optionnel, payant).',
  entretien_2: 'Second entretien, approfondissement.',
  proposition: 'Proposition d\'embauche émise.',
  embauche: 'Candidat signé — terminal.',
  refuse: 'Candidature déclinée — terminal (possible depuis toute étape).',
}

/** Recommended next action per statut — source of truth shared by the
 *  pipeline stepper, the candidature switcher, and the action rail. */
export const NEXT_ACTION: Record<string, string> = {
  postule: 'Trier le candidat',
  preselectionne: 'Envoyer le Skill Radar',
  skill_radar_envoye: 'Relancer si pas de retour',
  skill_radar_complete: "Planifier l'entretien 1",
  entretien_1: 'Planifier le test Aboro',
  aboro: "Planifier l'entretien 2",
  entretien_2: 'Préparer la proposition',
  proposition: 'Attendre la réponse du candidat',
  embauche: 'Onboarding',
}

/** Consequence line shown under each transition button so the recruiter
 *  knows what the click actually does. `targetStatut` is the state the
 *  click would put the candidature into. The map intentionally covers
 *  every forward transition plus refuse — callers fall back to the
 *  generic string when a novel transition is added. */
export const TRANSITION_CONSEQUENCES: Record<string, string> = {
  preselectionne: 'Programme un email de présélection (envoyable dans 10 min)',
  skill_radar_envoye: 'Envoie le lien d\'évaluation au candidat',
  skill_radar_complete: 'Aucun email — marque le radar comme reçu',
  entretien_1: 'Programme une convocation par email (envoyable dans 10 min)',
  aboro: 'Programme la convocation Aboro avec la date choisie',
  entretien_2: 'Programme une convocation par email (envoyable dans 10 min)',
  proposition: 'Programme l\'email de proposition (envoyable dans 10 min)',
  embauche: 'Programme le mail de bienvenue — action terminale',
  refuse: 'Envoie un email de refus (obligatoire) — action terminale',
}

/** Copy the consequence line derived from a target statut. Falls back to
 *  a generic "aucun email" phrase for statuts without a mapped
 *  consequence — tells the recruiter the click is safe and internal-only. */
export function transitionConsequence(targetStatut: string): string {
  return TRANSITION_CONSEQUENCES[targetStatut] ?? 'Aucun email — transition interne'
}

export const STATUT_COLORS: Record<string, string> = {
  postule: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  preselectionne: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  skill_radar_envoye: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  skill_radar_complete: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  entretien_1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  aboro: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  entretien_2: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  proposition: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  embauche: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  refuse: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

export const CANAL_LABELS: Record<string, string> = {
  cabinet: 'Cabinet',
  site: 'sinapse.nc',
  candidature_directe: 'Candidature directe',
  reseau: 'Réseau',
}

export const POLE_LABELS: Record<string, string> = {
  legacy: 'Legacy (Adélia / IBMi)',
  java_modernisation: 'Java / Modernisation',
  fonctionnel: 'Fonctionnel',
}

export const POLE_COLORS: Record<string, string> = {
  legacy: 'bg-[#FEF5EC] text-[#EC8C32] dark:bg-[#EC8C32]/15 dark:text-[#F5A65B]',
  java_modernisation: 'bg-[#F4FDFF] text-[#1B6179] dark:bg-[#1B6179]/15 dark:text-[#52B6CF]',
  fonctionnel: 'bg-[#FFF9DB] text-[#F0B800] dark:bg-[#F0B800]/15 dark:text-[#FFD400]',
}

/** Raw hex colors per pole for SVG/canvas rendering */
export const POLE_HEX: Record<string, string> = {
  legacy: '#EC8C32',
  java_modernisation: '#3BA0D8',
  fonctionnel: '#E8D44D',
  __transverse: '#8B8B8B',
}

/** Category IDs belonging to each pole (mirrors server/lib/db.ts pole_categories) */
export const POLE_CATEGORY_IDS: Record<string, string[]> = {
  legacy: [
    'legacy-ibmi-adelia', 'javaee-jboss', 'core-engineering',
    'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
  ],
  java_modernisation: [
    'core-engineering', 'backend-integration', 'frontend-ui',
    'platform-engineering', 'observability-reliability', 'security-compliance',
    'ai-engineering', 'qa-test-engineering', 'infrastructure-systems-network',
    'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
  ],
  fonctionnel: [
    'analyse-fonctionnelle', 'project-management-pmo', 'change-management-training',
    'design-ux', 'data-engineering-governance', 'management-leadership',
    'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
  ],
}

/**
 * Resolve which pole(s) a category belongs to.
 * Returns an array of pole names (some categories are shared across poles).
 */
export function getCategoryPoles(categoryId: string): string[] {
  const poles: string[] = []
  for (const [pole, catIds] of Object.entries(POLE_CATEGORY_IDS)) {
    if (catIds.includes(categoryId)) poles.push(pole)
  }
  return poles
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** Full date format (includes year) */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR')
}

/** Date + time format: "13/04/2026 14:32" */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Parse a CV date: "2018", "2018-01", "2018-01-15" → Date (UTC noon to dodge
 *  TZ edge cases), or null if unparseable. */
function parseCvDate(raw: string | number | null | undefined): Date | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const ym = s.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/)
  if (ym) {
    const y = Number(ym[1])
    const m = ym[2] ? Number(ym[2]) - 1 : 0
    const d = ym[3] ? Number(ym[3]) : 1
    const date = new Date(Date.UTC(y, m, d, 12, 0, 0))
    return isNaN(date.getTime()) ? null : date
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/** "2018-01-01" → "janv. 2018". "2018" → "2018". */
function formatMonthYear(d: Date, granular: boolean): string {
  if (!granular) return String(d.getUTCFullYear())
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "7 ans · 3 mois" / "1 an" / "10 mois" / null if nonsensical. */
function formatDurationBetween(start: Date, end: Date): string | null {
  const ms = end.getTime() - start.getTime()
  if (ms < 0) return null
  const totalMonths = Math.round(ms / (1000 * 60 * 60 * 24 * 30.4375))
  if (totalMonths < 1) return null
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const yPart = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
  const mPart = months > 0 ? `${months} mois` : ''
  if (yPart && mPart) return `${yPart} ${mPart}`
  return yPart || mPart || null
}

/** Build a human-friendly CV date range with auto duration.
 *  Examples:
 *    formatCvDateRange("2018-01-01", "2025-01-01") → "janv. 2018 → janv. 2025 · 7 ans"
 *    formatCvDateRange("2022", null)                → "2022 → présent · 4 ans"
 *    formatCvDateRange("2020-03", "2020-11")        → "mars 2020 → nov. 2020 · 8 mois"
 *    formatCvDateRange(null, null)                  → null (caller hides the range) */
export function formatCvDateRange(startRaw: string | number | null | undefined, endRaw: string | number | null | undefined): string | null {
  const start = parseCvDate(startRaw)
  const endParsed = parseCvDate(endRaw)
  if (!start && !endParsed) return null
  const end = endParsed ?? new Date()
  const isOngoing = !endParsed
  // If both inputs are bare years (no month), render year-only. Otherwise
  // render month + year so "Jan→Mar 2020" doesn't collapse to "2020→2020".
  const startGranular = typeof startRaw === 'string' && /\d{4}-\d{1,2}/.test(startRaw)
  const endGranular = typeof endRaw === 'string' && /\d{4}-\d{1,2}/.test(endRaw)
  const granular = startGranular || endGranular
  const startLabel = start ? formatMonthYear(start, granular) : '—'
  const endLabel = isOngoing ? 'présent' : formatMonthYear(end, granular)
  const duration = start ? formatDurationBetween(start, end) : null
  return duration ? `${startLabel} → ${endLabel} · ${duration}` : `${startLabel} → ${endLabel}`
}

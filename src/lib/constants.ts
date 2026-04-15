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

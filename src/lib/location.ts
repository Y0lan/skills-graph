/**
 * Location classification for the pipeline filter chip.
 *
 * Demo ask (April 2026): "pouvoir filtrer les candidatures par celle qui
 * sont de Nouméa et celle ailleurs de Nouvelle-Calédonie", refined later
 * to four buckets: Nouméa / NC (reste) / France / International, plus
 * Inconnu for candidates whose CV hasn\'t been extracted yet.
 *
 * Why a city allowlist (codex P15+P16+P17): NC is administratively part
 * of France, so CV extraction commonly emits `country: "France"` for an
 * NC address. Country alone misclassifies — we need city precedence.
 * The allowlist covers the 4 NC provinces + main villages from the
 * Province des îles. If a city not in the list is set with
 * `country: "Nouvelle-Calédonie"`, the country fallback catches it.
 *
 * If neither city nor country provides signal, we report "unknown"
 * rather than guessing — a recruiter clicking "Inconnu" is asking
 * "which CVs need extraction?".
 */

export type LocationBucket =
  | 'noumea'
  | 'nc_outside'
  | 'france'
  | 'international'
  | 'unknown'

// Accent-stripped, lowercase. Province des îles + Nord + Sud.
const NC_CITIES: ReadonlySet<string> = new Set([
  'noumea',
  'dumbea', 'paita', 'mont-dore', 'mont dore',
  'bourail', 'la foa', 'farino', 'sarramea', 'moindou',
  'kone', 'pouembout', 'voh', 'kaala-gomen', 'koumac',
  'ouegoa', 'pouebo', 'hienghene', 'touho', 'poindimie',
  'ponerihouen', 'houailou', 'kouaoua', 'canala', 'thio',
  'yate', 'ile des pins',
  'lifou', 'we', 'mare', 'tadine', 'ouvea', 'fayaoue',
  'belep', 'poum',
])

const NC_COUNTRIES: ReadonlySet<string> = new Set([
  'nouvelle-caledonie', 'nouvelle caledonie', 'new caledonia', 'nc',
])

const FRANCE_COUNTRIES: ReadonlySet<string> = new Set([
  'france', 'metropole', 'fr',
])

function normalize(s: string | null | undefined): string {
  if (!s) return ''
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function classifyLocation(
  city: string | null | undefined,
  country: string | null | undefined,
): LocationBucket {
  const c = normalize(city)
  const ctry = normalize(country)

  // City precedence — Nouméa is unambiguous regardless of country.
  if (c === 'noumea') return 'noumea'

  // Other NC cities — city alone is enough signal (codex P16: Dumbéa,
  // Païta, Mont-Dore are unambiguously NC).
  if (NC_CITIES.has(c)) return 'nc_outside'

  // Country fallback when city isn\'t in the allowlist (smaller villages,
  // typos, English variants, …). NC takes precedence over France because
  // NC is administratively French (codex P17).
  if (NC_COUNTRIES.has(ctry)) {
    return c === 'noumea' ? 'noumea' : 'nc_outside'
  }
  if (FRANCE_COUNTRIES.has(ctry)) return 'france'

  // Anything else with a country set: assume international.
  if (ctry) return 'international'

  // No signal: needs CV extraction.
  return 'unknown'
}

export const LOCATION_BUCKET_LABELS: Record<LocationBucket, string> = {
  noumea: 'Nouméa',
  nc_outside: 'NC (reste)',
  france: 'France',
  international: 'International',
  unknown: 'Inconnu',
}

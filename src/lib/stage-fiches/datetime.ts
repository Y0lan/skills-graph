/**
 * Stage-fiche datetime conventions for Pacific/Noumea (UTC+11, no DST).
 *
 * The recruiter is in Nouméa. Servers run UTC. `<input type="datetime-local">`
 * emits no timezone. v4-era `new Date(string)` parsing depends on the runtime's
 * local TZ. Add it all up and naive round-tripping shows the wrong hour to
 * Guillaume the day after he saved an interview slot.
 *
 * Convention here:
 *   1. STORAGE — `scheduledAt`, `responseDeadline`, etc. are stored as the
 *      *wall-clock string the recruiter typed*, format `YYYY-MM-DDTHH:mm`,
 *      no zone suffix. We treat the string as Pacific/Noumea local time.
 *      Zod regex enforces the shape (DO NOT use `z.string().datetime()` —
 *      that requires a `Z` suffix and would reject `<input type=datetime-local>`).
 *   2. COMPARISON — when comparing against "now" (cron, proximity tints),
 *      construct a Date by appending the fixed `+11:00` offset to the stored
 *      string. Pacific/Noumea has no DST so this is correct year-round.
 *   3. DISPLAY — render via Intl.DateTimeFormat with explicit
 *      `timeZone: 'Pacific/Noumea'`, so a recruiter on a laptop set to UTC
 *      still sees the Nouméa time he typed.
 *
 * No callers should `new Date(string)` a fiche datetime directly. Use these
 * helpers — they are the single source of truth.
 */

export const PACIFIC_NOUMEA_OFFSET = '+11:00'

/** Tight wall-clock pattern: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss. */
export const FICHE_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

/** YYYY-MM-DD only. Used by date-only fields (responseDeadline, startDate). */
export const FICHE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse a stored fiche wall-clock string into a Date pinned to Pacific/Noumea.
 * Returns null when the input is not a recognised shape — callers display "—".
 */
export function parseFicheDateTime(stored: string | null | undefined): Date | null {
  if (!stored) return null
  const s = String(stored).trim()
  if (!s) return null
  if (FICHE_DATETIME_REGEX.test(s)) {
    const seconds = s.length === 16 ? ':00' : ''
    const d = new Date(`${s}${seconds}${PACIFIC_NOUMEA_OFFSET}`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (FICHE_DATE_REGEX.test(s)) {
    // Date-only fields: anchor at noon Nouméa so DST-free arithmetic is safe.
    const d = new Date(`${s}T12:00:00${PACIFIC_NOUMEA_OFFSET}`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Format a stored fiche wall-clock for the recruiter. Always renders in
 * Pacific/Noumea regardless of where the browser thinks it is.
 */
export function formatFicheDateTime(stored: string | null | undefined): string {
  const d = parseFicheDateTime(stored)
  if (!d) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Pacific/Noumea',
  }).format(d)
}

/** Compact "30/04 · 14:00" for inline pills. */
export function formatFicheDateTimeShort(stored: string | null | undefined): string {
  const d = parseFicheDateTime(stored)
  if (!d) return '—'
  const datePart = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Pacific/Noumea',
  }).format(d)
  const timePart = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Pacific/Noumea',
  }).format(d)
  return `${datePart} · ${timePart}`
}

/** Date-only display ("12 mai 2026") for date-only fiche fields. */
export function formatFicheDate(stored: string | null | undefined): string {
  const d = parseFicheDateTime(stored)
  if (!d) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeZone: 'Pacific/Noumea',
  }).format(d)
}

/** Proximity classes for date tints. ms-based, no DST gotchas. */
export type DateProximity = 'past' | 'imminent' | 'soon' | 'distant'

export function compareToNow(stored: string | null | undefined, now: Date = new Date()): DateProximity | null {
  const d = parseFicheDateTime(stored)
  if (!d) return null
  const ms = d.getTime() - now.getTime()
  if (ms < 0) return 'past'
  if (ms < 60 * 60 * 1000) return 'imminent'      // < 1h
  if (ms < 24 * 60 * 60 * 1000) return 'soon'     // < 24h
  return 'distant'
}

/** Tailwind class for the proximity tint. Returns '' for past/null. */
export function dateProximityClass(stored: string | null | undefined, now: Date = new Date()): string {
  const p = compareToNow(stored, now)
  switch (p) {
    case 'imminent': return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30'
    case 'soon':     return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
    case 'distant':  return 'bg-muted/40 text-muted-foreground ring-1 ring-border'
    case 'past':     return 'bg-muted/30 text-muted-foreground ring-1 ring-border line-through'
    default:         return ''
  }
}

/**
 * Convert a Date to the wall-clock string an `<input type="datetime-local">`
 * expects, projected into Pacific/Noumea. Used to seed the input from a
 * stored value the recruiter is editing.
 */
export function toInputDateTimeLocal(stored: string | null | undefined): string {
  const d = parseFicheDateTime(stored)
  if (!d) return ''
  // en-CA → ISO-like "YYYY-MM-DD, HH:mm" with the requested timeZone.
  // We split + recompose to drop seconds and the comma.
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
    timeZone: 'Pacific/Noumea',
  }).formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}

/**
 * Reverse: take whatever the input emits and normalise it into a fiche
 * wall-clock string. Browsers may emit `YYYY-MM-DDTHH:mm` or with seconds.
 * We trim seconds, since the storage shape is `YYYY-MM-DDTHH:mm`.
 */
export function fromInputDateTimeLocal(raw: string): string {
  if (!raw) return ''
  // Strip a trailing "Z" if the input element ever produced one (unusual but defensive).
  const cleaned = raw.replace(/Z$/, '')
  return cleaned.length >= 16 ? cleaned.slice(0, 16) : cleaned
}

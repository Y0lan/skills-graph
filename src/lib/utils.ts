import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip parenthesized suffixes from labels for compact chart display */
export function shortLabel(label: string): string {
  return label.replace(/\s*\(.*\)$/, '').trim()
}

/** Color class for skill/category strength rating */
export function strengthColor(avg: number): string {
  if (avg >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (avg >= 3) return 'text-sky-600 dark:text-sky-400'
  if (avg >= 2) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** Number of full days since a given ISO date string */
export function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime()
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.floor(ms / 86400000))
}

/** Tailwind color class based on freshness (days since last update) */
export function freshnessColor(days: number): string {
  if (days <= 14) return 'text-muted-foreground'
  if (days <= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** Human-readable freshness label */
export function humanFreshness(days: number): string {
  if (days === 0) return 'Mis à jour aujourd\'hui'
  if (days === 1) return 'Mis à jour il y a 1j'
  if (days <= 30) return `Mis à jour il y a ${days}j`
  if (days <= 365) return `Mis à jour il y a ${Math.round(days / 30)} mois`
  return 'Mis à jour il y a plus d\'un an'
}

/** Split an international phone number into its country-code prefix and the
 *  rest, joined by a narrow no-break space so "+687871234" reads
 *  "+687 871234". Falls back to the raw input if no country code can be
 *  detected (no leading '+'). The space is U+202F so the number can't wrap
 *  in the middle of itself. */
export function formatPhone(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('+')) return trimmed
  const m = trimmed.match(/^\+(\d{1,3})\s*(.*)$/)
  if (!m) return trimmed
  return `+${m[1]}\u202F${m[2]}`
}

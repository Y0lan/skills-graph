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

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

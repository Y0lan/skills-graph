import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip parenthesized suffixes from labels for compact chart display */
export function shortLabel(label: string): string {
  return label.replace(/\s*\(.*\)$/, '').trim()
}

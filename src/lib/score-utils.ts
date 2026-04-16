/**
 * Shared score color/label/verdict utilities for recruitment components.
 * All score values are percentages (0–100) unless noted otherwise.
 */

/** Text color class for a percentage score. */
export function scoreColor(v: number | null): string {
  if (v == null) return 'text-muted-foreground'
  if (v >= 70) return 'text-green-500'
  if (v >= 40) return 'text-amber-500'
  return 'text-red-500'
}

/** Background color class for a percentage score tile. */
export function scoreBg(v: number | null): string {
  if (v == null) return 'bg-muted/30'
  if (v >= 70) return 'bg-green-500/10'
  if (v >= 40) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

/** Human-readable label for a percentage score. */
export function scoreLabel(v: number | null): string {
  if (v == null) return '\u2014'
  if (v >= 70) return 'Excellent'
  if (v >= 40) return 'Bon'
  return 'Faible'
}

/** Verdict computed from poste + equipe percentage scores. */
export function verdictFromScores(
  poste: number | null,
  equipe: number | null,
): { label: string; color: string } | null {
  if (poste == null && equipe == null) return null
  const values = [poste, equipe].filter((v): v is number => v != null)
  if (values.length === 0) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean >= 80) return { label: 'Excellent fit', color: 'bg-green-600 text-white' }
  if (mean >= 65) return { label: 'Bon potentiel', color: 'bg-sky-600 text-white' }
  if (mean >= 45) return { label: 'A creuser', color: 'bg-amber-600 text-white' }
  return { label: 'Risque', color: 'bg-red-600 text-white' }
}

import { cn } from '@/lib/utils'

/**
 * Small color-coded outcome pill used by EntretienFiche (go/caution/no_go),
 * AboroFiche (compatible/reserve/non_compatible), and SkillRadarComplete
 * (go/caution/no_go).
 *
 * The classes mirror the v4.6 editorial language: 15% tinted bg, hint
 * ring, foreground colour pinned to the family. Dark-mode aware.
 */

export type Verdict = 'go' | 'caution' | 'no_go' | 'compatible' | 'reserve' | 'non_compatible'

const VERDICT_LABEL: Record<Verdict, string> = {
  go: '✓ Go',
  caution: '⚠ À surveiller',
  no_go: '✗ No-go',
  compatible: '✓ Compatible',
  reserve: '⚠ Réservé',
  non_compatible: '✗ Non compatible',
}

const VERDICT_TONE: Record<Verdict, string> = {
  go: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30',
  compatible: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30',
  caution: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30',
  reserve: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30',
  no_go: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30',
  non_compatible: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30',
}

export function VerdictPill({ value, className }: { value: Verdict; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-tight',
        VERDICT_TONE[value],
        className,
      )}
    >
      {VERDICT_LABEL[value]}
    </span>
  )
}

import { Badge } from '@/components/ui/badge'

/**
 * Rating chip for a single skill. Tint darkens with level so a recruiter
 * can scan "what is this person strong at" without reading the numbers:
 *   L4+  → primary-tinted (stands out)
 *   L3   → neutral border
 *   ≤L2  → muted (recedes)
 *
 * Used on the candidate profile hero's Top Skills strip and on the
 * /recruit pipeline candidature row preview.
 */
export interface SkillPillProps {
  skillId: string
  skillLabel?: string
  rating: number
  className?: string
  /** Clip long labels to keep rows tight. Default true (pipeline row).
   *  Set false on the profile hero where space is ample and full
   *  labels matter — recruiters can't filter on half-truncated text. */
  truncate?: boolean
}

export default function SkillPill({ skillId, skillLabel, rating, className, truncate = true }: SkillPillProps) {
  const label = skillLabel ?? skillId
  // Level-based tone — stays calm, no rainbow.
  const tone = rating >= 4
    ? 'border-primary/30 bg-primary/15 text-primary'
    : rating >= 3
      ? 'border-border bg-muted text-foreground'
      : 'border-border/50 bg-muted/50 text-muted-foreground'

  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-medium tabular-nums ${tone} ${className ?? ''}`}
    >
      <span className={truncate ? 'truncate max-w-[140px]' : ''}>{label}</span>
      <span className="ml-1 opacity-80">L{rating}</span>
    </Badge>
  )
}

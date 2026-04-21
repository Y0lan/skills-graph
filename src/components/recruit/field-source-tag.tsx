import type { ProfileField } from './field-provenance-tooltip'

/**
 * Tiny provenance indicator. Shows nothing for the default case (CV), a
 * muted "L" when the field was extracted from the lettre de motivation,
 * or "M" when a recruiter overrode it manually. That's the only
 * provenance signal recruiters asked for — everything else (confidence,
 * run id, lock, history) is power-user noise and lives elsewhere.
 */
export interface FieldSourceTagProps {
  field: Pick<ProfileField<unknown>, 'sourceDoc'>
  className?: string
}

export default function FieldSourceTag({ field, className }: FieldSourceTagProps) {
  if (field.sourceDoc !== 'lettre' && field.sourceDoc !== 'human') return null
  const label = field.sourceDoc === 'lettre' ? 'LM' : 'Manuel'
  const title = field.sourceDoc === 'lettre' ? 'Source : lettre de motivation' : 'Source : saisie manuelle'
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center text-[9px] font-semibold tracking-wide px-1.5 h-3.5 rounded bg-muted text-muted-foreground align-middle ${className ?? ''}`}
    >
      {label}
    </span>
  )
}

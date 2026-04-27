import type { EventCategory } from '@/lib/recruitment-events'

/**
 * Filter chips above the historique timeline.
 *
 * Lightweight client-side filter — events are already partitioned by
 * `eventCategory()` in src/lib/recruitment-events.ts. This component
 * just renders the chip row; the persisted state lives in the
 * `useTimelineFilter` hook in `src/hooks/use-timeline-filter.ts`.
 *
 * Filter values:
 *  - 'all' — pass everything through (default)
 *  - 'transitions' / 'emails' / 'documents' / 'notes' — only that
 *    category. (We collapse 'other' / 'entretien' into the parent
 *    categories upstream so the chip set stays tight.)
 */
export type TimelineFilter = EventCategory | 'all'

const CHIPS: { value: TimelineFilter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'transitions', label: 'Transitions' },
  { value: 'notes', label: 'Notes' },
  { value: 'documents', label: 'Documents' },
  { value: 'emails', label: 'Emails' },
]

export const TIMELINE_FILTER_VALUES: ReadonlyArray<TimelineFilter> = CHIPS.map(c => c.value)

export interface TimelineFilterChipsProps {
  value: TimelineFilter
  onChange: (next: TimelineFilter) => void
}

export default function TimelineFilterChips({ value, onChange }: TimelineFilterChipsProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Filtrer la timeline">
      {CHIPS.map(c => (
        <button
          key={c.value}
          type="button"
          role="tab"
          aria-selected={value === c.value}
          onClick={() => onChange(c.value)}
          className={
            value === c.value
              ? 'rounded-full px-2.5 py-1 text-[11px] font-medium bg-primary/15 text-primary border border-primary/30'
              : 'rounded-full px-2.5 py-1 text-[11px] font-medium bg-muted/40 text-muted-foreground border border-transparent hover:border-border'
          }
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

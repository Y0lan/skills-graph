import { Badge } from '@/components/ui/badge'

/**
 * Vertical timeline of career / education entries. One <ol> with a rail
 * running down the left margin and a dot per entry. Always visible —
 * never collapsed behind an accordion. Mobile stays full-width.
 *
 * Description is line-clamped to 3 lines on mobile so dense CVs don't
 * explode the layout; full text shows on wider viewports.
 */
export interface TimelineEntry {
  /** Primary heading — company for experience, school for education */
  primary: string | null
  /** Secondary line — role for experience, degree/field for education */
  secondary: string | null
  /** Date range text already formatted for display ("2022–présent") */
  dateRange: string | null
  /** Location or additional context */
  location?: string | null
  /** Paragraph of detail, optional */
  description?: string | null
  /** Technology / honor chips */
  tags?: string[]
}

export interface ExperienceTimelineProps {
  entries: TimelineEntry[]
  emptyLabel?: string
  className?: string
}

export default function ExperienceTimeline({
  entries,
  emptyLabel = 'Aucune entrée',
  className,
}: ExperienceTimelineProps) {
  if (entries.length === 0) {
    return <p className={`text-sm text-muted-foreground ${className ?? ''}`}>{emptyLabel}</p>
  }

  return (
    <ol className={`relative border-l border-border ml-2 space-y-5 ${className ?? ''}`}>
      {entries.map((entry, i) => {
        const isFirst = i === 0
        return (
          <li key={i} className="ml-4 relative">
            {/* Dot */}
            <span
              aria-hidden
              className={`absolute -left-[22px] top-1.5 h-3 w-3 rounded-full border-2 border-background ${
                isFirst ? 'bg-primary' : 'bg-muted-foreground/40'
              }`}
            />
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h4 className="text-sm font-semibold leading-tight">{entry.primary ?? '—'}</h4>
                {entry.dateRange ? (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">{entry.dateRange}</span>
                ) : null}
              </div>
              {entry.secondary || entry.location ? (
                <p className="text-xs text-muted-foreground">
                  {[entry.secondary, entry.location].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              {entry.description ? (
                <p className="text-xs text-foreground/80 line-clamp-3">{entry.description}</p>
              ) : null}
              {entry.tags && entry.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {entry.tags.map((t, j) => (
                    <Badge key={j} variant="outline" className="text-[10px] font-normal">{t}</Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

type Tone = 'neutral' | 'success' | 'warn' | 'urgent' | 'accent'

interface KpiCellProps {
  label: string
  sublabel?: string
  count: number
  tone?: Tone
  /** When true, the cell becomes a button target that toggles a filter. */
  interactive?: boolean
  /** Shown state for interactive cells (adds an inset border highlight). */
  active?: boolean
  onClick?: () => void
  icon?: ReactNode
}

/** Number-first dashboard KPI cell.
 *
 *  All cells share the same visual weight so the eye can scan the strip.
 *  Color is signal: non-zero triage counts glow rose / amber / orange so a
 *  recruiter picks up priority peripherally. Zeros go muted regardless of
 *  tone so a healthy pipeline reads calm, not noisy.
 */
export default function KpiCell({
  label, sublabel, count, tone = 'neutral', interactive, active, onClick, icon,
}: KpiCellProps) {
  const numColor =
    count === 0 ? 'text-muted-foreground/40'
    : tone === 'urgent' ? 'text-rose-500'
    : tone === 'warn' ? 'text-amber-500'
    : tone === 'accent' ? 'text-chart-2'
    : tone === 'success' ? 'text-emerald-500'
    : 'text-foreground'

  const body = (
    <div className={`relative flex flex-col gap-1 px-4 py-3 text-left ${active ? 'bg-muted/50' : ''}`}>
      {active && <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-primary" />}
      <div className="flex items-baseline gap-1.5">
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
        <span
          className={`text-3xl leading-none font-bold tabular-nums ${numColor}`}
          style={{ fontFamily: "'Raleway Variable', sans-serif" }}
        >
          {count}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground leading-tight">{label}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{sublabel}</p>}
      </div>
      {interactive && (
        <ChevronRight className="absolute top-3 right-3 h-3.5 w-3.5 text-muted-foreground/40 transition-opacity opacity-0 group-hover:opacity-100" />
      )}
    </div>
  )

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="group relative text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:bg-muted/40"
      >
        {body}
      </button>
    )
  }

  return body
}

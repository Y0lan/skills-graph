import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { STATUT_LABELS, STATUT_COLORS } from '@/lib/constants'
import { slaState } from '@/lib/sla'

export interface StatusChipProps {
  statut: string
  enteredStatusAt: string | null | undefined
  /** Render compact (no time-in-status text) — useful in dense lists. */
  compact?: boolean
}

function formatDays(days: number): string {
  if (days < 1) return 'aujourd’hui'
  if (days < 2) return '1j'
  return `${Math.round(days)}j`
}

export default function StatusChip({ statut, enteredStatusAt, compact }: StatusChipProps) {
  const sla = slaState(statut, enteredStatusAt)
  const colorClass = STATUT_COLORS[statut] ?? ''
  const label = STATUT_LABELS[statut] ?? statut

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help">
        <span
          className={`inline-flex items-center gap-1 ${sla.isBreached ? 'ring-1 ring-rose-400 ring-offset-1 ring-offset-background rounded' : ''}`}
        >
          <Badge className={`text-xs ${colorClass}`}>
            {label}
            {!compact && enteredStatusAt && (
              <span className="ml-1.5 opacity-75 tabular-nums text-[10px]">{formatDays(sla.daysInStatus)}</span>
            )}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs max-w-[240px]">
        <div>{label} — depuis {formatDays(sla.daysInStatus)}</div>
        {sla.slaDays !== Infinity && (
          <div className={sla.isBreached ? 'text-rose-400' : 'text-muted-foreground'}>
            {sla.isBreached
              ? `Dépassé de ${Math.round(sla.daysOver)}j (SLA ${sla.slaDays}j)`
              : `SLA ${sla.slaDays}j`}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

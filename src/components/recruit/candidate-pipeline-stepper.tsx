import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Check, X, SkipForward, HelpCircle } from 'lucide-react'
import { STATUT_LABELS, STATUT_COLORS, STATUT_DESCRIPTIONS, NEXT_ACTION, formatDateShort } from '@/lib/constants'
import type { CandidatureInfo, CandidatureEvent } from '@/hooks/use-candidate-data'

/** Pipeline column order — mirrors kanban-board.tsx */
const COLUMN_ORDER = [
  'postule',
  'preselectionne',
  'skill_radar_envoye',
  'skill_radar_complete',
  'entretien_1',
  'aboro',
  'entretien_2',
  'proposition',
  'embauche',
] as const

type StepState = 'done' | 'current' | 'upcoming' | 'skipped' | 'refused'

interface StepInfo {
  statut: string
  state: StepState
  date: string | null
}

function computeSteps(candidature: CandidatureInfo, events: CandidatureEvent[]): StepInfo[] {
  const currentStatut = candidature.statut
  const isRefused = currentStatut === 'refuse'

  // Build a set of statuses that were visited (have events)
  const visitedStatuts = new Set<string>()
  let lastStatutBeforeRefuse: string | null = null
  const datByStatut: Record<string, string> = {}

  for (const e of events) {
    if (e.statutTo) {
      visitedStatuts.add(e.statutTo)
      datByStatut[e.statutTo] = e.createdAt
      if (e.statutTo === 'refuse' && e.statutFrom) {
        lastStatutBeforeRefuse = e.statutFrom
      }
    }
  }

  const currentIndex = COLUMN_ORDER.indexOf(currentStatut as (typeof COLUMN_ORDER)[number])
  // For refused, find where the refusal happened
  const refuseExitIndex = isRefused && lastStatutBeforeRefuse
    ? COLUMN_ORDER.indexOf(lastStatutBeforeRefuse as (typeof COLUMN_ORDER)[number])
    : -1

  return COLUMN_ORDER.map((statut, i) => {
    const date = datByStatut[statut] ?? null

    if (isRefused) {
      if (i < refuseExitIndex) return { statut, state: 'done', date }
      if (i === refuseExitIndex) return { statut, state: 'refused', date }
      return { statut, state: 'upcoming', date: null }
    }

    if (statut === currentStatut) return { statut, state: 'current', date: date ?? candidature.createdAt }
    if (i < currentIndex) {
      // Check if this stage was skipped (not visited but we're past it)
      if (!visitedStatuts.has(statut)) return { statut, state: 'skipped', date: null }
      return { statut, state: 'done', date }
    }
    return { statut, state: 'upcoming', date: null }
  })
}

function getLastEvent(events: CandidatureEvent[]): string | null {
  if (events.length === 0) return null
  // The detail API returns events ORDER BY created_at ASC (oldest-first).
  // The old comment here claimed newest-first and used events[0] — which
  // froze "Dernier evenement" on the initial Postulé event forever. Sort
  // locally and pick the newest.
  const newest = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const label = newest.statutTo ? STATUT_LABELS[newest.statutTo] ?? newest.statutTo : newest.type
  const date = formatDateShort(newest.createdAt)
  const actor = newest.createdBy ? ` par ${newest.createdBy}` : ''
  return `${date} — ${label}${actor}`
}

export interface CandidatePipelineStepperProps {
  candidature: CandidatureInfo
  events: CandidatureEvent[]
}

export default function CandidatePipelineStepper({ candidature, events }: CandidatePipelineStepperProps) {
  const steps = computeSteps(candidature, events)
  const currentStepIndex = steps.findIndex(s => s.state === 'current' || s.state === 'refused')
  const lastEvent = getLastEvent(events)
  const nextAction = candidature.statut !== 'refuse' ? NEXT_ACTION[candidature.statut] : null

  return (
    <div className="space-y-3">
      {/* Desktop stepper */}
      <div className="hidden sm:block">
        <div className="flex items-center gap-0">
          {steps.map((step, i) => (
            <div key={step.statut} className="flex items-center flex-1 min-w-0">
              {/* Step circle */}
              <Tooltip>
                <TooltipTrigger>
                  <div className={`shrink-0 flex items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                    step.state === 'done'
                      ? 'h-6 w-6 bg-green-600 text-white'
                      : step.state === 'current'
                        ? 'h-7 w-7 ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary text-primary-foreground'
                        : step.state === 'refused'
                          ? 'h-6 w-6 bg-red-600 text-white'
                          : step.state === 'skipped'
                            ? 'h-6 w-6 border-2 border-dashed border-amber-500 text-amber-500'
                            : 'h-6 w-6 border-2 border-muted-foreground/30 text-muted-foreground/50'
                  }`}>
                    {step.state === 'done' && <Check className="h-3 w-3" />}
                    {step.state === 'current' && <span>{i + 1}</span>}
                    {step.state === 'refused' && <X className="h-3 w-3" />}
                    {step.state === 'skipped' && <SkipForward className="h-2.5 w-2.5" />}
                    {step.state === 'upcoming' && <span>{i + 1}</span>}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  <p className="font-medium">{STATUT_LABELS[step.statut] ?? step.statut}</p>
                  {step.date && <p className="text-muted-foreground">{formatDateShort(step.date)}</p>}
                  {step.state === 'skipped' && <p className="text-amber-500">Etape sautee</p>}
                </TooltipContent>
              </Tooltip>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${
                  step.state === 'done'
                    ? 'bg-green-600'
                    : step.state === 'refused'
                      ? 'bg-red-600'
                      : step.state === 'skipped'
                        ? 'border-t-2 border-dashed border-amber-500 h-0'
                        : 'bg-muted-foreground/20'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Labels under circles */}
        <div className="flex items-start gap-0 mt-1.5">
          {steps.map((step) => (
            <div key={step.statut} className="flex-1 min-w-0 text-center px-0.5">
              <p className={`text-[10px] leading-tight truncate ${
                step.state === 'current' ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}>
                {STATUT_LABELS[step.statut] ?? step.statut}
              </p>
              {step.date && step.state === 'current' && (
                <p className="text-[9px] text-muted-foreground mt-0.5">{formatDateShort(step.date)}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: compact view */}
      <div className="sm:hidden">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className={STATUT_COLORS[candidature.statut] ?? ''}>
            {STATUT_LABELS[candidature.statut] ?? candidature.statut}
          </Badge>
          <span className="text-xs text-muted-foreground tabular-nums">
            Etape {currentStepIndex + 1}/{COLUMN_ORDER.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              candidature.statut === 'refuse' ? 'bg-red-600' : 'bg-primary'
            }`}
            style={{ width: `${((currentStepIndex + 1) / COLUMN_ORDER.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Last event + next action + stages legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground items-center">
        {lastEvent && (
          <span>Dernier evenement : {lastEvent}</span>
        )}
        {nextAction && (
          <span className="text-primary font-medium">Action suivante : {nextAction}</span>
        )}
        <Tooltip>
          <TooltipTrigger className="inline-flex items-center gap-1 text-muted-foreground/70 hover:text-foreground cursor-help ml-auto">
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="text-[11px]">Légende des étapes</span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="w-80 max-w-[calc(100vw-2rem)] text-xs p-3 space-y-1.5">
            {/* Tooltip inverts the theme (bg-foreground + text-background), so
                text-muted-foreground renders dark-on-dark and becomes
                illegible. Use text-background with reduced opacity instead —
                it stays readable against the inverted bg. */}
            <p className="font-medium mb-1">Les 9 étapes du pipeline</p>
            {COLUMN_ORDER.map(s => (
              <div key={s} className="grid w-full min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <span className="font-medium">{STATUT_LABELS[s]}</span>
                <span className="min-w-0 break-words leading-snug text-background/80">{STATUT_DESCRIPTIONS[s]}</span>
              </div>
            ))}
            <div className="grid w-full min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2 pt-1 border-t border-background/20">
              <span className="font-medium text-red-300 dark:text-red-300">{STATUT_LABELS.refuse}</span>
              <span className="min-w-0 break-words leading-snug text-background/80">{STATUT_DESCRIPTIONS.refuse}</span>
            </div>
            <p className="pt-2 text-[11px] text-background/70 leading-snug">
              <strong className="text-background">Transitions :</strong> avance normale (« Action suivante »), saut (ex. « sauter Skill Radar envoyé »), annulation (dans les 10 min) ou refus.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

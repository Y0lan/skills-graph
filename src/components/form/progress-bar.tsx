import { cn } from '@/lib/utils'
import { Check, SkipForward } from 'lucide-react'

export interface StepInfo {
  label: string
  emoji: string
  ratedCount: number
  totalCount: number
  isSkipped: boolean
}

interface ProgressBarProps {
  currentStep: number
  steps: StepInfo[]
  onStepClick: (step: number) => void
}

export default function ProgressBar({
  currentStep,
  steps,
  onStepClick,
}: ProgressBarProps) {
  const completedSteps = steps.filter(
    (s) => s.isSkipped || s.ratedCount === s.totalCount,
  ).length
  const percent = Math.round((completedSteps / steps.length) * 100)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          Progression : {completedSteps}/{steps.length} catégories complétées
        </span>
        <span className="font-medium text-primary">{percent}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Step pills */}
      <div className="flex flex-wrap gap-1.5">
        {steps.map((stepInfo, i) => {
          const isActive = i === currentStep
          const isSkipped = stepInfo.isSkipped
          const isComplete =
            !isSkipped && stepInfo.ratedCount === stepInfo.totalCount
          // Show short label: first word only (or full if short)
          const shortLabel = stepInfo.label.split(/\s+/)[0]

          return (
            <button
              key={i}
              type="button"
              onClick={() => onStepClick(i)}
              title={stepInfo.label}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30'
                  : isSkipped
                    ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-400'
                    : isComplete
                      ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-current/10 text-[10px] font-bold leading-none">{i + 1}</span>
              <span className="max-w-[5rem] truncate">{shortLabel}</span>
              {stepInfo.isSkipped ? (
                <SkipForward className="h-3 w-3 shrink-0 opacity-60" />
              ) : isComplete ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : (
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    isActive ? 'text-primary-foreground/80' : 'opacity-60',
                  )}
                >
                  {stepInfo.ratedCount}/{stepInfo.totalCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

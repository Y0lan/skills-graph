import { cn } from '@/lib/utils'

interface ProgressBarProps {
  currentStep: number
  totalSteps: number
  categoryLabel: string
}

export default function ProgressBar({ currentStep, totalSteps, categoryLabel }: ProgressBarProps) {
  const percent = ((currentStep + 1) / totalSteps) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          Step {currentStep + 1}/{totalSteps} — {categoryLabel}
        </span>
        <span className="text-muted-foreground">{Math.round(percent)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn('h-full rounded-full bg-primary transition-all duration-300')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

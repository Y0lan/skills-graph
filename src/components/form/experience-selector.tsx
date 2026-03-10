import { cn } from '@/lib/utils'
import { experienceScale } from '@/data/experience-scale'

interface ExperienceSelectorProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

export default function ExperienceSelector({
  value,
  onChange,
  disabled,
}: ExperienceSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {experienceScale.map((level) => {
        const isSelected = value === level.value
        return (
          <button
            key={level.value}
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium transition-all duration-150',
              'disabled:pointer-events-none disabled:opacity-50',
              isSelected
                ? 'border-transparent bg-sky-500 text-white shadow-sm dark:bg-sky-600 dark:text-white'
                : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
            onClick={() => onChange(level.value)}
          >
            {level.shortLabel}
          </button>
        )
      })}
    </div>
  )
}

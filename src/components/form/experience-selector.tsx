import { Button } from '@/components/ui/button'
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
      {experienceScale.map((level) => (
        <Button
          key={level.value}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            'h-7 px-2 text-xs',
            value === level.value &&
              'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
          onClick={() => onChange(level.value)}
        >
          {level.shortLabel}
        </Button>
      ))}
    </div>
  )
}

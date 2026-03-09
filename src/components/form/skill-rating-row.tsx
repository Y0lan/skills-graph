import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Skill } from '@/data/skill-catalog'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface SkillRatingRowProps {
  skill: Skill
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

const levelButtons = [
  { value: 0, label: '?', color: 'bg-muted text-muted-foreground hover:bg-muted/80' },
  { value: 1, label: '1', color: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900' },
  { value: 2, label: '2', color: 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:hover:bg-orange-900' },
  { value: 3, label: '3', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:hover:bg-yellow-900' },
  { value: 4, label: '4', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900' },
  { value: 5, label: '5', color: 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900' },
]

export default function SkillRatingRow({ skill, value, onChange, disabled }: SkillRatingRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-1 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium"
        >
          <span className="truncate">{skill.label}</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
        <div className="flex gap-1">
          {levelButtons.map((btn) => (
            <button
              key={btn.value}
              type="button"
              disabled={disabled}
              title={`${skill.descriptors[btn.value]?.label}: ${skill.descriptors[btn.value]?.description}`}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                'disabled:pointer-events-none disabled:opacity-50',
                value === btn.value && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                value === btn.value && btn.color,
              )}
              onClick={() => onChange(btn.value)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {skill.descriptors.map((desc) => (
            <div key={desc.level} className="flex gap-2">
              <span className="w-6 shrink-0 font-bold">{desc.level === 0 ? '?' : desc.level}</span>
              <span>
                <strong>{desc.label}:</strong> {desc.description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

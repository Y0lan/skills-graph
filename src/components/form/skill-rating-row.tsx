import { cn } from '@/lib/utils'
import type { Skill } from '@/data/skill-catalog'
import { Check } from 'lucide-react'

interface SkillRatingRowProps {
  skill: Skill
  value: number | undefined
  onChange: (value: number) => void
  disabled?: boolean
  showError?: boolean
}

/**
 * Adaptive "Soft-Glow" color system per skill level.
 * Light: tinted bg + high-contrast text (700)
 * Dark:  deep tint at low opacity + vibrant accent (300) + defined border (400/50%)
 */
const levels = [
  { // 0 — Inconnu
    glow: 'bg-zinc-500/[0.06] dark:bg-zinc-400/[0.08]',
    border: 'border-l-zinc-400 dark:border-l-zinc-400',
    ring: 'ring-zinc-300 dark:ring-zinc-500/40',
    indicator: 'bg-zinc-500 border-zinc-500 dark:bg-zinc-400 dark:border-zinc-400',
    badge: 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-600/50',
    badgeActive: 'bg-zinc-500 text-white border-zinc-500 dark:bg-zinc-400 dark:text-zinc-950 dark:border-zinc-400',
  },
  { // 1 — Notions
    glow: 'bg-red-500/[0.05] dark:bg-red-400/[0.07]',
    border: 'border-l-red-500 dark:border-l-red-400',
    ring: 'ring-red-200 dark:ring-red-500/30',
    indicator: 'bg-red-500 border-red-500 dark:bg-red-400 dark:border-red-400',
    badge: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-400/50',
    badgeActive: 'bg-red-500 text-white border-red-500 dark:bg-red-500 dark:text-white dark:border-red-500',
  },
  { // 2 — Guidé
    glow: 'bg-orange-500/[0.05] dark:bg-orange-400/[0.07]',
    border: 'border-l-orange-500 dark:border-l-orange-400',
    ring: 'ring-orange-200 dark:ring-orange-500/30',
    indicator: 'bg-orange-500 border-orange-500 dark:bg-orange-400 dark:border-orange-400',
    badge: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-400/50',
    badgeActive: 'bg-orange-500 text-white border-orange-500 dark:bg-orange-500 dark:text-white dark:border-orange-500',
  },
  { // 3 — Autonome
    glow: 'bg-amber-500/[0.05] dark:bg-amber-400/[0.07]',
    border: 'border-l-amber-500 dark:border-l-amber-400',
    ring: 'ring-amber-200 dark:ring-amber-500/30',
    indicator: 'bg-amber-500 border-amber-500 dark:bg-amber-400 dark:border-amber-400',
    badge: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-400/50',
    badgeActive: 'bg-amber-500 text-white border-amber-500 dark:bg-amber-500 dark:text-white dark:border-amber-500',
  },
  { // 4 — Avancé
    glow: 'bg-sky-500/[0.05] dark:bg-sky-400/[0.07]',
    border: 'border-l-sky-500 dark:border-l-sky-400',
    ring: 'ring-sky-200 dark:ring-sky-500/30',
    indicator: 'bg-sky-500 border-sky-500 dark:bg-sky-400 dark:border-sky-400',
    badge: 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-400/50',
    badgeActive: 'bg-sky-500 text-white border-sky-500 dark:bg-sky-400 dark:text-white dark:border-sky-400',
  },
  { // 5 — Expert
    glow: 'bg-emerald-500/[0.05] dark:bg-emerald-400/[0.07]',
    border: 'border-l-emerald-500 dark:border-l-emerald-400',
    ring: 'ring-emerald-200 dark:ring-emerald-500/30',
    indicator: 'bg-emerald-500 border-emerald-500 dark:bg-emerald-400 dark:border-emerald-400',
    badge: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-400/50',
    badgeActive: 'bg-emerald-500 text-white border-emerald-500 dark:bg-emerald-400 dark:text-white dark:border-emerald-400',
  },
]

export default function SkillRatingRow({ skill, value, onChange, disabled, showError }: SkillRatingRowProps) {
  const hasError = showError && value === undefined

  return (
    <div
      data-skill={skill.id}
      className={cn(
        'space-y-1.5 rounded-lg p-3 -mx-3 transition-all duration-200',
        hasError && 'bg-red-500/[0.06] border border-red-400/40 dark:bg-red-500/[0.08] dark:border-red-500/30',
      )}
    >
      <h3 className="text-sm font-semibold tracking-tight">{skill.label}</h3>
      <div className="grid gap-1.5">
        {skill.descriptors.map((desc) => {
          const isSelected = value === desc.level
          const config = levels[desc.level]

          return (
            <button
              key={desc.level}
              type="button"
              disabled={disabled}
              onClick={() => onChange(desc.level)}
              className={cn(
                'group relative flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left',
                'transition-all duration-200 ease-out',
                'disabled:pointer-events-none disabled:opacity-50',
                isSelected
                  ? cn(
                      config.glow,
                      'border-l-[3px]',
                      config.border,
                      'ring-1',
                      config.ring,
                    )
                  : cn(
                      'border-l-[3px] border-l-transparent',
                      'border-border/50 dark:border-border/30',
                      'hover:border-border/80 hover:bg-accent/40 dark:hover:border-border/50 dark:hover:bg-accent/20',
                    ),
              )}
            >
              {/* Radio check indicator */}
              <span
                className={cn(
                  'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
                  isSelected
                    ? cn(config.indicator, 'scale-110')
                    : 'border-border dark:border-border/60 group-hover:border-muted-foreground/50',
                )}
              >
                {isSelected && (
                  <Check className="h-2.5 w-2.5 text-white dark:text-zinc-950" strokeWidth={3.5} />
                )}
              </span>

              {/* Level badge */}
              <span
                className={cn(
                  'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition-all duration-200',
                  isSelected ? config.badgeActive : config.badge,
                )}
              >
                {desc.level === 0 ? '?' : desc.level}
              </span>

              {/* Content */}
              <div className="min-w-0">
                <span
                  className={cn(
                    'text-sm font-medium transition-colors duration-200',
                    isSelected ? 'text-foreground' : 'text-foreground/75',
                  )}
                >
                  {desc.label}
                </span>
                <p
                  className={cn(
                    'text-xs leading-relaxed transition-colors duration-200',
                    isSelected ? 'text-foreground/60' : 'text-muted-foreground',
                  )}
                >
                  {desc.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

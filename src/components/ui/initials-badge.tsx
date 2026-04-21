/**
 * Circular avatar placeholder showing 1-2 initials on a deterministic
 * pastel background hashed from the name. Falls back to "?" when name
 * is empty.
 *
 * v1 product rule: no photos. When/if photo extraction ships (future
 * PR), an optional `photoUrl` prop renders an <img> instead and falls
 * back to initials on load error.
 */

export interface InitialsBadgeProps {
  name: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  photoUrl?: string | null
  className?: string
}

const PASTEL_TONES: Array<{ bg: string; text: string }> = [
  { bg: 'bg-sky-500/15', text: 'text-sky-700 dark:text-sky-300' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300' },
  { bg: 'bg-indigo-500/15', text: 'text-indigo-700 dark:text-indigo-300' },
  { bg: 'bg-teal-500/15', text: 'text-teal-700 dark:text-teal-300' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-700 dark:text-fuchsia-300' },
]

const SIZE_CLASSES: Record<NonNullable<InitialsBadgeProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-lg',
}

export function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]!.toUpperCase()
  // First + last to handle "Marie-Claire de Lafayette" correctly.
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase()
}

/** Deterministic hash → pastel tone index. Same name → same tone across sessions. */
export function getToneIndex(name: string | null | undefined): number {
  if (!name) return 0
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0 // force int32
  }
  return Math.abs(hash) % PASTEL_TONES.length
}

export default function InitialsBadge({ name, size = 'md', photoUrl, className }: InitialsBadgeProps) {
  const initials = getInitials(name)
  const tone = PASTEL_TONES[getToneIndex(name)]
  const sizeClass = SIZE_CLASSES[size]

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name ?? 'Candidat'}
        loading="lazy"
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className ?? ''}`}
        onError={(e) => {
          // Fallback to initials on error
          const target = e.currentTarget
          target.style.display = 'none'
          const sibling = target.nextElementSibling as HTMLElement | null
          if (sibling) sibling.style.display = 'inline-flex'
        }}
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={name ?? 'Candidat'}
      className={`${sizeClass} ${tone.bg} ${tone.text} rounded-full inline-flex items-center justify-center font-semibold shrink-0 ${className ?? ''}`}
    >
      {initials}
    </span>
  )
}

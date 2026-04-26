import { useState, useEffect, useCallback } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Star a candidature to add it to the user's saved-candidates list.
 * Optimistic UI: filled state flips immediately on click, network call
 * follows; on failure we roll back + toast. Mirrors the LinkedIn /
 * Notion-style "save" affordance — the user's input is taken at face
 * value first, drift only surfaces on actual server error.
 */
export interface StarToggleProps {
  candidatureId: string
  initialActive?: boolean
  onChange?: (active: boolean) => void
  size?: 'sm' | 'md'
  className?: string
}

export default function StarToggle({
  candidatureId,
  initialActive = false,
  onChange,
  size = 'md',
  className,
}: StarToggleProps) {
  const [active, setActive] = useState(initialActive)
  const [pending, setPending] = useState(false)

  // Stay in sync if the parent hands us a fresh value (e.g. after a
  // /shortlist refetch). Avoids flicker on remount-then-real-state.
  useEffect(() => { setActive(initialActive) }, [initialActive])

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return

    const next = !active
    setActive(next)
    setPending(true)
    try {
      const res = await fetch(
        `/api/recruitment/shortlist${next ? '' : `/${candidatureId}`}`,
        next
          ? {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ candidatureId }),
            }
          : { method: 'DELETE', credentials: 'include' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      onChange?.(next)
    } catch (err) {
      setActive(!next)
      toast.error(err instanceof Error ? err.message : 'Échec de la sauvegarde')
    } finally {
      setPending(false)
    }
  }, [active, candidatureId, onChange, pending])

  const px = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      aria-label={active ? 'Retirer des candidats sauvegardés' : 'Sauvegarder ce candidat'}
      title={active ? 'Sauvegardé — cliquer pour retirer' : 'Sauvegarder pour plus tard'}
      className={`inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-muted ${pending ? 'opacity-60' : ''} ${className ?? ''}`}
    >
      <Star className={`${px} ${active ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
    </button>
  )
}

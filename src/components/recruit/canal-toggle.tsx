import { useState, useCallback, useEffect } from 'react'
import { Building2, Globe, UserSquare, Users, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * 4-state canal picker for a candidature.
 *
 * Demo ask (April 2026, refined): Yolan wants to flag a candidate as
 * coming from a recruitment cabinet at the top of the profile, AND
 * distinguish the other three sources (sinapse.nc website, candidature
 * directe, réseau) — not just "cabinet vs not".
 *
 * Schema: `candidatures.canal` is CHECK-constrained to the 4 values.
 * The PATCH endpoint accepts any of them; this picker just exposes
 * them as a compact dropdown that fits inline in the header.
 *
 * Design choices:
 * - Compact `<Select>` matching the pipeline filter chip style. Lucide
 *   icons keep the active value scannable at a glance (no emojis per
 *   the existing UI convention).
 * - Optimistic update; rollback + toast on server error.
 * - useEffect re-syncs `optimistic` from the prop so an SSE
 *   `canal_changed` event from another tab refreshes this one\'s
 *   visible state without losing user input.
 */

type Canal = 'cabinet' | 'site' | 'candidature_directe' | 'reseau'

const CANAL_OPTIONS: { value: Canal; label: string; Icon: typeof Building2 }[] = [
  { value: 'cabinet',             label: 'Cabinet',             Icon: Building2 },
  { value: 'site',                label: 'sinapse.nc',          Icon: Globe },
  { value: 'candidature_directe', label: 'Candidature directe', Icon: UserSquare },
  { value: 'reseau',              label: 'Réseau',              Icon: Users },
]

const ICON_BY_CANAL: Record<Canal, typeof Building2> = Object.fromEntries(
  CANAL_OPTIONS.map(o => [o.value, o.Icon])
) as Record<Canal, typeof Building2>

const LABEL_BY_CANAL: Record<Canal, string> = Object.fromEntries(
  CANAL_OPTIONS.map(o => [o.value, o.label])
) as Record<Canal, string>

export interface CanalToggleProps {
  candidatureId: string
  canal: Canal
  /** Called after the server confirms the change (used to refresh
   *  the parent candidature object). */
  onCanalChanged?: (newCanal: Canal) => void
}

export default function CanalToggle({ candidatureId, canal, onCanalChanged }: CanalToggleProps) {
  const [optimistic, setOptimistic] = useState<Canal>(canal)
  const [submitting, setSubmitting] = useState(false)

  // Re-sync to the latest prop value when the parent refetches (e.g.
  // after a canal_changed SSE event from another tab). Prevents a
  // stale tab\'s optimistic state from overwriting a newer canal
  // value (codex post-deploy P2).
  useEffect(() => {
    setOptimistic(canal)
  }, [canal])

  const patch = useCallback(async (target: Canal) => {
    setSubmitting(true)
    setOptimistic(target)
    try {
      const r = await fetch(
        `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/canal`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canal: target }),
        },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${r.status}`)
      }
      const data = await r.json() as { canal: Canal; changed: boolean }
      onCanalChanged?.(data.canal)
    } catch (err) {
      // Rollback optimistic UI
      setOptimistic(canal)
      toast.error(err instanceof Error ? err.message : 'Erreur — canal non modifié')
    } finally {
      setSubmitting(false)
    }
  }, [candidatureId, canal, onCanalChanged])

  const onChange = useCallback((next: Canal | null) => {
    if (!next || next === optimistic) return
    void patch(next)
  }, [optimistic, patch])

  const ActiveIcon = ICON_BY_CANAL[optimistic]

  return (
    <Select value={optimistic} onValueChange={onChange} disabled={submitting}>
      <SelectTrigger
        className="h-7 px-2.5 text-xs gap-1.5 border-border/60 bg-muted/20 hover:bg-muted/30 transition-colors"
        aria-label="Canal d'acquisition du candidat"
      >
        {submitting ? (
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        ) : (
          <ActiveIcon className="h-3 w-3 shrink-0" />
        )}
        <SelectValue>{LABEL_BY_CANAL[optimistic]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CANAL_OPTIONS.map(({ value, label, Icon }) => (
          <SelectItem key={value} value={value}>
            <span className="inline-flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

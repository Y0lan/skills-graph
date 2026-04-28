import { useState, useCallback, useEffect } from 'react'
import { Building2, UserSquare, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * Cabinet vs Direct toggle for a candidature.
 *
 * Demo ask (April 2026): "tu peux ajouter une case à coché pour qu'on
 * puisse noter les candidats comme venant d'un cabinet de recrutement
 * ou pas au top d'un profil ?". Yolan wants this prominently at the
 * top of the candidature header, not buried in the meta line.
 *
 * Design choices:
 * - Two-segment lucide-icon toggle (no emojis, codex P19 — match the
 *   rest of the recruit UI).
 * - Toggling cabinet → off remembers the prior canal in component
 *   state so we can restore site/réseau/candidature_directe rather
 *   than always defaulting (codex P12).
 * - Optimistic update; on server error we toast + roll back.
 *
 * The PATCH endpoint emits a `canal_change` event on the SSE bus so
 * the pipeline page picks up the change live.
 */

type Canal = 'cabinet' | 'site' | 'candidature_directe' | 'reseau'

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
  // Remember the prior non-cabinet canal so toggling cabinet → off can
  // restore it. If we never saw a non-cabinet value, default to
  // candidature_directe (the canonical "not from a cabinet" bucket).
  const [priorNonCabinet, setPriorNonCabinet] = useState<Exclude<Canal, 'cabinet'>>(
    canal !== 'cabinet' ? canal : 'candidature_directe'
  )

  // Re-sync to the latest prop value when the parent refetches (e.g.
  // after a canal_changed SSE event from another tab). Without this,
  // a stale tab\'s optimistic state could overwrite a newer canal
  // value with its old fallback (codex post-deploy P2).
  useEffect(() => {
    setOptimistic(canal)
    if (canal !== 'cabinet') {
      setPriorNonCabinet(canal)
    }
  }, [canal])

  const isCabinet = optimistic === 'cabinet'

  const patch = useCallback(async (next: Canal) => {
    setSubmitting(true)
    setOptimistic(next)
    try {
      const r = await fetch(
        `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/canal`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canal: next }),
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

  const onClickCabinet = useCallback(() => {
    if (submitting || isCabinet) return
    // Going to cabinet: remember the current canal as the fallback for
    // a future toggle-off (so site stays site, réseau stays réseau).
    // The early return guarantees optimistic !== 'cabinet' here.
    setPriorNonCabinet(optimistic as Exclude<Canal, 'cabinet'>)
    void patch('cabinet')
  }, [submitting, isCabinet, optimistic, patch])

  const onClickDirect = useCallback(() => {
    if (submitting || !isCabinet) return
    void patch(priorNonCabinet)
  }, [submitting, isCabinet, priorNonCabinet, patch])

  return (
    <div
      className="inline-flex items-center rounded-md border border-border/60 bg-muted/20 p-0.5 text-xs"
      role="group"
      aria-label="Canal d'acquisition du candidat"
    >
      <button
        type="button"
        onClick={onClickCabinet}
        disabled={submitting}
        aria-pressed={isCabinet}
        aria-label="Cabinet de recrutement"
        title="Candidat venu via un cabinet de recrutement"
        className={cn(
          'inline-flex items-center gap-1 rounded px-2 py-1 transition-colors',
          isCabinet
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {submitting && isCabinet ? <Loader2 className="h-3 w-3 animate-spin" /> : <Building2 className="h-3 w-3" />}
        Cabinet
      </button>
      <button
        type="button"
        onClick={onClickDirect}
        disabled={submitting}
        aria-pressed={!isCabinet}
        aria-label="Direct (site, candidature directe ou réseau)"
        title="Candidat venu en direct (site, candidature directe ou réseau)"
        className={cn(
          'inline-flex items-center gap-1 rounded px-2 py-1 transition-colors',
          !isCabinet
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {submitting && !isCabinet ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserSquare className="h-3 w-3" />}
        Direct
      </button>
    </div>
  )
}

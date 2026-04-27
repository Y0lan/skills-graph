import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Statut } from '@/lib/constants'
import { useStageFicheData } from '@/hooks/use-stage-fiche-data'
import {
  patchStageFicheData,
  persistDraft,
  readDraft,
  clearDraft,
  shouldRestoreDraft,
  FicheConflictError,
} from '@/lib/stage-fiches/client'
import { STAGE_FICHE_META } from '@/lib/stage-fiches/registry'
import { EntretienFiche, type EntretienFicheValues } from './entretien-fiche'
import { AboroFiche, type AboroFicheValues } from './aboro-fiche'

/**
 * Dispatcher: takes a (candidatureId, stage) and renders the matching
 * fiche component, wired to the GET/PATCH endpoints with optimistic
 * lock + draft persistence.
 *
 * v5.1 ships entretien (used by entretien_1 + entretien_2) and aboro.
 * Other stages: graceful no-op (returns null) so the StageFiche can be
 * dropped inside every stage block of the timeline accordion without
 * an `if (stage in fiches)` guard at the call site.
 */

export interface StageFicheProps {
  candidatureId: string
  stage: Statut
  /** Bumped by the workspace when SSE delivers `stage_data_changed`
   *  for this (candidature, stage) so the underlying query refetches. */
  refetchSignal?: number
}

const SUPPORTED: ReadonlySet<Statut> = new Set<Statut>(['entretien_1', 'entretien_2', 'aboro'])

export function StageFiche({ candidatureId, stage, refetchSignal }: StageFicheProps) {
  const supported = SUPPORTED.has(stage)
  const meta = STAGE_FICHE_META[stage]
  const { data, updatedAt, updatedBy, refetch, error } = useStageFicheData(
    candidatureId,
    supported ? stage : null,
  )
  const [draftBanner, setDraftBanner] = useState<React.ReactNode>(null)
  const lastRefetchSignal = useRef<number | undefined>(refetchSignal)

  // External refetch: bump the hook tick when the SSE handler fires.
  useEffect(() => {
    if (refetchSignal === undefined) return
    if (refetchSignal === lastRefetchSignal.current) return
    lastRefetchSignal.current = refetchSignal
    refetch()
  }, [refetchSignal, refetch])

  // Restore a saved draft on mount / candidature switch.
  useEffect(() => {
    if (!supported) return
    const draft = readDraft(candidatureId, stage)
    if (shouldRestoreDraft(draft, updatedAt) && draft) {
      setDraftBanner(
        <DraftBanner
          onResume={() => setDraftBanner(null)}
          onDiscard={() => { clearDraft(candidatureId, stage); setDraftBanner(null); refetch() }}
        />,
      )
    } else {
      setDraftBanner(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatureId, stage, updatedAt])

  const metaLine = useMemo(() => {
    if (!updatedAt || !updatedBy) return null
    return `Modifié par ${updatedBy} · ${new Date(updatedAt + 'Z').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
  }, [updatedAt, updatedBy])

  if (!supported) return null
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300">
        Erreur lors du chargement de la fiche : {error}
      </div>
    )
  }

  async function handleSave(patch: Record<string, unknown>) {
    try {
      const r = await patchStageFicheData(candidatureId, stage, patch, { ifMatch: updatedAt })
      clearDraft(candidatureId, stage)
      setDraftBanner(null)
      // Refetch will pick up the latest state via the SSE handler too,
      // but invoking refetch() here makes single-tab UX feel instant.
      refetch()
      toast.success('Fiche enregistrée', {
        description: meta?.title ?? stage,
        duration: 1800,
      })
      return r
    } catch (err) {
      if (err instanceof FicheConflictError) {
        toast.error('Conflit de modifications', {
          description: 'Quelqu\'un d\'autre a modifié cette fiche. Recharge pour voir la version la plus récente.',
          action: { label: 'Recharger', onClick: () => refetch() },
          duration: 6000,
        })
        refetch()
      } else {
        // Persist a draft so the recruiter doesn't lose typing on a
        // network blip / GKE recreate.
        persistDraft(candidatureId, stage, patch, updatedAt)
      }
      throw err
    }
  }

  function handleLocalChange(values: Record<string, unknown>) {
    persistDraft(candidatureId, stage, values, updatedAt)
  }

  // The per-stage component owns a typed shape; this dispatcher only
  // sees the raw record from the API. Type-safety is enforced where it
  // matters (Zod parse on the wire + the merged-shape re-validation on
  // the server). The `void` adapter discards the FicheResponse return
  // so the per-fiche `onSave` can stay as `Promise<void>`.
  async function saveAdapter(next: Record<string, unknown>): Promise<void> {
    await handleSave(next)
  }

  if (stage === 'entretien_1' || stage === 'entretien_2') {
    return (
      <EntretienFiche
        eyebrow={meta.eyebrow}
        title={meta.title}
        data={data as EntretienFicheValues}
        metaLine={metaLine}
        draftBanner={draftBanner}
        onSave={(next) => saveAdapter(next as Record<string, unknown>)}
        onLocalChange={(next) => handleLocalChange(next as Record<string, unknown>)}
      />
    )
  }
  if (stage === 'aboro') {
    return (
      <AboroFiche
        eyebrow={meta.eyebrow}
        title={meta.title}
        data={data as AboroFicheValues}
        metaLine={metaLine}
        draftBanner={draftBanner}
        onSave={(next) => saveAdapter(next as Record<string, unknown>)}
        onLocalChange={(next) => handleLocalChange(next as Record<string, unknown>)}
      />
    )
  }
  return null
}

function DraftBanner({ onResume, onDiscard }: { onResume: () => void; onDiscard: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
      <span>📝 Brouillon récupéré — tu avais commencé à éditer cette fiche.</span>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          className="px-2 py-0.5 rounded text-[11px] uppercase tracking-wide hover:bg-amber-500/15"
          onClick={onResume}
        >
          Reprendre
        </button>
        <button
          type="button"
          className="px-2 py-0.5 rounded text-[11px] uppercase tracking-wide hover:bg-amber-500/15"
          onClick={onDiscard}
        >
          Ignorer
        </button>
      </div>
    </div>
  )
}

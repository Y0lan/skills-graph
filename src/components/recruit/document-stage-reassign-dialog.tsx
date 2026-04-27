import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Loader2, FolderInput } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { STATUT_LABELS } from '@/lib/constants'
import type { CandidatureDocument, CandidatureEvent } from '@/hooks/use-candidate-data'

/** Pipeline stages a document can be attached to. We omit `refuse`
 *  because docs uploaded after a rejection are rare and don't benefit
 *  from stage attribution. `embauche` stays in — signed contracts and
 *  onboarding paperwork often land there. */
const ASSIGNABLE_STAGES = [
  'postule',
  'preselectionne',
  'skill_radar_envoye',
  'skill_radar_complete',
  'entretien_1',
  'aboro',
  'entretien_2',
  'proposition',
  'embauche',
]

/**
 * Reassign a document to a different pipeline stage. Backed by the v4.5
 * PATCH `/candidature-documents/:id/event` endpoint, which resolves the
 * canonical event_id for the chosen stage on the server side.
 *
 * Why a dedicated dialog instead of an inline dropdown: the choice is
 * infrequent + needs context (the recruiter typically wants to read
 * the doc + the surrounding stage events first). A dialog also gives
 * us room to grow this into a richer "Détacher / Déplacer / Voir
 * autres versions" surface in v6.
 */
export interface DocumentStageReassignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  doc: CandidatureDocument | null
  /** Caller updates its local state with the new event_id when the
   *  PATCH succeeds, so the doc visually re-flows into the right stage
   *  group without a refetch. */
  onReassigned: (docId: string, eventId: number | null) => void
  /** v5.1.x A.9 (issue 10 + codex R4): the candidature's events list,
   *  used to derive the set of stages this candidate has actually
   *  reached. Without this, the dialog showed every stage in
   *  ASSIGNABLE_STAGES even when the candidate hadn't gone past
   *  Présélectionné — recruiters could re-attach a doc to a future
   *  stage that didn't exist in their history. Reverted stages stay
   *  in the dropdown (a doc was uploaded WHILE briefly at a future
   *  stage; the recruiter still needs that option). */
  events: CandidatureEvent[]
  /** Always reachable (the candidature is currently at this stage). */
  currentStatut: string
}

export default function DocumentStageReassignDialog({
  open, onOpenChange, doc, onReassigned, events, currentStatut,
}: DocumentStageReassignDialogProps) {
  // Reached stages: postule (always), currentStatut (always), plus every
  // statut_to and statut_from that ever appeared in a status_change event
  // (codex R4 — keep reverted stages so a doc uploaded while briefly at
  // a future stage can still be re-attached).
  const reachedStages = useMemo(() => {
    const reached = new Set<string>(['postule', currentStatut])
    for (const e of events) {
      if (e.type !== 'status_change') continue
      if (e.statutTo) reached.add(e.statutTo)
      if (e.statutFrom) reached.add(e.statutFrom)
    }
    return reached
  }, [events, currentStatut])

  const visibleStages = useMemo(
    () => ASSIGNABLE_STAGES.filter(s => reachedStages.has(s)),
    [reachedStages],
  )

  // Default radio: the doc's CURRENT stage (parsed from event_id →
  // matching event's stage). Falls back to a visible-and-assignable
  // stage. Critical (codex final review): currentStatut may be `refuse`,
  // which is intentionally omitted from ASSIGNABLE_STAGES — never set
  // a default that has no matching radio (would silently submit a hidden
  // value when the recruiter clicks Déplacer).
  const defaultStage = useMemo(() => {
    const isVisible = (s: string) => visibleStages.includes(s)
    if (!doc) return visibleStages[0] ?? 'postule'
    if (doc.event_id != null) {
      const linked = events.find(e => e.id === doc.event_id)
      if (linked?.stage && isVisible(linked.stage)) return linked.stage
      if (linked?.type === 'status_change' && linked.statutTo && isVisible(linked.statutTo)) {
        return linked.statutTo
      }
    }
    if (isVisible(currentStatut)) return currentStatut
    return visibleStages[0] ?? 'postule'
  }, [doc, events, visibleStages, currentStatut])

  const [stage, setStage] = useState<string>(defaultStage)
  const [saving, setSaving] = useState(false)

  // Re-seed selection whenever a different doc opens (or the default
  // recomputes, e.g. events refetched).
  useEffect(() => {
    if (doc) setStage(defaultStage)
  }, [doc, defaultStage])

  const submit = useCallback(async () => {
    if (!doc || saving) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/recruitment/candidature-documents/${encodeURIComponent(doc.id)}/event`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ stage }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      onReassigned(doc.id, (body.eventId as number | null) ?? null)
      toast.success(`Document déplacé vers « ${STATUT_LABELS[stage] ?? stage} »`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur — document non déplacé')
    } finally {
      setSaving(false)
    }
  }, [doc, stage, saving, onReassigned, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Déplacer le document</DialogTitle>
          <DialogDescription>
            {doc ? <>Choisissez l'étape à laquelle <span className="font-medium">{doc.display_filename || doc.filename}</span> doit être rattaché.</> : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {visibleStages.map(s => (
            <label key={s} className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-muted/30">
              <input
                type="radio"
                name="stage"
                value={s}
                checked={stage === s}
                onChange={() => setStage(s)}
              />
              <span className="text-sm">{STATUT_LABELS[s] ?? s}</span>
            </label>
          ))}
          {visibleStages.length === 0 && (
            <p className="text-sm text-muted-foreground italic px-3 py-2">
              Aucune étape atteinte — ce candidat est encore au tout début du pipeline.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderInput className="h-3.5 w-3.5" />}
            Déplacer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

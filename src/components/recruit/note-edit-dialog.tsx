import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

/**
 * Inline edit dialog for an existing markdown note. Backed by the v4.5
 * PATCH `/candidatures/:id/events/note/:eventId` endpoint, which updates
 * the row's `content_md` in place and stamps `updated_at` so the
 * historique can show "Modifiée le …" alongside the original creation
 * timestamp.
 *
 * Edit-in-place rather than a chain of `replaces_event_id` rows: the
 * tool is internal, the team is small, and version history surfaces
 * weren't paying their cost (see plan v4.5 D1).
 *
 * Props:
 *  - `open` / `onOpenChange` — standard dialog control
 *  - `event` — the row being edited; if null, the dialog renders nothing
 *  - `candidatureId` — owning candidature for the PATCH path
 *  - `onSaved(event)` — called with the server-returned updated event
 *    so the caller can replace the row in its local state
 */
export interface NoteEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CandidatureEvent | null
  candidatureId: string
  onSaved: (event: CandidatureEvent) => void
}

export default function NoteEditDialog({
  open, onOpenChange, event, candidatureId, onSaved,
}: NoteEditDialogProps) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-seed the textarea every time a different note opens. Without
  // this, switching between notes would carry the previous note's
  // content into the new edit session — confusing.
  useEffect(() => {
    if (event) setValue(event.contentMd ?? event.notes ?? '')
  }, [event])

  const submit = useCallback(async () => {
    if (!event) return
    const trimmed = value.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/events/note/${encodeURIComponent(String(event.id))}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ contentMd: trimmed }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      onSaved(body as CandidatureEvent)
      toast.success('Note mise à jour')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur — note non sauvegardée')
    } finally {
      setSaving(false)
    }
  }, [event, value, candidatureId, onSaved, onOpenChange, saving])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }, [submit])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifier la note</DialogTitle>
          <DialogDescription>
            La note est mise à jour en place. La date de modification s'affiche dans la timeline.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={8}
          maxLength={5000}
          disabled={saving}
          autoFocus
          // Cap height at ~50vh so a long pasted note doesn\'t balloon
          // the textarea past the viewport — Save / Annuler must stay
          // visible without scrolling. Recruiter feedback (April 2026).
          className="text-sm resize-y max-h-[50vh] overflow-y-auto"
          placeholder="Écrivez votre note en markdown…"
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={!value.trim() || saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

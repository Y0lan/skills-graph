import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import InitialsBadge from '@/components/ui/initials-badge'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

// Negative ids stay reliably distinct from server-assigned ids (auto-
// increment integer, always positive) and survive the eventual
// reconciliation by being replaced with the real row.
let tempIdSeq = 0
function nextTempId(): number {
  tempIdSeq -= 1
  return tempIdSeq
}

/**
 * Inline, always-available composer for free-form markdown notes on a
 * candidature. Sits at the top of the recent journal so the recruiter
 * can capture a thought without opening a dialog or triggering a
 * transition.
 *
 * Each successful submit creates a `candidature_events` row of type
 * `note` with the markdown stored in `content_md`. Does NOT touch
 * `candidatures.notes_directeur` — that field hosts the durable
 * structured evaluation notes (forces/vigilance/reco/libre) which the
 * recruiter maintains separately.
 *
 * Interaction:
 *  - Ctrl/Cmd+Enter submits when the textarea has focus
 *  - Disabled while a submit is inflight (no double-post)
 *  - Clears + toasts on success; rolls back on failure
 */
export interface QuickNoteComposerProps {
  /** The candidature this note attaches to. Changing this value resets
   *  the composer state — see `key` prop in the caller to force remount
   *  when candidature switches. */
  candidatureId: string
  /** Slug of the current user, used to render the initials badge next
   *  to the composer. The server derives the actual creator from the
   *  authenticated session — this is purely cosmetic. */
  currentUserSlug: string
  currentUserName?: string | null
  /** Called with the new event row after a successful POST. Caller uses
   *  this to prepend the row to the event list. */
  onPublished: (event: CandidatureEvent) => void
  /** Optional optimistic-render hooks. When supplied, the composer
   *  prepends a temp event keyed by the negative id BEFORE the POST
   *  fires, calls `onReplaceTemp(tempId, real)` after success, and
   *  `onRollbackTemp(tempId)` on failure. Callers that don't need
   *  optimism can omit both — the composer falls back to the
   *  publish-after-success path. */
  onOptimisticPrepend?: (tempEvent: CandidatureEvent) => void
  onReplaceTemp?: (tempId: number, real: CandidatureEvent) => void
  onRollbackTemp?: (tempId: number) => void
}

export default function QuickNoteComposer({
  candidatureId, currentUserSlug, currentUserName,
  onPublished, onOptimisticPrepend, onReplaceTemp, onRollbackTemp,
}: QuickNoteComposerProps) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || submitting) return

    // Optimistic prepend: mint a temp event with a negative id, push it
    // to the timeline immediately, clear the textarea, and reconcile
    // when the server responds. Falls back to publish-after-success
    // when the caller didn't wire the optimistic hooks.
    const optimistic = !!(onOptimisticPrepend && onReplaceTemp && onRollbackTemp)
    let tempId = 0
    if (optimistic) {
      tempId = nextTempId()
      const tempEvent: CandidatureEvent = {
        id: tempId,
        type: 'note',
        statutFrom: null,
        statutTo: null,
        notes: null,
        contentMd: trimmed,
        emailSnapshot: null,
        createdBy: currentUserSlug,
        createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      onOptimisticPrepend!(tempEvent)
      setValue('')
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/events/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contentMd: trimmed }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const real = body as CandidatureEvent
      if (optimistic) {
        onReplaceTemp!(tempId, real)
      } else {
        onPublished(real)
        setValue('')
      }
      toast.success('Note publiée')
    } catch (err) {
      if (optimistic) {
        onRollbackTemp!(tempId)
        // Restore the textarea so the recruiter doesn't lose their text
        // when the publish fails — pasting a markdown note again is
        // exactly the kind of friction we removed.
        setValue(trimmed)
      }
      toast.error(err instanceof Error ? err.message : 'Erreur — note non publiée')
    } finally {
      setSubmitting(false)
    }
  }, [value, candidatureId, currentUserSlug, onPublished, onOptimisticPrepend, onReplaceTemp, onRollbackTemp, submitting])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }, [submit])

  return (
    <div className="rounded-md border bg-card p-3 flex gap-3">
      <InitialsBadge name={currentUserName || currentUserSlug || '?'} size="sm" />
      <div className="flex-1 min-w-0">
        <Textarea
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ajouter une note rapide — markdown supporté, Ctrl+Enter pour publier"
          rows={2}
          maxLength={5000}
          disabled={submitting}
          className="text-sm resize-none"
        />
        <div className="flex items-center justify-between mt-2 gap-2">
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {value.length}/5000 · <span className="hidden sm:inline">markdown · Ctrl+Enter pour publier</span>
          </p>
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={!value.trim() || submitting}
            onClick={() => void submit()}
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Publier
          </Button>
        </div>
      </div>
    </div>
  )
}

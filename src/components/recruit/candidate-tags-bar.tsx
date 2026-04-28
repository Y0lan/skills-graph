import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, X, Tag } from 'lucide-react'

/**
 * Tags row shown under the candidate identity strip. Tags live at the
 * candidate level (not candidature) so they survive multi-poste
 * applications — useful for "ex-CIO", "rappeler-2027", "talent-dispo",
 * "dispo-aoùt", etc.
 *
 * The pipeline page can later read /api/recruitment/tags to power a
 * cross-pipeline filter. For now this component focuses on the
 * candidate-level CRUD.
 */

// Local DB row shape — renamed from `Tag` to avoid shadowing the
// lucide-react `<Tag>` icon import (coderabbit P1).
interface TagItem {
  tag: string
  createdBy: string
  createdAt: string
}

export interface CandidateTagsBarProps {
  candidateId: string
}

export default function CandidateTagsBar({ candidateId }: CandidateTagsBarProps) {
  const [tags, setTags] = useState<TagItem[]>([])
  const [composing, setComposing] = useState(false)
  const [draftTag, setDraftTag] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refetch = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/recruitment/candidates/${encodeURIComponent(candidateId)}/tags`,
        { credentials: 'include' },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setTags(await r.json() as TagItem[])
    } catch {
      // Silent — empty list is harmless.
    }
  }, [candidateId])

  useEffect(() => { void refetch() }, [refetch])

  const submit = useCallback(async () => {
    const trimmed = draftTag.trim().toLowerCase()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const r = await fetch(
        `/api/recruitment/candidates/${encodeURIComponent(candidateId)}/tags`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: trimmed }),
        },
      )
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`)
      setDraftTag('')
      setComposing(false)
      void refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur — tag non ajouté')
    } finally {
      setSubmitting(false)
    }
  }, [draftTag, candidateId, refetch])

  const remove = useCallback(async (tag: string) => {
    try {
      const r = await fetch(
        `/api/recruitment/candidates/${encodeURIComponent(candidateId)}/tags/${encodeURIComponent(tag)}`,
        { method: 'DELETE', credentials: 'include' },
      )
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`)
      setTags(prev => prev.filter(t => t.tag !== tag))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }, [candidateId])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    } else if (e.key === 'Escape') {
      setComposing(false)
      setDraftTag('')
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
      {tags.map(t => (
        <span
          key={t.tag}
          className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground border border-border/60 group"
          title={`Ajouté par ${t.createdBy}`}
        >
          {t.tag}
          <button
            type="button"
            onClick={() => remove(t.tag)}
            className="opacity-50 group-hover:opacity-100 hover:text-destructive transition-opacity"
            aria-label={`Supprimer le tag ${t.tag}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {composing ? (
        <input
          type="text"
          autoFocus
          value={draftTag}
          onChange={(e) => setDraftTag(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!draftTag.trim()) setComposing(false) }}
          maxLength={32}
          disabled={submitting}
          placeholder="nouveau-tag"
          className="rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] outline-none focus:ring-1 focus:ring-primary/40 w-32"
        />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <Plus className="h-2.5 w-2.5" />
          {tags.length === 0 ? 'Ajouter un tag' : 'Tag'}
        </button>
      )}
    </div>
  )
}

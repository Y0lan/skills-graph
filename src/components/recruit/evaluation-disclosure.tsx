import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Single pliable disclosure for the deep-evaluation surfaces: radar,
 * AI analysis, gap synthesis, and bonus skills. Keeps the scores → next
 * action flow calm at first paint; the recruiter expands this block only
 * when scores raise a question.
 *
 * State persists per-candidature in localStorage so repeated visits
 * respect the choice without bleeding across candidates.
 */
export interface EvaluationDisclosureProps {
  candidatureId: string
  defaultOpen?: boolean
  /** Short summary text shown when collapsed (e.g. "Radar · Analyse IA ·
   *  Candidat vs équipe · Compétences bonus"). */
  summary?: string
  children: React.ReactNode
}

export default function EvaluationDisclosure({
  candidatureId, defaultOpen = false, summary, children,
}: EvaluationDisclosureProps) {
  const storageKey = `eval-disclosure:${candidatureId}`
  const [open, setOpen] = useState<boolean>(defaultOpen)

  // Re-seed from localStorage each time the candidature changes so a
  // parent that doesn't remount this component (e.g. the multi-
  // candidature switcher) still gets the correct per-candidate state.
  // Using the key + defaultOpen in the dep array keeps it stable.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(storageKey)
    if (stored === 'true') setOpen(true)
    else if (stored === 'false') setOpen(false)
    else setOpen(defaultOpen)
  }, [storageKey, defaultOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, String(open))
  }, [open, storageKey])

  return (
    <section className="rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        )}
        <span
          className="text-sm font-medium"
          style={{ fontFamily: "'Raleway Variable', sans-serif" }}
        >
          Évaluation détaillée
        </span>
        {summary && <span className="text-xs text-muted-foreground truncate">· {summary}</span>}
      </button>
      {open && <div className="border-t px-4 py-4 space-y-4">{children}</div>}
    </section>
  )
}

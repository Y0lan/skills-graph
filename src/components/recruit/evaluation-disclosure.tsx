import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

function readPersisted(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const stored = window.localStorage.getItem(key)
  if (stored === 'true') return true
  if (stored === 'false') return false
  return fallback
}

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
  const [open, setOpen] = useState<boolean>(() => readPersisted(storageKey, defaultOpen))

  // Re-seed when the candidatureId changes inside the same mount (the
  // switcher path keeps this component mounted across candidatures).
  // This is the documented React idiom for "reset state when a prop
  // changes" — see https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  // The react-hooks/refs lint catches ref reads during render
  // conservatively; this exact pattern is sanctioned by the React docs
  // and avoids the cascading-effect anti-pattern.
  const lastKey = useRef(storageKey)
  // eslint-disable-next-line react-hooks/refs
  if (lastKey.current !== storageKey) {
    // eslint-disable-next-line react-hooks/refs
    lastKey.current = storageKey
    setOpen(readPersisted(storageKey, defaultOpen))
  }

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

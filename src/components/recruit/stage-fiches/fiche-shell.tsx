import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, Save, Undo2 } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Visual + behavioural shell shared by every per-stage fiche component.
 *
 * The fiche lives at the top of a stage block in the historique
 * accordion. Renders an eyebrow + title strip, a 1-2 col responsive
 * grid for the fields the per-stage component supplies, and a sticky
 * action row with "Enregistrer" / "Annuler" buttons that only enable
 * once the form is dirty.
 *
 * All state lives in the per-stage component (it owns the form
 * values + the dirty flag) — this shell is layout + a11y + buttons.
 */

export interface FicheShellProps {
  eyebrow: string
  title: string
  /** Empty state body when the recruiter hasn't filled anything yet. Optional. */
  emptyHint?: string
  isDirty: boolean
  isSaving: boolean
  errorMessage?: string | null
  /** Subline shown on the right of the action bar — e.g. "Modifié il y a 5 min par yolan". */
  metaLine?: string | null
  /** Optional banner above the fields (used for "Brouillon récupéré"). */
  banner?: React.ReactNode
  onSave: () => void
  onCancel: () => void
  children: React.ReactNode
}

export function FicheShell({
  eyebrow,
  title,
  emptyHint,
  isDirty,
  isSaving,
  errorMessage,
  metaLine,
  banner,
  onSave,
  onCancel,
  children,
}: FicheShellProps) {
  // Submit-on-Cmd/Ctrl+Enter is the convention shared with QuickNoteComposer.
  useEffect(() => {
    if (!isDirty || isSaving) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onSave()
      } else if (e.key === 'Escape') {
        // Esc only when nothing is focused inside an editable element —
        // we don't want to swallow the IME/autocomplete close.
        const ae = document.activeElement
        if (ae instanceof HTMLElement && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) {
          // do nothing — caller's input keeps focus
          return
        }
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [isDirty, isSaving, onSave, onCancel])

  return (
    <section
      className={cn(
        'rounded-2xl border bg-card/50 backdrop-blur-[2px] shadow-[0_1px_0_0_rgba(0,0,0,0.02)]',
        'transition-all duration-200',
        isDirty ? 'ring-1 ring-primary/20 border-primary/30' : 'border-border/60',
      )}
      aria-label={`Fiche ${title}`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        </div>
        {metaLine ? (
          <p className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{metaLine}</p>
        ) : null}
      </header>

      {banner ? <div className="px-4 pb-2">{banner}</div> : null}

      <div className="px-4 pb-3">
        {children}
        {emptyHint ? (
          <p className="mt-2 text-[11px] text-muted-foreground italic">{emptyHint}</p>
        ) : null}
      </div>

      {(isDirty || errorMessage) && (
        <footer className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-4 py-2">
          <p className={cn('text-[11px]', errorMessage ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
            {errorMessage ?? 'Modifications non enregistrées'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5"
              onClick={onCancel}
              disabled={isSaving}
            >
              <Undo2 className="h-3 w-3" />
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5"
              onClick={onSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Enregistrer
            </Button>
          </div>
        </footer>
      )}
    </section>
  )
}

/**
 * Field row inside a fiche. Eyebrow label above the value, child takes
 * full width. Empty fields get an italic "Pas renseigné" hint beneath
 * the label so the recruiter sees what's missing at a glance.
 */
export interface FicheFieldProps {
  label: string
  /** Optional helper line under the label. */
  hint?: string
  isEmpty?: boolean
  /** Right-aligned action / button. */
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function FicheField({ label, hint, isEmpty, action, className, children }: FicheFieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        {action}
      </div>
      <div className="min-w-0">{children}</div>
      {isEmpty && !hint ? (
        <p className="mt-0.5 text-[11px] italic text-muted-foreground/70">Pas renseigné</p>
      ) : null}
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

import { FileText, Check } from 'lucide-react'
import type { CandidatureDocument } from '@/hooks/use-candidate-data'

/**
 * Compact checklist strip that summarises the dossier's "expected" slots
 * (CV, Lettre de motivation, Rapport Aboro) at a glance. Replaces the
 * previous full-size empty-slot tiles that took vertical space equal to
 * a filled document.
 *
 * This is a PREVIEW, not a CRUD surface: the full CandidateDocumentsPanel
 * remains the single source of truth for upload/rename/delete. The strip
 * sits above that panel as a quick visual answer to "what's in the
 * dossier?" — click anywhere on the strip to scroll to the full panel.
 */
export interface DocumentSlotSummaryProps {
  documents: CandidatureDocument[]
  /** Scroll target so the strip acts as an anchor to the full panel. */
  onJumpToPanel?: () => void
}

const EXPECTED_SLOTS: { type: string; label: string; optional?: boolean }[] = [
  { type: 'cv', label: 'CV' },
  { type: 'lettre', label: 'Lettre', optional: true },
  { type: 'aboro', label: 'Rapport Aboro', optional: true },
]

export default function DocumentSlotSummary({ documents, onJumpToPanel }: DocumentSlotSummaryProps) {
  const live = documents.filter(d => !d.deleted_at)
  const otherCount = live.filter(d => !EXPECTED_SLOTS.some(s => s.type === d.type)).length

  return (
    <button
      type="button"
      onClick={onJumpToPanel}
      className="w-full text-left rounded-md border bg-card hover:bg-muted/40 transition-colors px-3 py-2 text-sm flex items-center gap-4 flex-wrap"
      aria-label="Résumé du dossier — cliquez pour voir tous les documents"
    >
      <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase shrink-0">
        Dossier
      </p>
      {EXPECTED_SLOTS.map(slot => {
        const has = live.some(d => d.type === slot.type)
        return (
          <span
            key={slot.type}
            className={`inline-flex items-center gap-1 text-xs ${has ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {has ? (
              <Check className="h-3 w-3 text-emerald-600" aria-hidden />
            ) : (
              <span className="h-3 w-3 inline-flex items-center justify-center text-muted-foreground/50" aria-hidden>—</span>
            )}
            <span className={has ? 'font-medium' : ''}>{slot.label}</span>
            {!has && slot.optional && <span className="text-muted-foreground/60 text-[10px]">(optionnel)</span>}
          </span>
        )
      })}
      {otherCount > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" aria-hidden />
          + {otherCount} autre{otherCount > 1 ? 's' : ''}
        </span>
      )}
      <span className="ml-auto text-[11px] text-primary">Gérer les documents →</span>
    </button>
  )
}

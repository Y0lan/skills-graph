import { ChevronRight, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { STATUT_LABELS, STATUT_COLORS, NEXT_ACTION } from '@/lib/constants'

interface CandidatureLike {
  id: string
  posteTitre: string
  statut: string
  tauxGlobal?: number | null
}

export interface CandidatureSwitcherProps {
  candidatures: CandidatureLike[]
  selectedId: string
  isPendingRadar: (c: CandidatureLike) => boolean
  onSelect: (id: string) => void
}

/** Dense horizontal candidature switcher — renders when candidate has ≥2
 *  candidatures. Each row is a button: poste title + statut badge +
 *  global score + next-action hint. Selected gets a left teal accent.
 *
 *  Rationale: the old design rendered a full candidature card per
 *  candidature (3 steppers, 3 score grids, 3 action columns stacked).
 *  This switcher collapses N candidatures into N compact rows and lets
 *  a single workspace below handle the selected one. Mirrors the
 *  pattern used in the pipeline dashboard's postes navigator. */
export default function CandidatureSwitcher({
  candidatures,
  selectedId,
  isPendingRadar,
  onSelect,
}: CandidatureSwitcherProps) {
  if (candidatures.length < 2) return null

  return (
    <div className="mb-6 border rounded-md overflow-hidden">
      <div className="flex items-baseline justify-between px-3 py-2 border-b bg-muted/30">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Candidatures ({candidatures.length})
        </p>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Cliquez pour changer le contexte de travail
        </span>
      </div>
      <div>
        {candidatures.map((c) => {
          const selected = c.id === selectedId
          const awaiting = isPendingRadar(c)
          const scoreNum = typeof c.tauxGlobal === 'number' ? Math.round(c.tauxGlobal) : null
          const nextAction = c.statut !== 'refuse' && c.statut !== 'embauche'
            ? NEXT_ACTION[c.statut] ?? null
            : null

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`group relative w-full flex items-center gap-3 px-3 py-2.5 text-left border-t first:border-t-0 border-border/60 transition-colors hover:bg-muted/40 ${
                selected ? 'bg-muted/60' : ''
              }`}
              aria-pressed={selected}
            >
              {selected && (
                <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
              )}
              <span
                className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                  selected ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
                aria-hidden
              />

              <span className={`text-sm truncate ${selected ? 'font-medium text-foreground' : 'text-foreground/80'}`}>
                {c.posteTitre}
              </span>

              {awaiting ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] font-normal bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                >
                  <Clock className="mr-1 h-2.5 w-2.5" />
                  En attente
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className={`text-[10px] font-normal ${STATUT_COLORS[c.statut] ?? ''}`}
                >
                  {STATUT_LABELS[c.statut] ?? c.statut}
                </Badge>
              )}

              <span className="flex-1 min-w-0" />

              {scoreNum !== null && (
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                  <span className="text-foreground font-medium">{scoreNum}%</span>
                  <span className="ml-1">global</span>
                </span>
              )}

              {nextAction && (
                <span className="hidden md:inline text-[11px] text-muted-foreground truncate max-w-[220px] shrink-0">
                  · {nextAction}
                </span>
              )}

              <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground transition-colors" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

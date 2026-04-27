import { useState } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'
import { scoreColor, verdictFromScores } from '@/lib/score-utils'
import CompatBreakdownDialog, { type CompatMetric } from './compat-breakdown-dialog'

/**
 * Score tiles — editorial, number-first. Displays up to four compatibility
 * percentages (Global, Poste, Équipe, Soft) as a horizontal strip. Each
 * tile uses a muted background so the strip reads as a legend next to the
 * primary CTA rather than competing with it visually.
 *
 * Null handling: tiles with no value render "—" plus an "À compléter" hint
 * so an uncalculated score never looks like a low one. The hint also
 * doubles as the escape hatch that tells the recruiter what to do next
 * (typically: send the Skill Radar).
 *
 * `Poste` and `Équipe` open the CV/team breakdown dialog when a
 * candidatureId is known. `Global` is a composite with no dedicated
 * breakdown route, and `Soft` depends on a test that may not have run
 * yet — both stay non-clickable to avoid dead buttons.
 */
export interface CandidateScoreSummaryProps {
  tauxGlobal: number | null
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
  candidatureId?: string
  /** Passthrough CTA for tiles with null values when the recruiter can do
   *  something about it (typically: copy the Skill Radar link so the
   *  candidate's own score shows up). Rendered under the "À compléter"
   *  hint as a subtle inline text button. */
  onMissingAction?: () => void
  missingActionLabel?: string
}

const TILE_TOOLTIPS: Record<string, string> = {
  Global: 'Score synthèse: combinaison pondérée Poste + Équipe + Soft. Résume "fit global" en un chiffre.',
  Poste: 'Compatibilité technique avec les exigences du poste. Cliquez pour voir le détail par compétence.',
  Équipe: 'Complémentarité avec l\'équipe actuelle — mesure les gaps que le candidat comblerait. Cliquez pour voir le détail.',
  Soft: 'Score comportemental issu de l\'évaluation Aboro. Disponible une fois le test passé.',
}

const MISSING_HINT: Record<string, string> = {
  Global: 'Dépend du Skill Radar',
  Poste: 'En attente du scoring CV',
  Équipe: 'En attente du scoring CV',
  Soft: 'Skill Radar non soumis',
}

const LABEL_TO_METRIC: Record<string, CompatMetric> = {
  Poste: 'poste',
  Équipe: 'equipe',
  Soft: 'soft',
}

interface ScoreTileData {
  label: string
  value: number | null
  clickable: boolean
}

export default function CandidateScoreSummary({
  tauxGlobal, tauxPoste, tauxEquipe, tauxSoft, candidatureId, onMissingAction, missingActionLabel,
}: CandidateScoreSummaryProps) {
  const [openMetric, setOpenMetric] = useState<CompatMetric | null>(null)

  const tiles: ScoreTileData[] = [
    { label: 'Global', value: tauxGlobal, clickable: false },
    { label: 'Poste', value: tauxPoste, clickable: !!candidatureId },
    { label: 'Équipe', value: tauxEquipe, clickable: !!candidatureId },
    { label: 'Soft', value: tauxSoft, clickable: false },
  ]

  const verdict = verdictFromScores(tauxPoste, tauxEquipe)
  const anyMissing = tiles.some(t => t.value == null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">Compatibilité</p>
        {verdict && (
          <Badge className={`text-[10px] ${verdict.color}`}>{verdict.label}</Badge>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-stretch">
        {tiles.map(t => {
          const canOpen = t.clickable && t.value != null
          const tile = (
            <div className="h-full flex flex-col gap-1.5 rounded-md border border-border/60 bg-card px-3 py-2.5 text-left">
              {/* Header — label + tooltip, fixed at the top of every
                  tile so the row reads cleanly across filled / empty
                  states. */}
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  {t.label}
                </p>
                <Tooltip>
                  <TooltipTrigger className="cursor-help" onClick={(e) => e.stopPropagation()}>
                    <Info className="h-2.5 w-2.5 text-muted-foreground/50" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px] text-xs">{TILE_TOOLTIPS[t.label]}</TooltipContent>
                </Tooltip>
              </div>

              {/* Big number — same baseline whether filled (`xx%`) or
                  empty (em dash). Fixed line-height keeps height
                  identical to the percent variant. */}
              {t.value != null ? (
                <p
                  className={`text-xl font-semibold tabular-nums leading-none ${scoreColor(t.value)}`}
                  style={{ fontFamily: "'Raleway Variable', sans-serif" }}
                >
                  {Math.round(t.value)}%
                </p>
              ) : (
                <p
                  className="text-xl font-semibold tabular-nums leading-none text-muted-foreground"
                  style={{ fontFamily: "'Raleway Variable', sans-serif" }}
                >
                  —
                </p>
              )}

              {/* Footer — pushed to the bottom of the tile via
                  mt-auto so all tiles end at the same Y, no matter
                  whether the row is the bar or the hint text. The
                  hint clamps to 2 lines so a longer string wraps
                  inside the same envelope instead of stretching the
                  tile. */}
              <div className="mt-auto">
                {t.value != null ? (
                  <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${scoreBarColor(t.value)}`}
                      style={{ width: `${Math.min(100, Math.max(0, t.value))}%` }}
                    />
                  </div>
                ) : (
                  <p className="text-[10px] leading-tight text-foreground/70 line-clamp-2 min-h-[20px]">
                    {MISSING_HINT[t.label]}
                  </p>
                )}
              </div>
            </div>
          )
          if (!canOpen) return <div key={t.label} className="h-full">{tile}</div>
          return (
            <button
              key={t.label}
              type="button"
              className="text-left block w-full h-full hover:ring-1 hover:ring-primary/40 rounded-md transition-shadow"
              aria-label={`Voir le détail du score ${t.label} ${Math.round(t.value ?? 0)}%`}
              onClick={() => setOpenMetric(LABEL_TO_METRIC[t.label])}
            >
              {tile}
            </button>
          )
        })}
      </div>

      {anyMissing && onMissingAction && missingActionLabel && (
        <button
          type="button"
          onClick={onMissingAction}
          className="text-[11px] text-primary hover:underline"
        >
          {missingActionLabel}
        </button>
      )}

      {candidatureId && openMetric && (
        <CompatBreakdownDialog
          open={!!openMetric}
          onClose={() => setOpenMetric(null)}
          candidatureId={candidatureId}
          metric={openMetric}
        />
      )}
    </div>
  )
}

function scoreBarColor(v: number): string {
  if (v >= 70) return 'bg-emerald-500/70'
  if (v >= 40) return 'bg-amber-500/70'
  return 'bg-rose-500/70'
}

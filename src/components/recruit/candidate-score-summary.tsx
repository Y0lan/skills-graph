import { useState } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'
import { scoreColor, scoreBg, verdictFromScores } from '@/lib/score-utils'
import CompatBreakdownDialog, { type CompatMetric } from './compat-breakdown-dialog'

export interface CandidateScoreSummaryProps {
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
  candidatureId?: string
}

const TOOLTIPS: Record<string, string> = {
  Poste: 'Compatibilite technique entre les competences du candidat et les exigences du poste vise. Cliquez pour voir le detail.',
  Equipe: 'Complementarite avec l\'equipe existante — mesure les competences manquantes que le candidat pourrait combler. Cliquez pour voir le detail.',
  Soft: 'Score comportemental issu de l\'evaluation Aboro (savoir-etre, traits de personnalite). Cliquez pour voir le detail.',
}

const LABEL_TO_METRIC: Record<string, CompatMetric> = {
  Poste: 'poste',
  Equipe: 'equipe',
  Soft: 'soft',
}

export default function CandidateScoreSummary({ tauxPoste, tauxEquipe, tauxSoft, candidatureId }: CandidateScoreSummaryProps) {
  const [openMetric, setOpenMetric] = useState<CompatMetric | null>(null)

  const scores = [
    { label: 'Poste', value: tauxPoste },
    { label: 'Equipe', value: tauxEquipe },
    { label: 'Soft', value: tauxSoft },
  ]

  const verdict = verdictFromScores(tauxPoste, tauxEquipe)
  const isClickable = !!candidatureId

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scores</p>
        {verdict && (
          <Badge className={`text-[10px] ${verdict.color}`}>
            {verdict.label}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {scores.map(s => {
          const canOpen = isClickable && s.value != null
          const Tile = (
            <div className={`rounded-lg p-3 text-center ${scoreBg(s.value)} ${canOpen ? 'cursor-pointer hover:ring-1 hover:ring-primary/40 transition-shadow' : ''}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <Tooltip>
                  <TooltipTrigger className="cursor-help" onClick={(e) => e.stopPropagation()}>
                    <Info className="h-2.5 w-2.5 text-muted-foreground/50" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[220px] text-xs">{TOOLTIPS[s.label]}</TooltipContent>
                </Tooltip>
              </div>
              {s.value != null ? (
                <p className={`text-2xl font-bold tabular-nums ${scoreColor(s.value)}`}>{s.value}%</p>
              ) : (
                <div>
                  <p className="text-2xl font-bold text-muted-foreground/40">&mdash;</p>
                  <p className="text-[9px] text-muted-foreground">Pas encore evalue</p>
                </div>
              )}
            </div>
          )
          if (!canOpen) return <div key={s.label}>{Tile}</div>
          return (
            <button
              key={s.label}
              type="button"
              className="text-left"
              aria-label={`Voir le détail du score ${s.label} ${s.value}%`}
              onClick={() => setOpenMetric(LABEL_TO_METRIC[s.label])}
            >
              {Tile}
            </button>
          )
        })}
      </div>

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

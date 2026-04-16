import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'
import { scoreColor, scoreBg, verdictFromScores } from '@/lib/score-utils'

export interface CandidateScoreSummaryProps {
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
}

const TOOLTIPS: Record<string, string> = {
  Poste: 'Compatibilite technique entre les competences du candidat et les exigences du poste vise',
  Equipe: 'Complementarite avec l\'equipe existante — mesure les competences manquantes que le candidat pourrait combler',
  Soft: 'Score comportemental issu de l\'evaluation Aboro (savoir-etre, traits de personnalite)',
}

export default function CandidateScoreSummary({ tauxPoste, tauxEquipe, tauxSoft }: CandidateScoreSummaryProps) {
  const scores = [
    { label: 'Poste', value: tauxPoste },
    { label: 'Equipe', value: tauxEquipe },
    { label: 'Soft', value: tauxSoft },
  ]

  const verdict = verdictFromScores(tauxPoste, tauxEquipe)

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
        {scores.map(s => (
          <div key={s.label} className={`rounded-lg p-3 text-center ${scoreBg(s.value)}`}>
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <Tooltip>
                <TooltipTrigger className="cursor-help">
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
        ))}
      </div>
    </div>
  )
}

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'

export interface CandidateScoreSummaryProps {
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
}

function scoreColor(v: number | null): string {
  if (v == null) return 'text-muted-foreground'
  if (v >= 70) return 'text-green-500'
  if (v >= 40) return 'text-amber-500'
  return 'text-red-500'
}

function scoreBg(v: number | null): string {
  if (v == null) return 'bg-muted/30'
  if (v >= 70) return 'bg-green-500/10'
  if (v >= 40) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

function getVerdict(poste: number | null, equipe: number | null): string | null {
  if (poste == null && equipe == null) return null
  const avg = [poste, equipe].filter((v): v is number => v != null)
  if (avg.length === 0) return null
  const mean = avg.reduce((a, b) => a + b, 0) / avg.length
  if (mean >= 80) return 'Excellent fit'
  if (mean >= 65) return 'Bon potentiel'
  if (mean >= 45) return 'A creuser'
  return 'Risque'
}

function verdictColor(verdict: string): string {
  switch (verdict) {
    case 'Excellent fit': return 'bg-green-600 text-white'
    case 'Bon potentiel': return 'bg-sky-600 text-white'
    case 'A creuser': return 'bg-amber-600 text-white'
    case 'Risque': return 'bg-red-600 text-white'
    default: return ''
  }
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

  const verdict = getVerdict(tauxPoste, tauxEquipe)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scores</p>
        {verdict && (
          <Badge className={`text-[10px] ${verdictColor(verdict)}`}>
            {verdict}
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

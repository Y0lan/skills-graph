import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { GitBranch, ChevronRight, Upload, Info } from 'lucide-react'
import { STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, formatDateTime } from '@/lib/constants'
import type { CandidatureInfo, CandidatureEvent, AllowedTransitions } from '@/hooks/use-candidate-data'

export interface CandidateStatusBarProps {
  candidatures: CandidatureInfo[]
  events: CandidatureEvent[]
  allowedTransitions: AllowedTransitions | null
  changingStatus: boolean
  onOpenTransition: (candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[]) => void
}

export default function CandidateStatusBar({
  candidatures,
  events,
  allowedTransitions,
  changingStatus,
  onOpenTransition,
}: CandidateStatusBarProps) {
  if (candidatures.length === 0) return null

  return (
    <div className="mt-6 space-y-3">
      {candidatures.map(c => (
        <Card key={c.id}>
          <CardContent className="py-4 px-5">
            {/* Header: poste + current status + scores */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{c.posteTitre}</p>
                  <p className="text-xs text-muted-foreground">
                    {CANAL_LABELS[c.canal] ?? c.canal}
                    {' · '}Candidature du {formatDateTime(c.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {c.tauxPoste != null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                      Poste
                      <Tooltip>
                        <TooltipTrigger className="cursor-help"><Info className="h-3 w-3 text-muted-foreground/50" /></TooltipTrigger>
                        <TooltipContent className="max-w-[220px] text-xs">Compatibilité technique entre les compétences du candidat et les exigences du poste visé</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-bold">{c.tauxPoste}%</p>
                  </div>
                )}
                {c.tauxEquipe != null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                      Équipe
                      <Tooltip>
                        <TooltipTrigger className="cursor-help"><Info className="h-3 w-3 text-muted-foreground/50" /></TooltipTrigger>
                        <TooltipContent className="max-w-[220px] text-xs">Complémentarité avec l'équipe existante — mesure les compétences manquantes que le candidat pourrait combler</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-bold">{c.tauxEquipe}%</p>
                  </div>
                )}
                {c.tauxSoft != null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                      Soft
                      <Tooltip>
                        <TooltipTrigger className="cursor-help"><Info className="h-3 w-3 text-muted-foreground/50" /></TooltipTrigger>
                        <TooltipContent className="max-w-[220px] text-xs">Score comportemental issu de l'évaluation Aboro (savoir-être, traits de personnalité)</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-bold">{c.tauxSoft}%</p>
                  </div>
                )}
                <Badge className={`text-sm px-3 py-1 ${STATUT_COLORS[c.statut] ?? ''}`}>
                  {STATUT_LABELS[c.statut] ?? c.statut}
                </Badge>
              </div>
            </div>

            {/* Soft skill alerts */}
            {c.softSkillAlerts && c.softSkillAlerts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.softSkillAlerts.map((a, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                    {'\u26A0'} {a.message}
                  </Badge>
                ))}
              </div>
            )}

            {/* Transition actions */}
            {allowedTransitions && (allowedTransitions.allowedTransitions.length > 0 || allowedTransitions.skipTransitions.length > 0) && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2">Actions suivantes :</p>
                <div className="flex flex-wrap gap-2">
                  {allowedTransitions.allowedTransitions.filter(s => s !== 'refuse').map(s => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenTransition(c.id, s)}
                      disabled={changingStatus}
                    >
                      <ChevronRight className="h-3 w-3 mr-1" />
                      {STATUT_LABELS[s] ?? s}
                    </Button>
                  ))}
                  {allowedTransitions.skipTransitions.map(st => (
                    <Button
                      key={st.statut}
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => onOpenTransition(c.id, st.statut, true, st.skipped)}
                      disabled={changingStatus}
                    >
                      {STATUT_LABELS[st.statut] ?? st.statut}
                      <span className="text-[10px] ml-1">(sauter {st.skipped.map(s => STATUT_LABELS[s] ?? s).join(', ')})</span>
                    </Button>
                  ))}
                  {allowedTransitions.allowedTransitions.includes('refuse') && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="ml-auto"
                      onClick={() => onOpenTransition(c.id, 'refuse')}
                      disabled={changingStatus}
                    >
                      Refuser
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Event timeline */}
            {events.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2">Historique :</p>
                <div className="space-y-1.5">
                  {events.map(e => (
                    <div key={e.id} className="flex items-start gap-3 text-xs">
                      <span className="text-muted-foreground shrink-0 w-28 tabular-nums">{formatDateTime(e.createdAt)}</span>
                      {e.statutTo && (
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${STATUT_COLORS[e.statutTo] ?? ''}`}>
                          {STATUT_LABELS[e.statutTo] ?? e.statutTo}
                        </Badge>
                      )}
                      {e.type === 'document' && <Upload className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                      {e.notes && <span className="text-muted-foreground">{e.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

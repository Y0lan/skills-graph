import { useState } from 'react'
import { MarkdownNote } from '@/components/ui/markdown-note'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { GitBranch, ChevronRight, ChevronDown, Upload, Info, FileText, Mail } from 'lucide-react'
import { STATUT_LABELS, STATUT_COLORS, CANAL_LABELS, formatDateTimeHuman } from '@/lib/constants'
import type { CandidatureInfo, CandidatureEvent, CandidatureData } from '@/hooks/use-candidate-data'

export interface CandidateStatusBarProps {
  candidatures: CandidatureInfo[]
  /** @deprecated Use candidatureDataMap instead */
  events: CandidatureEvent[]
  /** @deprecated Use candidatureDataMap instead */
  allowedTransitions: { allowedTransitions: string[]; skipTransitions: { statut: string; skipped: string[] }[]; notesRequired: string[] } | null
  changingStatus: boolean
  onOpenTransition: (candidatureId: string, targetStatut: string, isSkip?: boolean, skipped?: string[], currentStatut?: string) => void
  candidatureDataMap?: Record<string, CandidatureData>
}

function hasExpandableContent(event: CandidatureEvent): boolean {
  return !!(event.contentMd || event.emailSnapshot)
}

function EmailSnapshotSection({ snapshot }: { snapshot: string }) {
  const [expanded, setExpanded] = useState(false)
  let parsed: { subject?: string; body?: string } | null = null
  try {
    parsed = JSON.parse(snapshot)
  } catch {
    return null
  }
  if (!parsed) return null

  return (
    <div className="mt-1.5 rounded border bg-muted/30 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full text-left"
      >
        <Mail className="h-3 w-3 shrink-0" />
        <span className="font-medium">Email envoyé</span>
        {parsed.subject && <span className="truncate ml-1">- {parsed.subject}</span>}
        {expanded ? <ChevronDown className="h-3 w-3 ml-auto shrink-0" /> : <ChevronRight className="h-3 w-3 ml-auto shrink-0" />}
      </button>
      {expanded && parsed.body && (
        <div className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground border-t pt-2">
          {parsed.body}
        </div>
      )}
    </div>
  )
}

export default function CandidateStatusBar({
  candidatures,
  events: legacyEvents,
  allowedTransitions: legacyTransitions,
  changingStatus,
  onOpenTransition,
  candidatureDataMap,
}: CandidateStatusBarProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())

  if (candidatures.length === 0) return null

  const toggleEvent = (eventId: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }

  return (
    <div className="mt-6 space-y-3">
      {candidatures.map(c => {
        // Use per-candidature data if available, else fall back to legacy flat state
        const cData = candidatureDataMap?.[c.id]
        const events = cData?.events ?? legacyEvents
        const allowedTransitions = cData?.allowedTransitions ?? legacyTransitions

        return (
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
                      {' · '}Candidature du {formatDateTimeHuman(c.createdAt)}
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
                <div className="mt-2 flex flex-wrap gap-1.5 max-w-full">
                  {c.softSkillAlerts.map((a, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-amber-500 text-amber-600 max-w-full break-words whitespace-normal text-left">
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
                        onClick={() => onOpenTransition(c.id, s, false, [], c.statut)}
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
                        onClick={() => onOpenTransition(c.id, st.statut, true, st.skipped, c.statut)}
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
                        onClick={() => onOpenTransition(c.id, 'refuse', false, [], c.statut)}
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
                  <div className="space-y-1">
                    {events.map(e => {
                      const expandable = hasExpandableContent(e)
                      const isExpanded = expandedEvents.has(e.id)

                      return (
                        <div key={e.id}>
                          <div
                            className={`flex items-start gap-3 text-xs ${expandable ? 'cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 py-0.5' : ''}`}
                            onClick={expandable ? () => toggleEvent(e.id) : undefined}
                          >
                            {/* Expand chevron or spacer */}
                            <span className="w-3 shrink-0 mt-0.5">
                              {expandable && (
                                isExpanded
                                  ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                  : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                              )}
                            </span>
                            <span className="text-muted-foreground shrink-0 min-w-[9.5rem]">{formatDateTimeHuman(e.createdAt)}</span>
                            {e.statutTo && (
                              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${STATUT_COLORS[e.statutTo] ?? ''}`}>
                                {STATUT_LABELS[e.statutTo] ?? e.statutTo}
                              </Badge>
                            )}
                            {e.type === 'document' && <Upload className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                            {e.notes && <span className="text-muted-foreground truncate">{e.notes}</span>}
                            {e.contentMd && !e.notes && <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                          </div>

                          {/* Expanded content */}
                          {expandable && isExpanded && (
                            <div className="ml-6 pl-3 border-l-2 border-muted mt-1 mb-2 space-y-2">
                              {e.contentMd && (
                                <MarkdownNote content={e.contentMd} variant="compact" />
                              )}
                              {e.emailSnapshot && (
                                <EmailSnapshotSection snapshot={e.emailSnapshot} />
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

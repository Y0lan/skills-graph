import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { ArrowRightLeft, Upload, FileText, Mail, MessageSquare, Clock } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { STATUT_LABELS, STATUT_COLORS, formatDateTime, formatDateShort } from '@/lib/constants'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

/** Pipeline column order for grouping */
const STAGE_ORDER = [
  'postule',
  'preselectionne',
  'skill_radar_envoye',
  'skill_radar_complete',
  'entretien_1',
  'aboro',
  'entretien_2',
  'proposition',
  'embauche',
  'refuse',
] as const

const MAX_NOTE_LINES = 8
const MAX_NOTE_CHARS = 600

interface StageGroup {
  statut: string
  events: CandidatureEvent[]
  latestDate: string | null
}

function groupEventsByStage(events: CandidatureEvent[]): StageGroup[] {
  const stageMap = new Map<string, CandidatureEvent[]>()

  for (const e of events) {
    const stage = e.statutTo ?? 'postule'
    if (!stageMap.has(stage)) stageMap.set(stage, [])
    stageMap.get(stage)!.push(e)
  }

  // Sort in pipeline order, with unknown stages at end
  const groups: StageGroup[] = []
  for (const statut of STAGE_ORDER) {
    const evts = stageMap.get(statut)
    if (evts && evts.length > 0) {
      groups.push({
        statut,
        events: evts,
        latestDate: evts[0]?.createdAt ?? null,
      })
    }
  }

  // Add any stages not in STAGE_ORDER
  for (const [statut, evts] of stageMap) {
    if (!STAGE_ORDER.includes(statut as (typeof STAGE_ORDER)[number]) && evts.length > 0) {
      groups.push({ statut, events: evts, latestDate: evts[0]?.createdAt ?? null })
    }
  }

  return groups
}

function eventIcon(event: CandidatureEvent) {
  if (event.type === 'document') return <Upload className="h-3 w-3" />
  if (event.emailSnapshot) return <Mail className="h-3 w-3" />
  if (event.statutTo) return <ArrowRightLeft className="h-3 w-3" />
  if (event.contentMd || event.notes) return <MessageSquare className="h-3 w-3" />
  return <Clock className="h-3 w-3" />
}

function computeSummary(events: CandidatureEvent[]): string {
  const totalEvents = events.length
  const emailCount = events.filter(e => e.emailSnapshot).length
  const docCount = events.filter(e => e.type === 'document').length

  if (events.length === 0) return ''

  const newest = events[0]
  const now = Date.now()
  const diff = now - new Date(newest.createdAt).getTime()
  const days = Math.floor(diff / 86_400_000)
  const lastActivity = days === 0 ? 'aujourd\'hui' : days === 1 ? 'hier' : `il y a ${days} jours`

  const parts: string[] = [
    `${totalEvents} evenement${totalEvents > 1 ? 's' : ''}`,
    `Derniere activite ${lastActivity}`,
  ]
  if (emailCount > 0) parts.push(`${emailCount} email${emailCount > 1 ? 's' : ''} envoye${emailCount > 1 ? 's' : ''}`)
  if (docCount > 0) parts.push(`${docCount} document${docCount > 1 ? 's' : ''}`)
  return parts.join(' — ')
}

/** Extract messageId from an emailSnapshot JSON string */
function extractMessageId(snapshot: string | null): string | null {
  if (!snapshot) return null
  try {
    const parsed = JSON.parse(snapshot)
    return parsed.messageId ?? null
  } catch {
    return null
  }
}

/** Build a map of messageId → delivery statuses from all events */
function buildDeliveryStatusMap(events: CandidatureEvent[]): Map<string, Set<string>> {
  const statusMap = new Map<string, Set<string>>()

  for (const e of events) {
    if (e.type === 'email_open' || e.type === 'email_failed' || e.type === 'email_clicked') {
      // Extract messageId from notes (format: "... (messageId: xxx)")
      const match = e.notes?.match(/messageId:\s*([^\s)]+)/)
      if (match) {
        const msgId = match[1]
        if (!statusMap.has(msgId)) statusMap.set(msgId, new Set())
        statusMap.get(msgId)!.add(e.type)
      }
    }
  }

  return statusMap
}

function EmailDeliveryBadges({ messageId, deliveryMap }: { messageId: string | null; deliveryMap: Map<string, Set<string>> }) {
  if (!messageId) return null
  const statuses = deliveryMap.get(messageId)

  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
        Envoye
      </Badge>
      {statuses?.has('email_open') && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
          Ouvert
        </Badge>
      )}
      {statuses?.has('email_failed') && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          Rebondi
        </Badge>
      )}
      {statuses?.has('email_clicked') && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
          Lien clique
        </Badge>
      )}
    </span>
  )
}

function EmailInlinePreview({ snapshot }: { snapshot: string }) {
  let parsed: { subject?: string; body?: string } | null = null
  try {
    parsed = JSON.parse(snapshot)
  } catch {
    return null
  }
  if (!parsed) return null

  return (
    <div className="mt-1.5 rounded border bg-muted/20 px-3 py-2 text-xs">
      {parsed.subject && (
        <p className="font-medium text-foreground mb-1">
          <Mail className="h-3 w-3 inline mr-1.5 text-muted-foreground" />
          {parsed.subject}
        </p>
      )}
      {parsed.body && (
        <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {parsed.body}
        </p>
      )}
    </div>
  )
}

function NoteContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > MAX_NOTE_CHARS || content.split('\n').length > MAX_NOTE_LINES

  if (!isLong || expanded) {
    return (
      <div className="mt-1.5">
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[10px] text-primary hover:underline mt-1"
          >
            Reduire
          </button>
        )}
      </div>
    )
  }

  // Truncated
  const truncated = content.split('\n').slice(0, MAX_NOTE_LINES).join('\n').slice(0, MAX_NOTE_CHARS)

  return (
    <div className="mt-1.5">
      <div className="prose prose-sm dark:prose-invert max-w-none text-xs [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 overflow-hidden">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{truncated + '...'}</ReactMarkdown>
      </div>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-[10px] text-primary hover:underline mt-1"
      >
        Lire la suite
      </button>
    </div>
  )
}

function EventRow({ event, deliveryMap }: { event: CandidatureEvent; deliveryMap: Map<string, Set<string>> }) {
  const isDocument = event.type === 'document'
  const isEmailSent = event.type === 'email_sent' || (event.emailSnapshot && event.type !== 'email_open' && event.type !== 'email_failed' && event.type !== 'email_clicked')
  const messageId = extractMessageId(event.emailSnapshot)

  // Skip rendering email_open / email_failed / email_clicked rows (shown as badges on the email_sent row)
  if (event.type === 'email_open' || event.type === 'email_failed' || event.type === 'email_clicked') {
    return null
  }

  const absoluteTimestamp = event.createdAt
    ? new Date(event.createdAt.includes('T') ? event.createdAt : event.createdAt.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : ''

  return (
    <div className="py-2 px-1">
      <div className="flex items-start gap-2.5 text-xs flex-wrap">
        <span className="mt-0.5 text-muted-foreground shrink-0">{eventIcon(event)}</span>
        <Tooltip>
          <TooltipTrigger render={<span className="text-muted-foreground shrink-0 w-24 tabular-nums cursor-default" />}>
            {formatDateTime(event.createdAt)}
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">
            {absoluteTimestamp}
          </TooltipContent>
        </Tooltip>
        {event.createdBy && (
          <span className="text-muted-foreground shrink-0">{event.createdBy}</span>
        )}
        {event.statutTo && (
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${STATUT_COLORS[event.statutTo] ?? ''}`}>
            {STATUT_LABELS[event.statutTo] ?? event.statutTo}
          </Badge>
        )}
        {isEmailSent && <EmailDeliveryBadges messageId={messageId} deliveryMap={deliveryMap} />}
        {event.notes && <span className="text-foreground">{event.notes}</span>}
        {isDocument && (
          <span className="text-muted-foreground flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Document uploade
          </span>
        )}
      </div>

      {/* Markdown content */}
      {event.contentMd && <NoteContent content={event.contentMd} />}

      {/* Email snapshot as bordered inline preview */}
      {event.emailSnapshot && <EmailInlinePreview snapshot={event.emailSnapshot} />}
    </div>
  )
}

export interface CandidateHistoryByStageProps {
  events: CandidatureEvent[]
  currentStatut: string
}

export default function CandidateHistoryByStage({ events, currentStatut }: CandidateHistoryByStageProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Aucun historique pour cette candidature.
      </div>
    )
  }

  const groups = groupEventsByStage(events)
  const summary = computeSummary(events)
  const deliveryMap = buildDeliveryStatusMap(events)

  // Default open: current stage + previous stage
  const currentGroupIndex = groups.findIndex(g => g.statut === currentStatut)
  const defaultOpen: number[] = []
  if (currentGroupIndex >= 0) defaultOpen.push(currentGroupIndex)
  if (currentGroupIndex > 0) defaultOpen.push(currentGroupIndex - 1)
  // If refused, show refuse + previous
  if (currentStatut === 'refuse') {
    const refuseIdx = groups.findIndex(g => g.statut === 'refuse')
    if (refuseIdx >= 0) defaultOpen.push(refuseIdx)
    if (refuseIdx > 0) defaultOpen.push(refuseIdx - 1)
  }

  return (
    <div>
      {/* Summary */}
      {summary && (
        <p className="text-xs text-muted-foreground mb-3">{summary}</p>
      )}

      <Accordion defaultValue={defaultOpen}>
        {groups.map((group, index) => (
          <AccordionItem key={group.statut} value={index}>
            <AccordionTrigger className="px-2 hover:no-underline">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${STATUT_COLORS[group.statut] ?? ''}`}>
                  {STATUT_LABELS[group.statut] ?? group.statut}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {group.events.length} evt
                </span>
                {group.latestDate && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatDateShort(group.latestDate)}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-2">
              <div className="divide-y">
                {group.events.map(e => (
                  <EventRow key={e.id} event={e} deliveryMap={deliveryMap} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

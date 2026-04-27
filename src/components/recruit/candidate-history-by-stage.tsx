import { useRef, useState } from 'react'
import { MarkdownNote } from '@/components/ui/markdown-note'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowRightLeft, Upload, FileText, Mail, MessageSquare, Clock, Eye, Download, Loader2, Pencil, FolderInput } from 'lucide-react'
import QuickNoteComposer from './quick-note-composer'
import { eventCategory, type EventCategory } from '@/lib/recruitment-events'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { STATUT_LABELS, STATUT_COLORS, formatDateTime, formatDateShort, isStatut } from '@/lib/constants'
import { StageFiche } from './stage-fiches/stage-fiche'
import { BADGE_STYLES, BADGE_SIZES } from '@/lib/badge-styles'
import type { CandidatureEvent, CandidatureDocument } from '@/hooks/use-candidate-data'

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
  documents: CandidatureDocument[]
  latestDate: string | null
}

function isPdf(filename: string): boolean {
  return filename.toLowerCase().endsWith('.pdf')
}

function effectiveName(doc: CandidatureDocument): string {
  return doc.display_filename || doc.filename
}

function groupEventsByStage(
  events: CandidatureEvent[],
  documents: CandidatureDocument[],
): StageGroup[] {
  // Walk events oldest-first so we can track the candidature's active statut
  // at the time of each event. v5.1.x correction (codex R3 + A.1): when an
  // event carries an explicit `stage` field (populated since v4.5 on note
  // POSTs and PATCHes, and on every status_change), use that. Fall back to
  // active-statut replay only for legacy events that pre-date the column —
  // otherwise a note retroactively assigned to "entretien_1" via the
  // composer would still get bucketed under whatever the candidate's
  // current active statut is, which is exactly what made per-stage notes
  // silently broken since v4.5.
  const sortedAsc = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const eventsByStage = new Map<string, CandidatureEvent[]>()
  const docsByStage = new Map<string, CandidatureDocument[]>()
  const eventsById = new Map<number, CandidatureEvent>()
  const stageTransitions: Array<{ at: string; to: string }> = [{ at: '0000', to: 'postule' }]

  let activeStatut = 'postule'
  for (const e of sortedAsc) {
    eventsById.set(e.id, e)
    if (e.type === 'status_change' && e.statutTo) {
      activeStatut = e.statutTo
      stageTransitions.push({ at: e.createdAt, to: activeStatut })
    }
    // Prefer the event's explicit `stage` field; fall back to replay for
    // legacy rows where stage is null/undefined.
    const eventStage = e.stage ?? activeStatut
    if (!eventsByStage.has(eventStage)) eventsByStage.set(eventStage, [])
    eventsByStage.get(eventStage)!.push(e)
  }

  // Bucket each document. v5.1.x correction (codex R1 + A.1): when the
  // document has an `event_id`, look up the linked event's `stage` and use
  // that — this is what the v4.5 reassign-dialog PATCH writes, and without
  // honoring it the visual move did nothing. Fall back to the time-replay
  // heuristic for legacy documents that pre-date the FK column or where
  // the linked event was deleted.
  for (const doc of documents) {
    if (doc.deleted_at) continue
    let stage: string | null = null
    if (doc.event_id != null) {
      const linked = eventsById.get(doc.event_id)
      if (linked?.stage) stage = linked.stage
      else if (linked?.type === 'status_change' && linked.statutTo) stage = linked.statutTo
    }
    if (!stage) {
      stage = 'postule'
      for (const t of stageTransitions) {
        if (t.at <= doc.created_at) stage = t.to
        else break
      }
    }
    if (!docsByStage.has(stage)) docsByStage.set(stage, [])
    docsByStage.get(stage)!.push(doc)
  }

  const latestDate = (evts: CandidatureEvent[], docs: CandidatureDocument[]) => {
    const all = [...evts.map(e => e.createdAt), ...docs.map(d => d.created_at)]
    if (all.length === 0) return null
    return all.reduce((a, b) => a > b ? a : b)
  }

  const allStageKeys = new Set<string>([...eventsByStage.keys(), ...docsByStage.keys()])
  const groups: StageGroup[] = []
  for (const statut of STAGE_ORDER) {
    if (!allStageKeys.has(statut)) continue
    const evts = eventsByStage.get(statut) ?? []
    const docs = docsByStage.get(statut) ?? []
    groups.push({ statut, events: evts, documents: docs, latestDate: latestDate(evts, docs) })
    allStageKeys.delete(statut)
  }
  // Any stages not in STAGE_ORDER land at the end in insertion order.
  for (const statut of allStageKeys) {
    const evts = eventsByStage.get(statut) ?? []
    const docs = docsByStage.get(statut) ?? []
    groups.push({ statut, events: evts, documents: docs, latestDate: latestDate(evts, docs) })
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

function computeSummary(events: CandidatureEvent[], documents: CandidatureDocument[]): string {
  if (events.length === 0 && documents.length === 0) return ''

  const emailCount = events.filter(e => e.type === 'email_sent').length
  const activeDocCount = documents.filter(d => !d.deleted_at).length

  // "Dernière activité" must consider BOTH the event stream and the
  // document uploads (docs are first-class history content now). Picking
  // the event-max alone undercounted recent work — codex design P2.
  const allDates = [
    ...events.map(e => e.createdAt),
    ...documents.filter(d => !d.deleted_at).map(d => d.created_at),
  ]
  const newestDate = allDates.reduce((a, b) => a > b ? a : b)
  const diff = Date.now() - new Date(newestDate).getTime()
  const days = Math.floor(diff / 86_400_000)
  const lastActivity = days === 0 ? 'aujourd\'hui' : days === 1 ? 'hier' : `il y a ${days} jours`

  const parts: string[] = [`Dernière activité ${lastActivity}`]
  if (emailCount > 0) parts.push(`${emailCount} email${emailCount > 1 ? 's' : ''} envoyé${emailCount > 1 ? 's' : ''}`)
  if (activeDocCount > 0) parts.push(`${activeDocCount} document${activeDocCount > 1 ? 's' : ''}`)
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
    if (
      e.type === 'email_open' ||
      e.type === 'email_failed' ||
      e.type === 'email_clicked' ||
      e.type === 'email_delivered' ||
      e.type === 'email_complained' ||
      e.type === 'email_delay'
    ) {
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
  // Same hierarchy as CandidateEmailsCard. Click is treated as the confirmed
  // "read" signal; pixel-based email_open is ignored because it is unreliable
  // (Apple MPP + Gmail image blocking).
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      {statuses?.has('email_failed') ? (
        <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.bounced}`}>Rebondi</Badge>
      ) : statuses?.has('email_clicked') ? (
        <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.read}`} title="Le candidat a cliqué un lien dans l'email — ouverture confirmée">Lu</Badge>
      ) : statuses?.has('email_delivered') ? (
        <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.delivered}`} title="Reçu par le serveur mail du destinataire">Livré</Badge>
      ) : (
        <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.sent}`}>Envoyé</Badge>
      )}
      {statuses?.has('email_complained') && (
        <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.spam}`} title="Le destinataire a marqué l'email comme spam">Spam</Badge>
      )}
      {statuses?.has('email_delay') && !statuses?.has('email_delivered') && !statuses?.has('email_failed') && (
        <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.delayed}`} title="Livraison temporairement retardée">Retardé</Badge>
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
        <MarkdownNote content={content} />
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
      <MarkdownNote content={truncated + '...'} className="overflow-hidden" />
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

/** Documents uploaded within this window after a status_change event are
 *  treated as attached to that transition. Only used as a legacy fallback
 *  for rows without event_id (new uploads carry the id explicitly). */
const ATTACHED_DOC_WINDOW_MS = 60_000

/** Parse SQLite-style "YYYY-MM-DD HH:MM:SS" (no timezone) as UTC, same as
 *  Date's native handling for ISO strings. Without this, new Date(str)
 *  interprets it as LOCAL time and comparisons against ISO timestamps
 *  drift by the local TZ offset — blowing past the 60s attach window. */
function parseUtcMs(s: string): number {
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').getTime()
}

function attachDocsToTransitions(
  timelineEvents: CandidatureEvent[],
  stageDocs: CandidatureDocument[],
): { byEventId: Map<number, CandidatureDocument[]>; unattached: CandidatureDocument[] } {
  const byEventId = new Map<number, CandidatureDocument[]>()
  const unattached: CandidatureDocument[] = []
  const eventIdsInStage = new Set(timelineEvents.map(e => e.id))
  const transitions = timelineEvents
    .filter(e => e.type === 'status_change')
    .map(e => ({ id: e.id, ts: parseUtcMs(e.createdAt) }))
    .sort((a, b) => a.ts - b.ts)

  for (const doc of stageDocs) {
    // Primary link: candidature_documents.event_id, populated by the
    // transition dialog. Deterministic — no timestamp guessing needed.
    if (doc.event_id && eventIdsInStage.has(doc.event_id)) {
      if (!byEventId.has(doc.event_id)) byEventId.set(doc.event_id, [])
      byEventId.get(doc.event_id)!.push(doc)
      continue
    }
    // Fallback for legacy rows (pre event_id wiring): attach to the
    // NEAREST transition within ±60s. Symmetric on purpose — old
    // transition dialogs uploaded BEFORE the status PATCH, new ones
    // upload AFTER, so a one-sided window misses half the legacy data.
    const docTs = parseUtcMs(doc.created_at)
    let bestParent: { id: number; ts: number } | null = null
    let bestDistance = Infinity
    for (const t of transitions) {
      const d = Math.abs(t.ts - docTs)
      if (d <= ATTACHED_DOC_WINDOW_MS && d < bestDistance) {
        bestParent = t
        bestDistance = d
      }
    }
    if (bestParent) {
      if (!byEventId.has(bestParent.id)) byEventId.set(bestParent.id, [])
      byEventId.get(bestParent.id)!.push(doc)
    } else {
      unattached.push(doc)
    }
  }
  return { byEventId, unattached }
}

function EventRow({
  event,
  deliveryMap,
  attachedDocs,
  onPreviewDoc,
  onReassignDoc,
}: {
  event: CandidatureEvent
  deliveryMap: Map<string, Set<string>>
  attachedDocs?: CandidatureDocument[]
  onPreviewDoc?: (d: CandidatureDocument) => void
  onReassignDoc?: (d: CandidatureDocument) => void
}) {
  const isDocument = event.type === 'document'
  const isEmailSent = event.type === 'email_sent'
  const messageId = extractMessageId(event.emailSnapshot)

  // Skip rendering deliverability events as separate rows — they surface as
  // badges on the parent email_sent row instead.
  if (
    event.type === 'email_open' ||
    event.type === 'email_failed' ||
    event.type === 'email_clicked' ||
    event.type === 'email_delivered' ||
    event.type === 'email_complained' ||
    event.type === 'email_delay'
  ) {
    return null
  }

  // Document UPLOAD events are redundant with the DocumentCard rendered
  // below. But delete / replace / restore / rename events (notes starting
  // with "Supprimé:" / "Remplacé:" / "Restauré:" / "Renommé:") are audit
  // content the DocumentCard can't show (the deleted doc is gone from
  // the active list). Keep those, drop the upload-notification rows.
  if (isDocument) {
    const notes = event.notes ?? ''
    const isUploadNote = notes.startsWith('Document uploadé:')
    if (isUploadNote) return null
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
        {/* Short notes on non-status events (email send descriptions etc.)
            stay inline. Status-change notes get the full quoted-block
            treatment below so typed-in transition notes are readable
            even when multi-line.
            v4.5: route through NoteContent (ReactMarkdown + remarkGfm)
            so `**bold**` and `## heading` in legacy `event.notes` rows
            render formatted instead of literal. NoteContent's prose
            wrapper is full-block; we keep this branch inline by
            wrapping in a span with `inline-block` + `align-baseline`
            so it composes with the surrounding flex line. */}
        {event.notes && event.type !== 'status_change' && (
          <span className="text-foreground inline-block align-baseline">
            <NoteContent content={event.notes} />
          </span>
        )}
      </div>

      {/* Transition notes — the free-text field from the transition dialog
          lands here as status_change.notes. Rendered as a bordered card
          under the event line so multi-line notes are actually readable.
          Special case: the intake-service writes the candidate's own
          "Message complémentaire" into the seed status_change.notes when
          the Drupal webhook fires (createdBy='drupal-webhook'). That text
          is the CANDIDATE'S voice, not a recruiter note — label it
          accordingly so the historique doesn't look like the recruiter
          wrote it. */}
      {event.type === 'status_change' && event.notes && (() => {
        const isCandidateMessage = event.createdBy === 'drupal-webhook'
        return (
          <div
            className={`mt-2 ml-7 rounded-md border px-3 py-2 ${
              isCandidateMessage ? 'bg-primary/5 border-primary/30' : 'bg-muted/20'
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {isCandidateMessage ? 'Message du candidat' : 'Note de transition'}
            </p>
            <NoteContent content={event.notes} />
          </div>
        )
      })()}

      {/* Markdown content */}
      {event.contentMd && <NoteContent content={event.contentMd} />}

      {/* Attached documents — docs uploaded within ~1min of this transition
          are treated as "added while moving to this stage" and surfaced
          inline so the recruiter sees exactly which file goes with which
          action instead of hunting the separate documents panel. */}
      {attachedDocs && attachedDocs.length > 0 && onPreviewDoc && (
        <div className="mt-2 ml-7 grid gap-0.5">
          {attachedDocs.map(d => (
            <DocumentCard key={d.id} doc={d} onPreview={onPreviewDoc} onReassign={onReassignDoc} />
          ))}
        </div>
      )}

      {/* Email snapshot as bordered inline preview */}
      {event.emailSnapshot && <EmailInlinePreview snapshot={event.emailSnapshot} />}
    </div>
  )
}

/** Human label for the internal document type. Keeps the audit value
 *  compact while the UI reads like prose ("CV", "Lettre", "Autre" vs.
 *  "CV"/"LETTRE"/"OTHER"). */
const DOC_TYPE_LABEL: Record<string, string> = {
  cv: 'CV',
  lettre: 'Lettre de motivation',
  aboro: 'Âboro',
  entretien: 'Entretien',
  proposition: 'Proposition',
  administratif: 'Administratif',
  other: 'Autre',
}

function DocumentCard({ doc, onPreview, onReassign }: { doc: CandidatureDocument; onPreview: (d: CandidatureDocument) => void; onReassign?: (d: CandidatureDocument) => void }) {
  const name = effectiveName(doc)
  const typeLabel = DOC_TYPE_LABEL[doc.type] ?? doc.type
  return (
    <div className="flex items-center gap-2 px-1.5 py-1.5 text-xs rounded-sm hover:bg-muted/40 transition-colors">
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" title={name !== doc.filename ? `Original : ${doc.filename}` : undefined}>{name}</p>
        <p className="text-[10px] text-muted-foreground">
          {typeLabel}
          <span className="mx-1">·</span>
          {formatDateTime(doc.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {isPdf(doc.filename) && (
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0"
            title="Voir le PDF" aria-label={`Voir ${name}`}
            onClick={() => onPreview(doc)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0"
          title="Télécharger" aria-label={`Télécharger ${name}`}
          onClick={() => window.open(`/api/recruitment/documents/${doc.id}/download`, '_blank')}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        {onReassign && (
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Déplacer vers une autre étape" aria-label={`Déplacer ${name} vers une autre étape`}
            onClick={() => onReassign(doc)}
          >
            <FolderInput className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

/** v4.5: per-stage note composer hooks. When supplied, every stage in
 *  the accordion renders an inline `QuickNoteComposer` at the top of
 *  its content, pinned to that stage's statut so the recruiter can
 *  retroactively attach a note to the right step. The hooks mirror the
 *  composer's optimistic-render contract (prepend / replace / rollback).
 *  When omitted, the composer doesn't render and the historique stays
 *  read-only (legacy behavior). */
export interface StageComposerHooks {
  candidatureId: string
  currentUserSlug: string
  currentUserName?: string | null
  onPublished: (event: CandidatureEvent) => void
  onOptimisticPrepend?: (tempEvent: CandidatureEvent) => void
  onReplaceTemp?: (tempId: number, real: CandidatureEvent) => void
  onRollbackTemp?: (tempId: number) => void
}

/** v4.5: optional edit hook for note rows. The pencil button on a note
 *  row calls this with the event id; the caller (typically the page-
 *  level workspace) opens an edit dialog and PATCHes the row. Decoupled
 *  from this component so the inline editor can be swapped without
 *  touching the timeline rendering. */
export type OnEditNote = (event: CandidatureEvent) => void

/** v4.5: optional reassign hook for document cards. The folder-arrow
 *  button on a document calls this with the doc; the caller opens the
 *  stage-reassign dialog and PATCHes `event_id`. */
export type OnReassignDoc = (doc: CandidatureDocument) => void

/** v4.6: client-side filter that hides events outside the chosen
 *  category. 'all' passes everything through; other values match the
 *  EventCategory taxonomy (`eventCategory()` in
 *  `src/lib/recruitment-events.ts`). Notes always pass through (the
 *  composer + manual notes sit inside the per-stage block and a hard
 *  filter to "transitions" would hide the recruiter's own writing,
 *  which we never want). */
export type HistoryFilter = 'all' | EventCategory

export interface CandidateHistoryByStageProps {
  events: CandidatureEvent[]
  documents?: CandidatureDocument[]
  currentStatut: string
  /** Per-stage composer hooks. See StageComposerHooks for the contract.
   *  Optional — when omitted the historique is read-only. */
  composer?: StageComposerHooks
  /** Pencil-edit hook on note rows. */
  onEditNote?: OnEditNote
  /** Folder-arrow reassign hook on document cards. */
  onReassignDoc?: OnReassignDoc
  /** v4.6: filter category for the rendered timeline. Defaults to 'all'.
   *  Composer + manual notes always remain visible so the recruiter
   *  can still capture from inside a filtered view. */
  filter?: HistoryFilter
  /** v5.1: candidature id used by the per-stage <StageFiche>. When
   *  absent, no fiches are rendered (lets tests opt out / read-only
   *  surfaces stay simple). */
  candidatureId?: string
  /** v5.1: bumped by the page-level SSE handler when stage_data_changed
   *  fires; passed through to <StageFiche> to invalidate its query. */
  stageDataRefetchSignal?: number
}

export default function CandidateHistoryByStage({ events, documents = [], currentStatut, composer, onEditNote, onReassignDoc, filter = 'all', candidatureId, stageDataRefetchSignal }: CandidateHistoryByStageProps) {
  const [previewDoc, setPreviewDoc] = useState<CandidatureDocument | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Reset loading when a new doc opens so the spinner is consistent.
  const openPreview = (d: CandidatureDocument) => { setPreviewLoading(true); setPreviewDoc(d) }

  // v5.1.x A.2 (codex R2 + eng-review I1+I2): controlled accordion keyed by
  // stable stage name, append-only on SSE/status changes.
  //
  // Why controlled: a teammate advancing the candidature in another tab
  // arrives via SSE → page-level setCandidatures runs → currentStatut prop
  // changes here. The default-uncontrolled accordion would silently keep
  // its old open state because defaultValue is read once. We need the
  // open set to track currentStatut additively.
  //
  // Append-only behavior (user-confirmed): when currentStatut changes,
  // ADD the new statut to the open set without removing whatever the
  // recruiter manually expanded. Olivier reading the Postulé block must
  // not have it snapped shut when Yolan advances the candidate from
  // another tab.
  //
  // CRITICAL (codex R/P1): hooks must run unconditionally on every render —
  // they live ABOVE the early return for the empty-history case so adding
  // history later (initial async load, SSE-created note) doesn't change
  // the hook count between renders.
  const [open, setOpen] = useState<string[]>(() => {
    const out: string[] = [currentStatut]
    if (currentStatut === 'refuse') {
      // Refuse usually has a sibling exit stage worth showing too. We
      // can't know the exact predecessor without the full groups array
      // (which depends on hooks running first), so we leave the second
      // open-stage seed to the in-render append below if needed.
    }
    return out
  })
  const lastStatut = useRef<string>(currentStatut)
  // React-docs-sanctioned "reset state during render on prop change" idiom
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // The react-hooks/refs lint flags ref reads/writes during render
  // conservatively but the idiom is supported.
  // eslint-disable-next-line react-hooks/refs
  if (lastStatut.current !== currentStatut) {
    // eslint-disable-next-line react-hooks/refs
    lastStatut.current = currentStatut
    setOpen(prev => prev.includes(currentStatut) ? prev : [...prev, currentStatut])
  }

  if (events.length === 0 && documents.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Aucun historique pour cette candidature.
      </div>
    )
  }

  const groups = groupEventsByStage(events, documents)
  const summary = computeSummary(events, documents)
  const deliveryMap = buildDeliveryStatusMap(events)

  return (
    <div>
      {/* Summary */}
      {summary && (
        <p className="text-xs text-muted-foreground mb-3">{summary}</p>
      )}

      <Accordion
        multiple
        value={open}
        onValueChange={(v) => setOpen(v as string[])}
      >
        {/* v5.1.x A.2 + issues 7+11: render reverse-pipeline order so the
            current stage is at the top. Within each stage, events are
            already sorted descending (line ~770). The reverse is
            render-side only — `groupEventsByStage` keeps semantic
            pipeline order so any future consumer reads it the same. */}
        {[...groups].reverse().map((group) => {
          // Split events into transitions/emails (timeline) vs notes
          // (contentMd or typed note events, rendered as a quiet section).
          // visibleTimelineCount must match what EventRow actually renders —
          // it drops deliverability signals AND document-upload notes,
          // both of which would otherwise inflate the count pill.
          //
          // v4.6: respect the filter chips. 'all' passes through; a
          // category filter narrows the timeline to that bucket. Notes
          // are filtered separately below — when the filter is 'notes'
          // we hide the transitions/emails timeline entirely; when it's
          // 'transitions' / 'emails' / 'documents' we hide the notes
          // section. EventCategory matching uses the shared `eventCategory`
          // helper so the chip-vs-row mapping stays consistent.
          const passesFilter = (e: CandidatureEvent): boolean => {
            if (filter === 'all') return true
            return eventCategory(e) === filter
          }
          const timelineEvents = group.events
            .filter(e => !(e.type === 'note' && e.contentMd))
            .filter(passesFilter)
          const isDeliverability = (t: string) => t === 'email_open' || t === 'email_failed' || t === 'email_clicked' || t === 'email_delivered' || t === 'email_complained' || t === 'email_delay'
          const isRedundantUpload = (e: CandidatureEvent) => e.type === 'document' && (e.notes ?? '').startsWith('Document uploadé:')
          const noteEvents = group.events
            .filter(e => e.type === 'note' && e.contentMd)
            .filter(e => filter === 'all' || filter === 'notes' || eventCategory(e) === filter)
          const visibleTimelineCount = timelineEvents.filter(e =>
            !isDeliverability(e.type) && !isRedundantUpload(e)
          ).length
          // Match each document to the transition that produced it (doc
          // uploaded within 60s after a status_change lands in that event).
          // Unattached docs (ad-hoc uploads outside the transition dialog)
          // fall into the "Autres documents" section at the bottom.
          const { byEventId: docsByEvent, unattached: unattachedDocs } = attachDocsToTransitions(timelineEvents, group.documents)
          const isCurrent = group.statut === currentStatut
          // Build a scannable count line, e.g. "2 transitions · 1 note · 3 documents".
          // Readable text beats three ambiguous icon+number pills (codex
          // design P1: "compact but ambiguous and visually fussy").
          // Notes come from two places: standalone note events (contentMd)
          // AND the free-text field on transition events. Count both so
          // the pill is honest.
          const transitionNoteCount = group.events.filter(e => e.type === 'status_change' && !!e.notes).length
          const totalNotes = noteEvents.length + transitionNoteCount
          const countParts: string[] = []
          if (visibleTimelineCount > 0) countParts.push(`${visibleTimelineCount} transition${visibleTimelineCount > 1 ? 's' : ''}`)
          if (totalNotes > 0) countParts.push(`${totalNotes} note${totalNotes > 1 ? 's' : ''}`)
          if (group.documents.length > 0) countParts.push(`${group.documents.length} document${group.documents.length > 1 ? 's' : ''}`)
          return (
            <AccordionItem key={group.statut} value={group.statut} className={isCurrent ? 'border-l-2 border-l-primary pl-1 -ml-[2px]' : undefined}>
              <AccordionTrigger className="px-2 hover:no-underline">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${STATUT_COLORS[group.statut] ?? ''}`}>
                    {STATUT_LABELS[group.statut] ?? group.statut}
                  </Badge>
                  {isCurrent && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-primary/50 text-primary shrink-0">
                      Actuel
                    </Badge>
                  )}
                  {countParts.length > 0 && (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {countParts.join(' · ')}
                    </span>
                  )}
                  {group.latestDate && (
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                      {formatDateShort(group.latestDate)}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-2">
                <div className="space-y-4">
                  {/* v5.1: per-stage structured fiche (entretien, aboro, ...).
                      Renders only for stages with a registered fiche
                      schema; the dispatcher returns null otherwise so
                      this stays a no-op for postule / preselection /
                      refuse without an enclosing conditional. The
                      fiche stores stage-specific data; the markdown
                      composer below is for free-form reasoning. */}
                  {candidatureId && isStatut(group.statut) && (
                    <StageFiche
                      candidatureId={candidatureId}
                      stage={group.statut}
                      refetchSignal={stageDataRefetchSignal}
                    />
                  )}

                  {/* v4.5: per-stage note composer.
                      Pinned to this stage via the `stage` prop — the
                      backend writes that into candidature_events.stage
                      so retroactive notes attach to the right step.
                      The composer reuses the page-level workspace's
                      optimistic prepend / replace / rollback hooks. */}
                  {composer && (
                    <QuickNoteComposer
                      candidatureId={composer.candidatureId}
                      currentUserSlug={composer.currentUserSlug}
                      currentUserName={composer.currentUserName}
                      onPublished={composer.onPublished}
                      onOptimisticPrepend={composer.onOptimisticPrepend}
                      onReplaceTemp={composer.onReplaceTemp}
                      onRollbackTemp={composer.onRollbackTemp}
                      stage={group.statut}
                      placeholder={`Note pour l'étape « ${STATUT_LABELS[group.statut] ?? group.statut} »…`}
                      compact
                    />
                  )}

                  {/* Transitions + emails — each transition carries its
                      attached document(s) inline below it (see attachDocsTo
                      Transitions for the time-window match). Reads as a
                      single action-by-action journal instead of three
                      disconnected sections. */}
                  {visibleTimelineCount > 0 && (
                    <div className="space-y-1">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Transitions &amp; emails ({visibleTimelineCount})
                      </h5>
                      <div className="divide-y">
                        {[...timelineEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(e => (
                          <EventRow
                            key={e.id}
                            event={e}
                            deliveryMap={deliveryMap}
                            attachedDocs={docsByEvent.get(e.id)}
                            onPreviewDoc={openPreview}
                            onReassignDoc={onReassignDoc}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes — markdown-rendered, one block per note event.
                      v4.5: pencil button opens the inline edit dialog.
                      `updated_at` shows up next to the timestamp once the
                      note has been edited at least once. */}
                  {noteEvents.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Notes ({noteEvents.length})
                      </h5>
                      {[...noteEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(e => (
                        <div key={e.id} className="rounded-md border bg-muted/20 p-2.5">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                            <span>{formatDateTime(e.createdAt)}</span>
                            {e.createdBy && <span>· {e.createdBy}</span>}
                            {e.updatedAt && <span className="italic">· modifiée le {formatDateTime(e.updatedAt)}</span>}
                            {onEditNote && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => onEditNote(e)}
                                aria-label="Modifier cette note"
                                title="Modifier cette note"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <NoteContent content={e.contentMd ?? ''} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Documents that weren't tied to a specific transition
                      (ad-hoc uploads via the main Documents panel while in
                      this stage). Most docs attach to a transition above
                      and never land here. */}
                  {unattachedDocs.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Autres documents ({unattachedDocs.length})
                      </h5>
                      <div className="grid gap-1">
                        {[...unattachedDocs].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(d => (
                          <DocumentCard key={d.id} doc={d} onPreview={openPreview} onReassign={onReassignDoc} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>

      {/* Shared preview dialog — opens for PDF documents via Eye button */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null) }}>
        <DialogContent className="w-[95vw] sm:max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="truncate text-sm">
              {previewDoc ? effectiveName(previewDoc) : ''}
            </DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div className="relative flex-1">
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Chargement du PDF…</span>
                </div>
              )}
              <iframe
                src={`/api/recruitment/documents/${previewDoc.id}/preview`}
                title={`Aperçu de ${effectiveName(previewDoc)}`}
                className="flex-1 w-full h-full border-0"
                onLoad={() => setPreviewLoading(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowRightLeft, Mail, MailCheck, MailX, FileText, MessageSquare, AlertCircle, RotateCcw, Sparkles,
} from 'lucide-react'
import InitialsBadge from '@/components/ui/initials-badge'
import {
  eventCategory, eventMarkdownBody, eventTitle, formatActor, formatEventTimestamp,
  isDeliverabilitySignal, isRedundantUploadLog, parseEmailSnapshot,
} from '@/lib/recruitment-events'
import QuickNoteComposer from './quick-note-composer'
import type { CandidatureEvent, CandidatureDocument } from '@/hooks/use-candidate-data'

/**
 * Compact activity strip shown directly under the pipeline stepper. Lists
 * the N most recent events on a candidature so the recruiter sees the
 * trail without scrolling to the bottom-of-page historique. Includes the
 * quick-note composer at the top so capturing a thought is always one
 * textarea away.
 *
 * Design notes:
 *  - Default 5 rows; a "Voir l'historique complet" anchor jumps to the
 *    full accordion lower on the page when there's more to see.
 *  - Events are filtered to the kinds a recruiter glances at between
 *    stages: transitions, emails at the lifecycle level (scheduled/sent/
 *    cancelled/failed), documents, and notes. Deliverability signals
 *    (open/click/deliver) stay in the full history only — they'd inflate
 *    the preview without adding decision value.
 *  - Redundant "Document uploadé: …" events are also filtered since the
 *    full documents panel surfaces the same information.
 *  - Markdown note bodies are clamped to ~3 lines with a disclosure to
 *    expand in-place. Legacy note rows that hold a JSON blob (structured
 *    notes) suppress the body render so the journal stays readable.
 */
export interface RecentJournalProps {
  events: CandidatureEvent[]
  documents: CandidatureDocument[]
  candidatureId: string
  currentUserSlug: string
  currentUserName?: string | null
  /** Receives the freshly-published note event from the composer so the
   *  caller can prepend it to its event state. */
  onNotePublished: (event: CandidatureEvent) => void
  /** Target selector for the "Voir l'historique complet" anchor. */
  historyAnchorId: string
}

const DEFAULT_LIMIT = 5

export default function RecentJournal({
  events, documents, candidatureId, currentUserSlug, currentUserName, onNotePublished, historyAnchorId,
}: RecentJournalProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    return events
      .filter(e => !isDeliverabilitySignal(e) && !isRedundantUploadLog(e))
      .sort((a, b) => {
        // Primary: createdAt DESC. Secondary: id DESC — tie-breaker when
        // two events share the same timestamp (common when a transition
        // and its email event are inserted in the same handler).
        const cmp = b.createdAt.localeCompare(a.createdAt)
        if (cmp !== 0) return cmp
        return (b.id ?? 0) - (a.id ?? 0)
      })
  }, [events])

  const visible = filtered.slice(0, DEFAULT_LIMIT)
  const remaining = filtered.length - visible.length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Journal récent
        </p>
        <p className="text-[10px] text-muted-foreground">
          · {filtered.length} événement{filtered.length > 1 ? 's' : ''}
        </p>
      </div>

      <QuickNoteComposer
        candidatureId={candidatureId}
        currentUserSlug={currentUserSlug}
        currentUserName={currentUserName}
        onPublished={onNotePublished}
      />

      {visible.length === 0 ? (
        <div className="rounded-md border bg-card p-4 text-center text-sm text-muted-foreground">
          Aucune activité pour cette candidature encore.
        </div>
      ) : (
        <ol className="space-y-2">
          {visible.map((e, idx) => {
            // Fall back to an index-prefixed key when id is missing —
            // defensive against optimistic rows with temp ids or any
            // future row kinds lacking server-assigned ids.
            const idKey = e.id != null ? `e-${e.id}` : `idx-${idx}`
            return (
              <JournalRow
                key={idKey}
                event={e}
                documents={documents}
                expanded={!!expanded[idKey]}
                onToggleExpanded={() => setExpanded(prev => ({ ...prev, [idKey]: !prev[idKey] }))}
              />
            )
          })}
        </ol>
      )}

      {remaining > 0 && (
        <a
          href={`#${historyAnchorId}`}
          className="inline-block text-xs text-primary hover:underline"
        >
          Voir l'historique complet ({remaining} autre{remaining > 1 ? 's' : ''})
        </a>
      )}
    </div>
  )
}

function JournalRow({
  event, documents, expanded, onToggleExpanded,
}: { event: CandidatureEvent; documents: CandidatureDocument[]; expanded: boolean; onToggleExpanded: () => void }) {
  const category = eventCategory(event)
  const icon = iconFor(event)
  const title = eventTitle(event)
  const body = eventMarkdownBody(event)
  const ts = formatEventTimestamp(event.createdAt)
  const actor = formatActor(event.createdBy)
  const isNote = event.type === 'note'
  const attachedDocs = category === 'documents' ? documents.filter(d => d.event_id === event.id && !d.deleted_at) : []
  const emailSnapshot = category === 'emails' ? parseEmailSnapshot(event.emailSnapshot) : null

  const shouldClamp = !!body && body.length > 200 && !expanded

  return (
    <li className="rounded-md border bg-card p-3 flex gap-3">
      <div className="shrink-0">
        {isNote ? (
          <InitialsBadge name={actor} size="sm" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="font-medium truncate">
            {isNote ? <><span className="text-foreground">{actor}</span> <span className="text-muted-foreground">a ajouté une note</span></> : title}
          </p>
          <p className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            <time dateTime={event.createdAt} title={ts.absolute}>{ts.absolute}</time>
            <span className="ml-1.5 opacity-70">· {ts.relative}</span>
          </p>
        </div>

        {emailSnapshot?.subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            « {emailSnapshot.subject} »
            {emailSnapshot.to && (
              <span className="opacity-70"> · à {typeof emailSnapshot.to === 'string' ? emailSnapshot.to : emailSnapshot.to.join(', ')}</span>
            )}
          </p>
        )}

        {!isNote && !emailSnapshot?.subject && event.notes && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{event.notes}</p>
        )}

        {body && (
          <div
            className={`prose prose-sm dark:prose-invert max-w-none text-sm mt-1.5 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 ${
              shouldClamp ? 'line-clamp-3' : ''
            }`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        )}
        {!!body && body.length > 200 && (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="mt-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          >
            {expanded ? 'Réduire' : 'Voir plus'}
          </button>
        )}

        {attachedDocs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachedDocs.map(d => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[11px]"
              >
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="truncate max-w-[180px]">{d.display_filename || d.filename}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function iconFor(event: CandidatureEvent) {
  switch (event.type) {
    case 'status_change': return <ArrowRightLeft className="h-4 w-4" aria-hidden />
    case 'email_scheduled': return <Mail className="h-4 w-4" aria-hidden />
    case 'email_sent': return <MailCheck className="h-4 w-4" aria-hidden />
    case 'email_cancelled':
    case 'email_failed': return <MailX className="h-4 w-4" aria-hidden />
    case 'document': return <FileText className="h-4 w-4" aria-hidden />
    case 'note': return <MessageSquare className="h-4 w-4" aria-hidden />
    case 'evaluation_reopened': return <RotateCcw className="h-4 w-4" aria-hidden />
    case 'onboarding': return <Sparkles className="h-4 w-4" aria-hidden />
    default: return <AlertCircle className="h-4 w-4" aria-hidden />
  }
}

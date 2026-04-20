import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Mail } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, STATUT_LABELS } from '@/lib/constants'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

interface EmailEntry {
  event: CandidatureEvent
  messageId: string | null
  subject: string | null
  body: string | null
  statuses: Set<string>
  statusTo: string | null
}

function parseSnapshot(snapshot: string | null): { subject?: string; body?: string; messageId?: string } {
  if (!snapshot) return {}
  try {
    return JSON.parse(snapshot)
  } catch {
    return {}
  }
}

/**
 * Scan the event list and build one EmailEntry per email_sent event, enriched
 * with its delivery statuses (open / bounce / click) and the status_change
 * that triggered it (looked up by closest preceding status_change, since the
 * backend inserts email_sent right after status_change in the same handler).
 */
function buildEmailEntries(events: CandidatureEvent[]): EmailEntry[] {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const statusMap = new Map<string, Set<string>>()
  for (const e of sorted) {
    if (e.type === 'email_open' || e.type === 'email_failed' || e.type === 'email_clicked') {
      const match = e.notes?.match(/messageId:\s*([^\s)]+)/)
      if (match) {
        const id = match[1]
        if (!statusMap.has(id)) statusMap.set(id, new Set())
        statusMap.get(id)!.add(e.type)
      }
    }
  }

  const entries: EmailEntry[] = []
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]
    if (e.type !== 'email_sent') continue
    const snap = parseSnapshot(e.emailSnapshot)
    const messageId = snap.messageId ?? null
    // Find the most recent status_change at or before this email_sent.
    let statusTo: string | null = null
    for (let j = i; j >= 0; j--) {
      if (sorted[j].type === 'status_change' && sorted[j].statutTo) {
        statusTo = sorted[j].statutTo
        break
      }
    }
    entries.push({
      event: e,
      messageId,
      subject: snap.subject ?? null,
      body: snap.body ?? null,
      statuses: messageId ? (statusMap.get(messageId) ?? new Set()) : new Set(),
      statusTo,
    })
  }
  return entries.reverse() // newest first
}

export default function CandidateEmailsCard({ events }: { events: CandidatureEvent[] }) {
  const entries = useMemo(() => buildEmailEntries(events), [events])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (entries.length === 0) return null

  const openedCount = entries.filter(e => e.statuses.has('email_open')).length
  const bouncedCount = entries.filter(e => e.statuses.has('email_failed')).length

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-lg border bg-card/50">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">Emails envoyés</span>
        <span className="text-xs text-muted-foreground">
          {entries.length} envoyé{entries.length > 1 ? 's' : ''}
          {openedCount > 0 && ` · ${openedCount} ouvert${openedCount > 1 ? 's' : ''}`}
          {bouncedCount > 0 && ` · ${bouncedCount} rebondi${bouncedCount > 1 ? 's' : ''}`}
        </span>
      </div>
      <ul className="divide-y">
        {entries.map(entry => {
          const isOpen = expanded.has(entry.event.id)
          const statusLabel = entry.statusTo ? (STATUT_LABELS[entry.statusTo] ?? entry.statusTo) : '—'
          return (
            <li key={entry.event.id}>
              <button
                type="button"
                onClick={() => toggle(entry.event.id)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
              >
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="text-xs text-muted-foreground shrink-0 w-24">
                  {formatDateTime(entry.event.createdAt)}
                </span>
                <span className="text-xs font-medium shrink-0">{statusLabel}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {entry.subject ?? 'Email'}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    Envoyé
                  </Badge>
                  {entry.statuses.has('email_open') && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                      Ouvert
                    </Badge>
                  )}
                  {entry.statuses.has('email_clicked') && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                      Cliqué
                    </Badge>
                  )}
                  {entry.statuses.has('email_failed') && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      Rebondi
                    </Badge>
                  )}
                  {!entry.statuses.has('email_open') && !entry.statuses.has('email_failed') && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
                      Non ouvert
                    </Badge>
                  )}
                </span>
              </button>
              {isOpen && entry.body && (
                <div className="px-3 pb-3 pt-1 text-sm prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 border-t bg-muted/20">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

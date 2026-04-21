import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Mail } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, STATUT_LABELS } from '@/lib/constants'
import { BADGE_STYLES, BADGE_SIZES } from '@/lib/badge-styles'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

type EmailRecipient = 'candidate' | 'lead' | 'team'

interface EmailEntry {
  event: CandidatureEvent
  messageId: string | null
  subject: string | null
  body: string | null
  statuses: Set<string>
  statusTo: string | null
  recipient: EmailRecipient
  /** Destination address(es) for display — extracted from the snapshot's
   *  optional `to` field, else parsed from the event notes. Empty string
   *  when nothing can be recovered (very old rows). */
  toAddress: string
}

function parseSnapshot(snapshot: string | null): { subject?: string; body?: string; messageId?: string; recipient?: string; to?: string | string[] } {
  if (!snapshot) return {}
  try {
    return JSON.parse(snapshot)
  } catch {
    return {}
  }
}

/** Best-effort recipient inference. The snapshot's `recipient` field is the
 *  source of truth for recent emails. Fallbacks for older rows: "Notification
 *  interne" / "envoyé à lead" in notes → team, everything else → candidate. */
function inferRecipient(snapshot: { recipient?: string }, notes: string | null): EmailRecipient {
  if (snapshot.recipient === 'lead' || snapshot.recipient === 'team') return 'lead'
  if (snapshot.recipient === 'candidate') return 'candidate'
  if (notes && /notification interne|envoy[ée]e? à (lead|l'équipe|director|directeur)/i.test(notes)) return 'lead'
  return 'candidate'
}

/** Extract the destination address from snapshot.to (new events) or parse
 *  from notes (legacy events). Notes patterns: "envoyée à X@Y" or
 *  "Notification interne envoyée à A, B, C". */
function extractToAddress(snapshot: { to?: string | string[] }, notes: string | null): string {
  if (snapshot.to) {
    return Array.isArray(snapshot.to) ? snapshot.to.join(', ') : String(snapshot.to)
  }
  if (!notes) return ''
  // Match "envoyé/envoyée à <rest-of-line>"
  const m = notes.match(/envoy[ée]e?\s+à\s+(.+)$/i)
  if (!m) return ''
  // Trim trailing explanations like "(mock)" or "(preview)"
  return m[1].replace(/\s*\(.*?\)\s*$/, '').trim()
}

/**
 * Scan the event list and build one EmailEntry per email_sent event, enriched
 * with its delivery statuses (open / bounce / click) and the status_change
 * that triggered it (looked up by closest preceding status_change, since the
 * backend inserts email_sent right after status_change in the same handler).
 */
const DELIVERABILITY_EVENT_TYPES = [
  'email_open',
  'email_clicked',
  'email_delivered',
  'email_complained',
  'email_delay',
  'email_failed',
] as const

function buildEmailEntries(events: CandidatureEvent[]): EmailEntry[] {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const statusMap = new Map<string, Set<string>>()
  for (const e of sorted) {
    if ((DELIVERABILITY_EVENT_TYPES as readonly string[]).includes(e.type)) {
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
      recipient: inferRecipient(snap, e.notes),
      toAddress: extractToAddress(snap, e.notes),
    })
  }
  return entries.reverse() // newest first
}

type EmailTab = 'candidate' | 'team' | 'all'

export default function CandidateEmailsCard({ events }: { events: CandidatureEvent[] }) {
  const entries = useMemo(() => buildEmailEntries(events), [events])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  // Default to "Candidat" view since that's what a recruiter usually wants
  // to audit (what did WE say to the candidate). Équipe is secondary (inbound
  // to us). "Tous" for power-users scanning the whole timeline.
  const [tab, setTab] = useState<EmailTab>('candidate')

  if (entries.length === 0) return null

  // "Lu" = clicked (verified read). We treat clicks as the trustworthy "opened"
  // signal because the pixel-based email_open is unreliable (Apple MPP inflates
  // it, Gmail image-blocking deflates it). We still track email_open as a soft
  // fallback tooltip but do not render it as a strong badge.
  const readCount = entries.filter(e => e.statuses.has('email_clicked')).length
  const bouncedCount = entries.filter(e => e.statuses.has('email_failed')).length
  const complainedCount = entries.filter(e => e.statuses.has('email_complained')).length
  const candidateCount = entries.filter(e => e.recipient === 'candidate').length
  const teamCount = entries.length - candidateCount

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Apply tab filter. "all" keeps the source-of-truth ordering; per-tab
  // views inherit the newest-first order from buildEmailEntries.
  const visibleEntries = entries.filter(e => {
    if (tab === 'all') return true
    if (tab === 'candidate') return e.recipient === 'candidate'
    return e.recipient === 'lead' || e.recipient === 'team'
  })

  const tabDef: { key: EmailTab; label: string; count: number }[] = [
    { key: 'candidate', label: 'Candidat', count: candidateCount },
    { key: 'team', label: 'Équipe', count: teamCount },
    { key: 'all', label: 'Tous', count: entries.length },
  ]

  return (
    <div className="rounded-lg border bg-card/50">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">Emails envoyés</span>
        <span className="text-xs text-muted-foreground">
          {readCount > 0 && `${readCount} lu${readCount > 1 ? 's' : ''}`}
          {readCount > 0 && (complainedCount > 0 || bouncedCount > 0) && ' · '}
          {complainedCount > 0 && `${complainedCount} signalé${complainedCount > 1 ? 's' : ''} spam`}
          {complainedCount > 0 && bouncedCount > 0 && ' · '}
          {bouncedCount > 0 && `${bouncedCount} rebondi${bouncedCount > 1 ? 's' : ''}`}
        </span>
      </div>
      {/* Tabs — Candidat default, Équipe + Tous behind a single click. Empty
          counts still render so the tab order stays stable as new emails arrive. */}
      <div role="tablist" aria-label="Filtre emails" className="flex items-center gap-1 px-3 pt-2 pb-1 border-b">
        {tabDef.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                active
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {t.label}{' '}
              <span className={`tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>({t.count})</span>
            </button>
          )
        })}
      </div>
      {visibleEntries.length === 0 ? (
        <div className="px-3 py-6 text-xs text-muted-foreground text-center">
          Aucun email dans ce filtre.
        </div>
      ) : null}
      <ul className="divide-y">
        {visibleEntries.map(entry => {
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
                <Badge
                  variant="outline"
                  className={`${BADGE_SIZES.xs} shrink-0 ${
                    entry.recipient === 'candidate'
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  }`}
                  title={entry.recipient === 'candidate' ? 'Envoyé au candidat' : "Envoyé à l'équipe"}
                >
                  {entry.recipient === 'candidate' ? 'Candidat' : 'Équipe'}
                </Badge>
                <span className="text-xs truncate flex-1 min-w-0">
                  <span className="text-muted-foreground">{entry.subject ?? 'Email'}</span>
                  {entry.toAddress ? (
                    <span className="text-muted-foreground/70 ml-1.5">
                      → <span className="font-mono">{entry.toAddress}</span>
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {/* Badge hierarchy (weakest → strongest): Envoyé < Livré < Lu.
                      Bad-path badges (Retardé / Spam / Rebondi) are always shown
                      when present, regardless of the happy-path state. */}
                  {entry.statuses.has('email_failed') ? (
                    <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.bounced}`}>Rebondi</Badge>
                  ) : entry.statuses.has('email_clicked') ? (
                    <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.read}`} title="Le candidat a cliqué un lien dans l'email — ouverture confirmée">Lu</Badge>
                  ) : entry.statuses.has('email_delivered') ? (
                    <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.delivered}`} title="Reçu par le serveur mail du destinataire">Livré</Badge>
                  ) : (
                    <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.sent}`}>Envoyé</Badge>
                  )}
                  {entry.statuses.has('email_complained') && (
                    <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.spam}`} title="Le destinataire a marqué l'email comme spam">Spam</Badge>
                  )}
                  {entry.statuses.has('email_delay') && !entry.statuses.has('email_delivered') && !entry.statuses.has('email_failed') && (
                    <Badge variant="secondary" className={`${BADGE_SIZES.xs} ${BADGE_STYLES.delayed}`} title="Livraison temporairement retardée — Resend réessaie">Retardé</Badge>
                  )}
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-2 text-sm border-t bg-muted/20 space-y-2">
                  {entry.toAddress ? (
                    <p className="text-xs">
                      <span className="text-muted-foreground">À : </span>
                      <span className="font-mono break-all">{entry.toAddress}</span>
                    </p>
                  ) : null}
                  {entry.subject && (
                    <p className="text-xs"><span className="text-muted-foreground">Objet : </span><span className="font-medium">{entry.subject}</span></p>
                  )}
                  {entry.body ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      Corps non disponible pour ce message (email ancien — nouveaux envois sauvegardent le contenu).
                    </p>
                  )}
                  {entry.messageId && (
                    <p className="text-[10px] text-muted-foreground/70 font-mono truncate">
                      Message ID : {entry.messageId}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

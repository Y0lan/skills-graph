/**
 * Shared view-model layer for `CandidatureEvent` rows.
 *
 * Historique, recent journal, and emails card all render slices of the same
 * event stream. Before this module they each had their own "what does a
 * status_change look like?" logic, which meant a copy of the email-snapshot
 * parser and three subtly different ways of stringifying the actor. The
 * shared helpers below collapse that into one source of truth so any
 * future change to event taxonomy ships consistently across surfaces.
 */

import { STATUT_LABELS } from './constants'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

/** Coarse grouping used by the timeline filter chips and the
 *  `Journal récent` limit logic. Every event type maps to exactly one
 *  bucket so chip filters never double-count. */
export type EventCategory = 'transitions' | 'emails' | 'documents' | 'notes' | 'other'

const CATEGORY_BY_TYPE: Record<string, EventCategory> = {
  status_change: 'transitions',
  evaluation_reopened: 'transitions',
  onboarding: 'transitions',

  email_scheduled: 'emails',
  email_sent: 'emails',
  email_cancelled: 'emails',
  email_failed: 'emails',
  email_delivered: 'emails',
  email_open: 'emails',
  email_clicked: 'emails',
  email_complained: 'emails',
  email_delay: 'emails',

  document: 'documents',

  note: 'notes',
  entretien: 'notes',
}

export function eventCategory(e: CandidatureEvent): EventCategory {
  return CATEGORY_BY_TYPE[e.type] ?? 'other'
}

/** Email deliverability sub-types are noise in the compact journal — they
 *  belong in the full history only. Callers use this to filter the recent
 *  strip without silently dropping transitions/notes. */
export function isDeliverabilitySignal(e: CandidatureEvent): boolean {
  return (
    e.type === 'email_open' ||
    e.type === 'email_clicked' ||
    e.type === 'email_delivered' ||
    e.type === 'email_complained' ||
    e.type === 'email_delay'
  )
}

/** Documents table logs a side-effect row on upload (`type='document'` with a
 *  "Document uploadé: <filename>" `notes` payload). The candidature_documents
 *  table already surfaces the file separately, so this event is redundant in
 *  the recent journal. */
export function isRedundantUploadLog(e: CandidatureEvent): boolean {
  return e.type === 'document' && (e.notes ?? '').startsWith('Document uploadé:')
}

/** One-line summary of what the event is. Keeps parity with the existing
 *  history renderer so the strings don't diverge between surfaces. */
export function eventTitle(e: CandidatureEvent): string {
  switch (e.type) {
    case 'status_change': {
      if (e.statutFrom && e.statutTo && e.statutFrom === e.statutTo) return 'Candidature créée'
      const from = e.statutFrom ? STATUT_LABELS[e.statutFrom] ?? e.statutFrom : null
      const to = e.statutTo ? STATUT_LABELS[e.statutTo] ?? e.statutTo : null
      if (from && to) return `${from} → ${to}`
      if (to) return `Passage à ${to}`
      return 'Changement de statut'
    }
    case 'email_scheduled': return 'Email programmé'
    case 'email_sent': return 'Email envoyé'
    case 'email_cancelled': return 'Email annulé'
    case 'email_failed': return 'Échec d\'envoi'
    case 'email_open': return 'Email ouvert'
    case 'email_clicked': return 'Lien cliqué'
    case 'email_delivered': return 'Email délivré'
    case 'email_complained': return 'Plainte (spam)'
    case 'email_delay': return 'Envoi retardé'
    case 'document': return 'Document'
    case 'note': return 'Note'
    case 'entretien': return 'Entretien'
    case 'evaluation_reopened': return 'Évaluation rouverte'
    case 'onboarding': return 'Onboarding'
    default: return e.type
  }
}

/** The markdown body to render inline for the event, if any. Handles legacy
 *  rows that stored markdown in `notes` before the dedicated `content_md`
 *  column was added. Returns null for events that don't carry a body
 *  (e.g. deliverability signals). */
export function eventMarkdownBody(e: CandidatureEvent): string | null {
  if (e.contentMd && e.contentMd.trim().length > 0) return e.contentMd
  if (e.type === 'note' && e.notes && e.notes.trim().length > 0) {
    // Best-effort: if the legacy row holds a JSON blob (structured notes),
    // don't try to render it as markdown — it would show as a wall of
    // braces. Callers skip the body in that case.
    const trimmed = e.notes.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return null
    return e.notes
  }
  return null
}

/** Humanise an event's `createdBy` slug to "Firstname L." — good enough to
 *  display an author line next to an avatar without a users-table join. */
export function formatActor(slug: string | null | undefined): string {
  if (!slug) return 'Inconnu'
  if (slug === 'system' || slug === 'unknown') return 'Système'
  const bare = slug.split('@')[0]
  const parts = bare.split(/[._-]+/).filter(Boolean)
  if (parts.length === 0) return slug
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (parts.length === 1) return cap(parts[0])
  return `${cap(parts[0])} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

/** Dual timestamp helper used across the new surfaces: absolute ("15 avr.
 *  2026 · 14:12") + relative ("il y a 2h") — absolute is primary per the
 *  Recruitee lesson (recruiters check across weeks and need precise dates). */
export function formatEventTimestamp(dateStr: string | null | undefined): { absolute: string; relative: string } {
  if (!dateStr) return { absolute: '—', relative: '' }
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return { absolute: dateStr, relative: '' }
  const absolute = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  let relative: string
  if (diffMin < 1) relative = 'à l\'instant'
  else if (diffMin < 60) relative = `il y a ${diffMin} min`
  else if (diffMin < 60 * 24) relative = `il y a ${Math.floor(diffMin / 60)} h`
  else if (diffMin < 60 * 24 * 30) relative = `il y a ${Math.floor(diffMin / (60 * 24))} j`
  else relative = d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
  return { absolute, relative }
}

/** Parse an email event's snapshot JSON — tolerant of malformed/empty rows.
 *  Returns the subset of fields callers need (subject, recipient, to).
 *  Centralised so the journal, emails card, and history all agree on
 *  what a "snapshot" means. */
export function parseEmailSnapshot(snapshot: string | null): {
  subject?: string
  body?: string
  messageId?: string
  recipient?: string
  to?: string | string[]
  scheduledAt?: string
  cancelledScheduleId?: string
} {
  if (!snapshot) return {}
  try {
    const parsed = JSON.parse(snapshot)
    if (parsed && typeof parsed === 'object') return parsed
  } catch { /* malformed — ignore */ }
  return {}
}

import { describe, it, expect } from 'vitest'
import {
  eventCategory, eventMarkdownBody, eventTitle, formatActor, formatEventTimestamp,
  isDeliverabilitySignal, isRedundantUploadLog, parseEmailSnapshot,
} from '../recruitment-events'
import type { CandidatureEvent } from '@/hooks/use-candidate-data'

const baseEvent = (over: Partial<CandidatureEvent> = {}): CandidatureEvent => ({
  id: 1,
  type: 'status_change',
  statutFrom: null,
  statutTo: null,
  notes: null,
  contentMd: null,
  emailSnapshot: null,
  createdBy: 'yolan.maldonado',
  createdAt: '2026-04-24T10:00:00',
  ...over,
})

describe('eventCategory', () => {
  it.each([
    ['status_change', 'transitions'],
    ['evaluation_reopened', 'transitions'],
    ['onboarding', 'transitions'],
    ['email_scheduled', 'emails'],
    ['email_sent', 'emails'],
    ['email_cancelled', 'emails'],
    ['email_failed', 'emails'],
    ['document', 'documents'],
    ['note', 'notes'],
    ['entretien', 'notes'],
    ['unknown_future_type', 'other'],
  ])('%s → %s', (type, expected) => {
    expect(eventCategory(baseEvent({ type }))).toBe(expected)
  })
})

describe('isDeliverabilitySignal', () => {
  it('flags email_open / email_clicked / email_delivered / email_complained / email_delay', () => {
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_open' }))).toBe(true)
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_clicked' }))).toBe(true)
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_delivered' }))).toBe(true)
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_complained' }))).toBe(true)
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_delay' }))).toBe(true)
  })
  it('does not flag lifecycle events (scheduled/sent/cancelled/failed)', () => {
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_scheduled' }))).toBe(false)
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_sent' }))).toBe(false)
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_cancelled' }))).toBe(false)
    expect(isDeliverabilitySignal(baseEvent({ type: 'email_failed' }))).toBe(false)
  })
})

describe('isRedundantUploadLog', () => {
  it('flags document events logged as upload side-effects', () => {
    expect(isRedundantUploadLog(baseEvent({ type: 'document', notes: 'Document uploadé: cv.pdf' }))).toBe(true)
  })
  it('does not flag genuine document events with other notes', () => {
    expect(isRedundantUploadLog(baseEvent({ type: 'document', notes: 'Document modifié par admin' }))).toBe(false)
  })
})

describe('eventTitle', () => {
  it('renders status_change as From → To', () => {
    expect(eventTitle(baseEvent({ type: 'status_change', statutFrom: 'postule', statutTo: 'preselectionne' })))
      .toBe('Postulé → Présélectionné')
  })
  it('recognises the initial-entry self-loop as candidature creation', () => {
    expect(eventTitle(baseEvent({ type: 'status_change', statutFrom: 'postule', statutTo: 'postule' })))
      .toBe('Candidature créée')
  })
  it('covers email lifecycle', () => {
    expect(eventTitle(baseEvent({ type: 'email_scheduled' }))).toBe('Email programmé')
    expect(eventTitle(baseEvent({ type: 'email_sent' }))).toBe('Email envoyé')
    expect(eventTitle(baseEvent({ type: 'email_cancelled' }))).toBe('Email annulé')
    expect(eventTitle(baseEvent({ type: 'email_failed' }))).toBe('Échec d\'envoi')
  })
  it('falls back to raw type for unknown event kinds', () => {
    expect(eventTitle(baseEvent({ type: 'future_unknown' }))).toBe('future_unknown')
  })
})

describe('eventMarkdownBody', () => {
  it('returns content_md when present', () => {
    expect(eventMarkdownBody(baseEvent({ type: 'note', contentMd: 'Hello **world**' }))).toBe('Hello **world**')
  })
  it('falls back to notes for legacy rows without content_md', () => {
    expect(eventMarkdownBody(baseEvent({ type: 'note', notes: 'Legacy note' }))).toBe('Legacy note')
  })
  it('suppresses JSON-blob legacy notes (structured evaluation notes)', () => {
    expect(eventMarkdownBody(baseEvent({ type: 'note', notes: '{"forces":"OK"}' }))).toBeNull()
  })
  it('returns null for non-note events', () => {
    expect(eventMarkdownBody(baseEvent({ type: 'status_change', contentMd: null, notes: null }))).toBeNull()
  })
})

describe('formatActor', () => {
  it('maps a dotted slug to a readable "First L." form', () => {
    expect(formatActor('yolan.maldonado')).toBe('Yolan M.')
  })
  it('capitalises a single-token slug', () => {
    expect(formatActor('yolan')).toBe('Yolan')
  })
  it('strips email suffix', () => {
    expect(formatActor('yolan.maldonado@sinapse.nc')).toBe('Yolan M.')
  })
  it('returns a friendly placeholder for system / unknown', () => {
    expect(formatActor('system')).toBe('Système')
    expect(formatActor('unknown')).toBe('Système')
  })
  it('handles nullish gracefully', () => {
    expect(formatActor(null)).toBe('Inconnu')
    expect(formatActor('')).toBe('Inconnu')
  })
})

describe('formatEventTimestamp', () => {
  it('returns both absolute and relative strings', () => {
    const iso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const { absolute, relative } = formatEventTimestamp(iso)
    expect(absolute).toMatch(/Aujourd'hui à|Hier à|\d{1,2} \p{L}+ \d{4} à/u)
    expect(relative).toMatch(/il y a 3 h|il y a 2 h/)
  })
  it('handles "just now"', () => {
    const iso = new Date().toISOString()
    const { relative } = formatEventTimestamp(iso)
    expect(relative).toBe('à l\'instant')
  })
  it('returns safe placeholders for null', () => {
    const ts = formatEventTimestamp(null)
    expect(ts.absolute).toBe('—')
    expect(ts.relative).toBe('')
  })
})

describe('parseEmailSnapshot', () => {
  it('parses valid JSON', () => {
    expect(parseEmailSnapshot('{"subject":"Hello","to":"a@b.com"}')).toEqual({ subject: 'Hello', to: 'a@b.com' })
  })
  it('tolerates malformed JSON', () => {
    expect(parseEmailSnapshot('{not valid json')).toEqual({})
  })
  it('tolerates null / empty', () => {
    expect(parseEmailSnapshot(null)).toEqual({})
    expect(parseEmailSnapshot('')).toEqual({})
  })
})

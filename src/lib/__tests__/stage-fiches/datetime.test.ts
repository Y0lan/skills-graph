import { describe, it, expect } from 'vitest'
import {
  parseFicheDateTime,
  formatFicheDateTime,
  formatFicheDateTimeShort,
  formatFicheDate,
  compareToNow,
  dateProximityClass,
  toInputDateTimeLocal,
  fromInputDateTimeLocal,
  PACIFIC_NOUMEA_OFFSET,
} from '@/lib/stage-fiches/datetime'

describe('stage-fiches/datetime — Pacific/Noumea conventions (R5)', () => {
  it('PACIFIC_NOUMEA_OFFSET is +11:00 (no DST)', () => {
    expect(PACIFIC_NOUMEA_OFFSET).toBe('+11:00')
  })

  describe('parseFicheDateTime', () => {
    it('parses YYYY-MM-DDTHH:mm as Nouméa wall-clock', () => {
      const d = parseFicheDateTime('2026-04-30T14:00')
      expect(d).toBeInstanceOf(Date)
      // 14:00 Nouméa = 03:00 UTC.
      expect(d!.toISOString()).toBe('2026-04-30T03:00:00.000Z')
    })

    it('parses YYYY-MM-DDTHH:mm:ss', () => {
      const d = parseFicheDateTime('2026-04-30T14:00:30')
      expect(d!.toISOString()).toBe('2026-04-30T03:00:30.000Z')
    })

    it('parses YYYY-MM-DD as noon Nouméa for date-only fields', () => {
      const d = parseFicheDateTime('2026-04-30')
      // 12:00 Nouméa = 01:00 UTC.
      expect(d!.toISOString()).toBe('2026-04-30T01:00:00.000Z')
    })

    it('returns null for malformed inputs', () => {
      expect(parseFicheDateTime(null)).toBeNull()
      expect(parseFicheDateTime(undefined)).toBeNull()
      expect(parseFicheDateTime('')).toBeNull()
      expect(parseFicheDateTime('not a date')).toBeNull()
      expect(parseFicheDateTime('2026/04/30 14:00')).toBeNull()
      expect(parseFicheDateTime('2026-04-30T14:00Z')).toBeNull() // Z is the v4 trap; we reject it.
    })
  })

  describe('formatFicheDateTime', () => {
    it('formats in fr-FR with Pacific/Noumea TZ', () => {
      const out = formatFicheDateTime('2026-04-30T14:00')
      // Long French format always renders 14:00 Nouméa regardless of host TZ.
      expect(out).toMatch(/14:00/)
      expect(out).toMatch(/30 avril 2026/)
    })

    it('returns "—" on null / empty', () => {
      expect(formatFicheDateTime(null)).toBe('—')
      expect(formatFicheDateTime(undefined)).toBe('—')
    })
  })

  describe('formatFicheDateTimeShort', () => {
    it('renders 30/04 · 14:00', () => {
      expect(formatFicheDateTimeShort('2026-04-30T14:00')).toBe('30/04 · 14:00')
    })
  })

  describe('formatFicheDate', () => {
    it('formats date-only field in long form', () => {
      const out = formatFicheDate('2026-05-12')
      expect(out).toMatch(/12 mai 2026/)
    })
  })

  describe('compareToNow + dateProximityClass', () => {
    it('imminent when < 1h', () => {
      const now = new Date('2026-04-30T03:00:00Z') // 14:00 Nouméa
      const target = '2026-04-30T14:30' // +30 min in Nouméa local
      expect(compareToNow(target, now)).toBe('imminent')
      expect(dateProximityClass(target, now)).toMatch(/rose/)
    })
    it('soon when between 1h and 24h', () => {
      const now = new Date('2026-04-30T03:00:00Z')
      const target = '2026-04-30T18:00'
      expect(compareToNow(target, now)).toBe('soon')
      expect(dateProximityClass(target, now)).toMatch(/amber/)
    })
    it('distant when more than 24h ahead', () => {
      const now = new Date('2026-04-30T03:00:00Z')
      const target = '2026-05-15T10:00'
      expect(compareToNow(target, now)).toBe('distant')
      expect(dateProximityClass(target, now)).toMatch(/muted/)
    })
    it('past when target is behind now', () => {
      const now = new Date('2026-04-30T03:00:00Z')
      const target = '2026-04-29T10:00'
      expect(compareToNow(target, now)).toBe('past')
      expect(dateProximityClass(target, now)).toMatch(/line-through/)
    })
    it('returns null for unparseable dates', () => {
      expect(compareToNow('garbage')).toBeNull()
    })
  })

  describe('toInputDateTimeLocal / fromInputDateTimeLocal', () => {
    it('round-trips a Nouméa wall-clock through datetime-local', () => {
      const stored = '2026-04-30T14:00'
      const inputValue = toInputDateTimeLocal(stored)
      expect(inputValue).toBe('2026-04-30T14:00')
      expect(fromInputDateTimeLocal(inputValue)).toBe('2026-04-30T14:00')
    })

    it('toInputDateTimeLocal returns "" for null / invalid', () => {
      expect(toInputDateTimeLocal(null)).toBe('')
      expect(toInputDateTimeLocal('garbage')).toBe('')
    })

    it('fromInputDateTimeLocal trims any trailing seconds the input might emit', () => {
      expect(fromInputDateTimeLocal('2026-04-30T14:00:00')).toBe('2026-04-30T14:00')
    })

    it('fromInputDateTimeLocal strips a stray Z if a browser produces one', () => {
      expect(fromInputDateTimeLocal('2026-04-30T14:00Z')).toBe('2026-04-30T14:00')
    })
  })
})

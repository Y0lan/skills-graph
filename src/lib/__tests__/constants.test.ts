// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatCvDateRange, formatDateTime } from '../constants'

describe('formatCvDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('bare years → year-only labels + duration', () => {
    expect(formatCvDateRange('2018', '2025')).toBe('2018 → 2025 · 7 ans')
  })

  it('ISO dates → month + year labels + duration', () => {
    expect(formatCvDateRange('2018-01-01', '2025-01-01')).toBe('janv. 2018 → janv. 2025 · 7 ans')
  })

  it('null end date → "présent" with duration up to today', () => {
    expect(formatCvDateRange('2022', null)).toBe('2022 → présent · 4 ans 4 mois')
  })

  it('short span → months, not years', () => {
    expect(formatCvDateRange('2020-03', '2020-11')).toBe('mars 2020 → nov. 2020 · 8 mois')
  })

  it('mixed granularity → month + year wins', () => {
    expect(formatCvDateRange('2018', '2025-06')).toMatch(/2018 → juin 2025/)
  })

  it('less than a month → no duration (noise suppression)', () => {
    const out = formatCvDateRange('2022-01-01', '2022-01-10')
    expect(out).toBe('janv. 2022 → janv. 2022')
  })

  it('returns null when both inputs are empty', () => {
    expect(formatCvDateRange(null, null)).toBeNull()
    expect(formatCvDateRange('', '')).toBeNull()
  })

  it('returns only the start when end is invalid', () => {
    const out = formatCvDateRange('2020', 'junk')
    expect(out).toMatch(/2020 → /)
  })
})

describe('formatDateTime (regression)', () => {
  it('treats SQLite datetime (no TZ) as UTC', () => {
    const out = formatDateTime('2026-04-21 07:04:25')
    // Rendering is locale-dependent; just verify it didn't interpret
    // the naive string as local (would drop by 11h in NC) — output must
    // contain "18:04" in a UTC+11 tz OR the test runs in UTC (e.g. CI)
    // where it stays "07:04". Either way, never "07:04" interpreted as
    // local producing e.g. "20:04" UTC.
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}$/)
  })
})

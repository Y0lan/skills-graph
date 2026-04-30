import { describe, it, expect, vi, afterEach } from 'vitest'
import { daysSince, freshnessColor } from '../src/lib/utils'

describe('daysSince', () => {
  afterEach(() => { vi.useRealTimers() })

  it('returns 0 for today', async () => {
    const now = new Date().toISOString()
    expect(daysSince(now)).toBe(0)
  })

  it('returns correct days for a past date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-19T12:00:00Z'))
    expect(daysSince('2026-03-14T12:00:00Z')).toBe(5)
    expect(daysSince('2026-02-17T00:00:00Z')).toBe(30)
  })

  it('returns 0 for invalid date string', async () => {
    expect(daysSince('not-a-date')).toBe(0)
  })

  it('returns 0 for future date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-19T12:00:00Z'))
    expect(daysSince('2026-03-25T12:00:00Z')).toBe(0)
  })
})

describe('freshnessColor', () => {
  it('returns muted for 0 days', async () => {
    expect(freshnessColor(0)).toBe('text-muted-foreground')
  })

  it('returns muted for exactly 14 days', async () => {
    expect(freshnessColor(14)).toBe('text-muted-foreground')
  })

  it('returns amber for 15 days', async () => {
    expect(freshnessColor(15)).toContain('amber')
  })

  it('returns amber for exactly 60 days', async () => {
    expect(freshnessColor(60)).toContain('amber')
  })

  it('returns red for 61 days', async () => {
    expect(freshnessColor(61)).toContain('red')
  })

  it('returns red for very old dates', async () => {
    expect(freshnessColor(365)).toContain('red')
  })
})

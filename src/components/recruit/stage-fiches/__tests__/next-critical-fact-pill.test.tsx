// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { NextCriticalFactPill } from '../next-critical-fact-pill'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const TWENTY_FIVE_MIN_MS = 25 * 60 * 1000
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

function formatNoumeaWallClock(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Pacific/Noumea',
  }).formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn() as unknown as typeof fetch)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('<NextCriticalFactPill>', () => {
  it('renders nothing for stages with no upstream date field (preselectionne)', () => {
    const fetchMock = vi.fn() as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)
    render(<NextCriticalFactPill candidatureId="c1" statut="preselectionne" />)
    expect(screen.queryByText(/Entretien/)).toBeNull()
    // No fetch should be made when there's nothing to surface.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces an entretien date with amber tint when soon (<24h)', async () => {
    const target = new Date(Date.now() + TWO_HOURS_MS)
    const stored = formatNoumeaWallClock(target)
    const json = vi.fn().mockResolvedValue({ data: { scheduledAt: stored, meetLink: 'https://meet.google.com/abc' }, updatedAt: '2026-04-30T03:00:00', updatedBy: 'yolan.test' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json }) as unknown as typeof fetch)

    const { container } = render(<NextCriticalFactPill candidatureId="c1" statut="entretien_1" />)

    await waitFor(() => expect(screen.getByText(/Entretien 1/)).toBeInTheDocument())
    // The outer pill is the first <span> rendered by the component.
    const pill = container.querySelector('span') as HTMLSpanElement
    expect(pill.className).toMatch(/amber/)
  })

  it('uses rose pulse tint when imminent (<1h)', async () => {
    const target = new Date(Date.now() + TWENTY_FIVE_MIN_MS)
    const stored = formatNoumeaWallClock(target)
    const json = vi.fn().mockResolvedValue({ data: { scheduledAt: stored }, updatedAt: '2026-04-30T03:00:00', updatedBy: 'yolan.test' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json }) as unknown as typeof fetch)

    const { container } = render(<NextCriticalFactPill candidatureId="c1" statut="aboro" />)
    await waitFor(() => expect(screen.getByText(/Test Âboro/)).toBeInTheDocument())
    const pill = container.querySelector('span') as HTMLSpanElement
    expect(pill.className).toMatch(/rose/)
  })

  it('hides itself when target date is in the past', async () => {
    const target = new Date(Date.now() - TWO_DAYS_MS)
    const stored = formatNoumeaWallClock(target)
    const json = vi.fn().mockResolvedValue({ data: { scheduledAt: stored }, updatedAt: '2026-04-30T03:00:00', updatedBy: 'yolan.test' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json }) as unknown as typeof fetch)

    render(<NextCriticalFactPill candidatureId="c1" statut="entretien_1" />)
    // Wait for the fetch tick + state update; then assert nothing rendered.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/Entretien/)).toBeNull()
  })

  it('renders proposition deadline as a date pill', async () => {
    const target = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
    const dateOnly = target.toISOString().slice(0, 10)
    const json = vi.fn().mockResolvedValue({ data: { responseDeadline: dateOnly }, updatedAt: '2026-04-30T03:00:00', updatedBy: 'yolan.test' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json }) as unknown as typeof fetch)

    render(<NextCriticalFactPill candidatureId="c1" statut="proposition" />)
    await waitFor(() => expect(screen.getByText(/Réponse attendue/)).toBeInTheDocument())
  })
})

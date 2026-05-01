// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PoleScoreboard from '../pole-scoreboard'
import type { TeamMemberAggregateResponse } from '@/lib/types'

afterEach(() => cleanup())

function makeMember(overrides: Partial<TeamMemberAggregateResponse> = {}): TeamMemberAggregateResponse {
  return {
    slug: 'jane-doe',
    name: 'Jane Doe',
    role: 'Engineer',
    team: 'Eng',
    pole: 'java_modernisation',
    submittedAt: '2026-04-01T00:00:00Z',
    status: 'submitted',
    answeredCount: 1,
    coveredCount: 1,
    totalCount: 1,
    lastActivityAt: '2026-04-01T00:00:00Z',
    progressionDelta: 0,
    categoryAverages: { 'core-engineering': 4 },
    topStrengths: [],
    topGaps: [],
    ...overrides,
  } as TeamMemberAggregateResponse
}

describe('PoleScoreboard', () => {
  it('groups members by pôle and computes per-pôle average', () => {
    const members = [
      makeMember({ slug: 'a', pole: 'java_modernisation', categoryAverages: { x: 4 } }),
      makeMember({ slug: 'b', pole: 'java_modernisation', categoryAverages: { x: 2 } }),
      makeMember({ slug: 'c', pole: 'fonctionnel', categoryAverages: { x: 4.5 } }),
    ]
    render(<PoleScoreboard members={members} />)
    // Java/Modernisation = (4+2)/2 = 3.0
    expect(screen.getByText('Java / Modernisation')).toBeInTheDocument()
    expect(screen.getByText('3.0')).toBeInTheDocument()
    // Fonctionnel = 4.5
    expect(screen.getByText('Fonctionnel')).toBeInTheDocument()
    expect(screen.getByText('4.5')).toBeInTheDocument()
  })

  it('buckets members with no pôle into Transverse', () => {
    const members = [
      makeMember({ slug: 'a', pole: null, categoryAverages: { x: 5 } }),
      makeMember({ slug: 'b', pole: null, categoryAverages: { x: 3 } }),
    ]
    render(<PoleScoreboard members={members} />)
    expect(screen.getByText('Transverse')).toBeInTheDocument()
    expect(screen.getByText('4.0')).toBeInTheDocument() // (5+3)/2
  })

  it('ignores zero-value categories when computing the average', () => {
    // A member who hasn't rated themselves shouldn't pull the pôle average to 0.
    const members = [
      makeMember({ slug: 'a', pole: 'java_modernisation', categoryAverages: { x: 4, y: 0, z: 0 } }),
    ]
    render(<PoleScoreboard members={members} />)
    expect(screen.getByText('4.0')).toBeInTheDocument()
  })

  it('shows 0/N evaluated when nobody in the pôle submitted', () => {
    const members = [
      makeMember({ slug: 'a', pole: 'legacy', categoryAverages: { x: 0 }, submittedAt: null, status: 'none' }),
    ]
    render(<PoleScoreboard members={members} />)
    expect(screen.getByText('Legacy (Adélia / IBMi)')).toBeInTheDocument()
    expect(screen.getByText('0/1 membre évalué')).toBeInTheDocument()
  })

  it('hides pôles with zero members entirely', () => {
    const members = [makeMember({ pole: 'java_modernisation' })]
    render(<PoleScoreboard members={members} />)
    expect(screen.queryByText('Fonctionnel')).not.toBeInTheDocument()
    expect(screen.queryByText('Legacy (Adélia / IBMi)')).not.toBeInTheDocument()
  })

  it('makes pôle cards clickable when onSelectPole is provided', async () => {
    const onSelectPole = vi.fn()
    const members = [makeMember({ pole: 'java_modernisation' })]
    render(<PoleScoreboard members={members} onSelectPole={onSelectPole} />)
    await userEvent.click(screen.getByText('Java / Modernisation'))
    expect(onSelectPole).toHaveBeenCalledWith('java_modernisation')
  })

  it('does not make Transverse clickable (no server-side filter)', async () => {
    const onSelectPole = vi.fn()
    const members = [makeMember({ pole: null })]
    render(<PoleScoreboard members={members} onSelectPole={onSelectPole} />)
    // Transverse should render but NOT be a button.
    const transverseLabel = screen.getByText('Transverse')
    // Walk up to find the rendered Tag — should be a div, not a button.
    let el: HTMLElement | null = transverseLabel
    while (el && el.tagName !== 'DIV' && el.tagName !== 'BUTTON') el = el.parentElement
    expect(el?.tagName).toBe('DIV')
    // Even if we click, no callback fires.
    await userEvent.click(transverseLabel)
    expect(onSelectPole).not.toHaveBeenCalled()
  })

  it('returns null when there are no members at all', () => {
    const { container } = render(<PoleScoreboard members={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

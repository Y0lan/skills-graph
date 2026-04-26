// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import GapSynthesis from '../gap-synthesis'
import type { GapEntry } from '../gap-synthesis'

afterEach(() => cleanup())

/**
 * GapSynthesis replaces the raw 3-column Candidat/Équipe/Écart table the
 * user called out as unclear. These tests lock down:
 *  - top-3 renforts / top-3 à couvrir selection + ordering
 *  - empty states don't crash when the candidate has no data
 *  - low-magnitude gaps are filtered out of the "surface" lists but kept
 *    in the full expandable detail
 */

function gap(overrides: Partial<GapEntry>): GapEntry {
  return {
    skill: overrides.skill ?? 'Skill',
    category: overrides.category ?? 'cat',
    candidateScore: overrides.candidateScore ?? 0,
    teamAvg: overrides.teamAvg ?? 0,
    gap: overrides.gap ?? 0,
  }
}

describe('GapSynthesis', () => {
  it('renders empty state when there are no valid gaps', () => {
    render(<GapSynthesis gapAnalysis={[]} />)
    expect(screen.getByText(/Pas encore assez de données/)).toBeInTheDocument()
  })

  it('selects top 3 renforts (highest positive gaps) and labels them correctly', () => {
    const gaps = [
      gap({ skill: 'Java', gap: 1.4 }),
      gap({ skill: 'Docker', gap: 1.2 }),
      gap({ skill: 'Kubernetes', gap: 1.0 }),
      gap({ skill: 'React', gap: 0.8 }),
      gap({ skill: 'Meaningless', gap: 0.05 }), // below threshold
    ]
    render(<GapSynthesis gapAnalysis={gaps} />)
    const renfortsHeading = screen.getByText('Renforts apportés')
    const renforts = renfortsHeading.parentElement!
    const topEntries = within(renforts).getAllByRole('listitem')
    expect(topEntries).toHaveLength(3)
    const topText = topEntries.map(li => li.textContent).join(' ')
    expect(topText).toMatch(/Java/)
    expect(topText).toMatch(/Docker/)
    expect(topText).toMatch(/Kubernetes/)
    expect(topText).not.toMatch(/React/) // top 3 cap, React at 0.8 would rank 4th
  })

  it('selects top 3 à couvrir (largest negative gaps) and labels them correctly', () => {
    const gaps = [
      gap({ skill: 'Java', gap: 1.4 }),
      gap({ skill: 'Go', gap: -0.8 }),
      gap({ skill: 'Mentoring', gap: -0.6 }),
      gap({ skill: 'Architecture', gap: -0.3 }),
      gap({ skill: 'Subtle', gap: -0.1 }),
    ]
    render(<GapSynthesis gapAnalysis={gaps} />)
    const heading = screen.getByText("À couvrir à l'entretien")
    const aCouvrir = heading.parentElement!
    const items = within(aCouvrir).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    const text = items.map(li => li.textContent).join(' ')
    expect(text).toMatch(/Go/)
    expect(text).toMatch(/Mentoring/)
    expect(text).toMatch(/Architecture/)
    expect(text).not.toMatch(/Subtle/)
  })

  it('tolerates null entries in the gap list (comes from flatMap upstream)', () => {
    render(
      <GapSynthesis
        gapAnalysis={[null, gap({ skill: 'Java', gap: 1.0 }), null]}
      />,
    )
    // "Java" appears in both the top-3 column and the full detail list —
    // use getAllByText to assert it's rendered at least once without
    // asserting uniqueness.
    expect(screen.getAllByText('Java').length).toBeGreaterThan(0)
  })

  it('drops non-finite gap values rather than rendering NaN', () => {
    render(
      <GapSynthesis
        gapAnalysis={[
          gap({ skill: 'BadNumber', gap: Number.NaN }),
          gap({ skill: 'Java', gap: 1.0 }),
        ]}
      />,
    )
    expect(screen.queryByText('BadNumber')).not.toBeInTheDocument()
    expect(screen.getAllByText('Java').length).toBeGreaterThan(0)
  })
})

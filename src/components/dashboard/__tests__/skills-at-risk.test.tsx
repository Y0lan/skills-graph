// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import SkillsAtRisk from '../skills-at-risk'
import type { TeamCategoryAggregateResponse, TeamMemberAggregateResponse } from '@/lib/types'

afterEach(() => cleanup())

function makeMember(overrides: Partial<TeamMemberAggregateResponse>): TeamMemberAggregateResponse {
  return {
    slug: 'm',
    name: 'Member',
    role: 'eng',
    team: 't',
    pole: 'java_modernisation',
    submittedAt: '2026-04-01T00:00:00Z',
    status: 'submitted',
    answeredCount: 1,
    coveredCount: 1,
    totalCount: 1,
    lastActivityAt: '2026-04-01T00:00:00Z',
    progressionDelta: 0,
    categoryAverages: {},
    topStrengths: [],
    topGaps: [],
    ...overrides,
  } as TeamMemberAggregateResponse
}

function makeCategory(id: string, label: string): TeamCategoryAggregateResponse {
  return {
    categoryId: id,
    categoryLabel: label,
    teamAvgRank: 3,
    minRank: 0,
    maxRank: 5,
    skillAverages: {},
  }
}

describe('SkillsAtRisk', () => {
  it('flags categories targeted ≥4 with 0 experts as critical', () => {
    const members = [
      makeMember({ slug: 'a', categoryAverages: { 'crit-skill': 2 } }),
      makeMember({ slug: 'b', categoryAverages: { 'crit-skill': 3 } }),
    ]
    const categories = [makeCategory('crit-skill', 'Critical Skill')]
    const targets = { 'crit-skill': 4 }
    render(
      <SkillsAtRisk members={members} categories={categories} categoryTargets={targets} />,
    )
    expect(screen.getByText('Critical Skill')).toBeInTheDocument()
    expect(screen.getByText('0 experts')).toBeInTheDocument()
  })

  it('flags categories with exactly 1 expert (bus-factor 1)', () => {
    const members = [
      makeMember({ slug: 'a', categoryAverages: { 'one-expert': 4.5 } }),
      makeMember({ slug: 'b', categoryAverages: { 'one-expert': 2 } }),
    ]
    const categories = [makeCategory('one-expert', 'One Expert')]
    const targets = { 'one-expert': 4 }
    render(
      <SkillsAtRisk members={members} categories={categories} categoryTargets={targets} />,
    )
    expect(screen.getByText('1 expert')).toBeInTheDocument()
  })

  it('does not flag categories with 2+ experts', () => {
    const members = [
      makeMember({ slug: 'a', categoryAverages: { 'safe-skill': 4 } }),
      makeMember({ slug: 'b', categoryAverages: { 'safe-skill': 4.5 } }),
      makeMember({ slug: 'c', categoryAverages: { 'safe-skill': 2 } }),
    ]
    const categories = [makeCategory('safe-skill', 'Safe Skill')]
    const targets = { 'safe-skill': 4 }
    const { container } = render(
      <SkillsAtRisk members={members} categories={categories} categoryTargets={targets} />,
    )
    // Section hides itself when nothing's at risk.
    expect(container.firstChild).toBeNull()
  })

  it('does not flag categories whose target is below the expert threshold', () => {
    // A category targeted at 3/5 isn't a bus-factor risk by our definition.
    const members = [makeMember({ slug: 'a', categoryAverages: { 'low-target': 1 } })]
    const categories = [makeCategory('low-target', 'Low Target')]
    const targets = { 'low-target': 3 }
    const { container } = render(
      <SkillsAtRisk members={members} categories={categories} categoryTargets={targets} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('respects pôle filter — only counts experts in the scoped pôle', () => {
    const members = [
      // Two experts in Java / Modernisation
      makeMember({ slug: 'jm-a', pole: 'java_modernisation', categoryAverages: { 'cross-skill': 4 } }),
      makeMember({ slug: 'jm-b', pole: 'java_modernisation', categoryAverages: { 'cross-skill': 4 } }),
      // None in Legacy
      makeMember({ slug: 'leg-a', pole: 'legacy', categoryAverages: { 'cross-skill': 1 } }),
    ]
    const categories = [makeCategory('cross-skill', 'Cross Skill')]
    const targets = { 'cross-skill': 4 }

    // Without filter: 2 experts → safe → hidden
    const { container, rerender } = render(
      <SkillsAtRisk members={members} categories={categories} categoryTargets={targets} />,
    )
    expect(container.firstChild).toBeNull()

    // Scoped to legacy: 0 experts → flagged
    rerender(
      <SkillsAtRisk
        members={members}
        categories={categories}
        categoryTargets={targets}
        poleFilter="legacy"
      />,
    )
    expect(screen.getByText('Cross Skill')).toBeInTheDocument()
    expect(screen.getByText('0 experts')).toBeInTheDocument()
  })

  it('sorts by expertCount asc then targetRank desc (most critical first)', () => {
    const members = [makeMember({ slug: 'a', categoryAverages: {} })]
    const categories = [
      makeCategory('a', 'A'),
      makeCategory('b', 'B'),
      makeCategory('c', 'C'),
    ]
    const targets = { a: 5, b: 4, c: 5 }
    render(
      <SkillsAtRisk members={members} categories={categories} categoryTargets={targets} />,
    )
    // All three are at 0 experts (a member has rated nothing). Tie on
    // expertCount → break by targetRank desc → A and C (target 5) before B (target 4).
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(3)
    // First two should be A and C (target 5), order between them unspecified.
    const firstTwo = [items[0].textContent, items[1].textContent]
    expect(firstTwo.some(t => t?.includes('A'))).toBe(true)
    expect(firstTwo.some(t => t?.includes('C'))).toBe(true)
    // Third (or later) is B.
    expect(items[2].textContent).toContain('B')
  })

  it('uses a custom expertThreshold when provided', () => {
    const members = [
      makeMember({ slug: 'a', categoryAverages: { skill: 3.5 } }),
      makeMember({ slug: 'b', categoryAverages: { skill: 3.6 } }),
    ]
    const categories = [makeCategory('skill', 'Skill')]
    const targets = { skill: 3 }

    // Threshold 4: 0 experts, but target (3) < threshold → not flagged
    const { container, rerender } = render(
      <SkillsAtRisk
        members={members}
        categories={categories}
        categoryTargets={targets}
        expertThreshold={4}
      />,
    )
    expect(container.firstChild).toBeNull()

    // Threshold 3: 2 experts → safe → hidden
    rerender(
      <SkillsAtRisk
        members={members}
        categories={categories}
        categoryTargets={targets}
        expertThreshold={3}
      />,
    )
    expect(container.firstChild).toBeNull()

    // Threshold 3.7 with target 3: 0 experts AND target (3) < 3.7 → not flagged
    rerender(
      <SkillsAtRisk
        members={members}
        categories={categories}
        categoryTargets={targets}
        expertThreshold={3.7}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})

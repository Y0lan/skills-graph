import { describe, it, expect } from 'vitest'
import { computeRoleGaps } from '../lib/gap-analysis.js'
import type { SkillCategory } from '../../src/data/skill-catalog.js'

const CATEGORIES: SkillCategory[] = [
  {
    id: 'backend',
    label: 'Backend',
    emoji: '⚙️',
    skills: [
      { id: 'java', label: 'Java', categoryId: 'backend', descriptors: [] },
      { id: 'sql', label: 'SQL', categoryId: 'backend', descriptors: [] },
    ],
  },
  {
    id: 'frontend',
    label: 'Frontend',
    emoji: '🎨',
    skills: [
      { id: 'react', label: 'React', categoryId: 'frontend', descriptors: [] },
    ],
  },
  {
    id: 'analyse',
    label: 'Analyse fonctionnelle',
    emoji: '📋',
    skills: [
      { id: 'uml', label: 'UML', categoryId: 'analyse', descriptors: [] },
    ],
  },
]

describe('computeRoleGaps', () => {
  it('returns empty when no role categories relevant', async () => {
    expect(computeRoleGaps({ java: 5 }, CATEGORIES, [])).toEqual([])
  })

  it('classifies missing when no rated skills in a role category', async () => {
    const gaps = computeRoleGaps({}, CATEGORIES, ['backend', 'frontend'])
    expect(gaps.every(g => g.severity === 'missing')).toBe(true)
    expect(gaps.map(g => g.categoryId).sort()).toEqual(['backend', 'frontend'])
  })

  it('returns empty when all role categories meet threshold', async () => {
    const ratings = { java: 4, sql: 4, react: 3 }
    expect(computeRoleGaps(ratings, CATEGORIES, ['backend', 'frontend'], 3)).toEqual([])
  })

  it('returns gaps for categories below threshold', async () => {
    const ratings = { java: 1, sql: 2, react: 3 }
    const gaps = computeRoleGaps(ratings, CATEGORIES, ['backend', 'frontend'], 3)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].categoryId).toBe('backend')
    expect(gaps[0].rating).toBe(1.5)
    expect(gaps[0].severity).toBe('critical')
  })

  it('marks severity=below when rating is 1.6 to just under threshold', async () => {
    const ratings = { java: 2, sql: 2 }
    const gaps = computeRoleGaps(ratings, CATEGORIES, ['backend'], 3)
    expect(gaps[0].severity).toBe('below')
    expect(gaps[0].rating).toBe(2)
  })

  it('marks severity=critical when rating is 1.5 or less', async () => {
    const ratings = { java: 1, sql: 2 }
    const gaps = computeRoleGaps(ratings, CATEGORIES, ['backend'], 3)
    expect(gaps[0].severity).toBe('critical')
  })

  it('does not flag category exactly at threshold', async () => {
    const ratings = { java: 3, sql: 3 }
    expect(computeRoleGaps(ratings, CATEGORIES, ['backend'], 3)).toEqual([])
  })

  it('ignores skills outside role categories', async () => {
    const ratings = { uml: 5, java: 1 } // only `backend` is relevant
    const gaps = computeRoleGaps(ratings, CATEGORIES, ['backend'], 3)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].categoryId).toBe('backend')
  })

  it('sorts missing first, then ascending rating', async () => {
    const ratings = { react: 2 } // backend missing, frontend below
    const gaps = computeRoleGaps(ratings, CATEGORIES, ['backend', 'frontend'], 3)
    expect(gaps.map(g => ({ id: g.categoryId, severity: g.severity }))).toEqual([
      { id: 'backend', severity: 'missing' },
      { id: 'frontend', severity: 'below' },
    ])
  })

  it('respects maxGaps limit', async () => {
    const allThree = computeRoleGaps({}, CATEGORIES, ['backend', 'frontend', 'analyse'], 3, 2)
    expect(allThree).toHaveLength(2)
  })

  it('treats rating 0 same as missing (0 filtered)', async () => {
    const gaps = computeRoleGaps({ java: 0, sql: 0 }, CATEGORIES, ['backend'], 3)
    expect(gaps[0].severity).toBe('missing')
    expect(gaps[0].rating).toBeNull()
  })

  it('rounds decimal ratings to one place', async () => {
    const ratings = { java: 1, sql: 2 } // avg = 1.5
    const gaps = computeRoleGaps(ratings, CATEGORIES, ['backend'], 3)
    expect(gaps[0].rating).toBe(1.5)
  })
})

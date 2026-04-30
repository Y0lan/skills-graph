import { describe, it, expect, vi } from 'vitest'

// Mock catalog with 30 skills across 3 categories — enough to verify the
// compact summary keeps only the top-5 strongest + top-3 weakest, not all 30.
vi.mock('../lib/catalog.js', () => {
  const skills = []
  for (let i = 0; i < 10; i++) {
    skills.push({ id: `core-${i}`, label: `Core${i}`, categoryId: 'core', descriptors: [] })
    skills.push({ id: `back-${i}`, label: `Back${i}`, categoryId: 'back', descriptors: [] })
    skills.push({ id: `front-${i}`, label: `Front${i}`, categoryId: 'front', descriptors: [] })
  }
  return {
    getSkillCategories: vi.fn().mockReturnValue([
      { id: 'core', label: 'Core', emoji: '*', skills: skills.filter(s => s.categoryId === 'core') },
      { id: 'back', label: 'Back', emoji: '*', skills: skills.filter(s => s.categoryId === 'back') },
      { id: 'front', label: 'Front', emoji: '*', skills: skills.filter(s => s.categoryId === 'front') },
    ]),
  }
})

const { buildCompactSkillSummary } = await import('../routes/chat.js')

describe('buildCompactSkillSummary (chatbot global-context trim)', () => {
  /**
   * Demo bug: the original code emitted descriptor-rich detail for every
   * catalog skill × every member, blowing the token budget. The compact
   * summary keeps only the most signal-rich entries: top strengths and
   * top weaknesses. See plan §Item 1.
   */

  it('returns "pas d\'évaluations" sentinel when ratings empty', async () => {
    expect(buildCompactSkillSummary({})).toMatch(/pas d'évaluations/i)
  })

  it('keeps top-N strongest skills (level ≥ 4) sorted descending', async () => {
    const ratings: Record<string, number> = {}
    for (let i = 0; i < 10; i++) ratings[`core-${i}`] = i % 6 // 0..5 cycling
    const out = buildCompactSkillSummary(ratings, 3, 0)
    expect(out).toMatch(/Forces :/i)
    // Highest values first
    const idxFive = out.indexOf('5/5')
    const idxFour = out.indexOf('4/5')
    expect(idxFive).toBeGreaterThan(-1)
    expect(idxFour).toBeGreaterThan(-1)
    expect(idxFive).toBeLessThan(idxFour)
  })

  it('keeps top-M weakest evaluated skills (level ≤ 1) sorted ascending', async () => {
    const ratings: Record<string, number> = {
      'core-0': 0,
      'core-1': 1,
      'core-2': 5, // strong
      'core-3': 1,
    }
    const out = buildCompactSkillSummary(ratings, 0, 2)
    expect(out).toMatch(/À renforcer :/i)
    expect(out).toMatch(/0\/5/)
    // Two slots taken by 0/5 + 1/5 — the second 1/5 is dropped
    expect(out.match(/1\/5/g)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('output stays compact: a 30-skill rating set produces well under 1KB', async () => {
    // 30 skills × ~30 chars/skill in the OLD descriptor-rich format ≈ 900 chars
    // per member. With 10 members that's ~9 KB just for skills. Times 178
    // catalog skills (real catalog) the system prompt blows past 250 KB.
    // The compact summary collapses each member to ~80–200 chars regardless.
    const ratings: Record<string, number> = {}
    for (let i = 0; i < 10; i++) ratings[`core-${i}`] = i % 6
    for (let i = 0; i < 10; i++) ratings[`back-${i}`] = i % 6
    for (let i = 0; i < 10; i++) ratings[`front-${i}`] = i % 6
    const out = buildCompactSkillSummary(ratings, 5, 3)
    expect(out.length).toBeLessThan(1000)
  })

  it('falls back to "pas d\'extrêmes notables" when nothing scores ≥4 or ≤1', async () => {
    // All ratings in the middle (2-3) — neither strong nor weak.
    const ratings: Record<string, number> = {
      'core-0': 2, 'core-1': 3, 'core-2': 2, 'core-3': 3,
    }
    const out = buildCompactSkillSummary(ratings)
    expect(out).toMatch(/pas d'extrêmes/i)
  })
})

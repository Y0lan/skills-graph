import { describe, it, expect, vi } from 'vitest'

// Mock catalog to provide known skill IDs
vi.mock('../lib/catalog.js', () => ({
  getSkillCategories: vi.fn().mockReturnValue([{
    id: 'core-engineering',
    label: 'Socle Technique',
    emoji: '\u{1F4BB}',
    skills: [
      { id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [] },
      { id: 'typescript', label: 'TypeScript', categoryId: 'core-engineering', descriptors: [] },
      { id: 'python', label: 'Python', categoryId: 'core-engineering', descriptors: [] },
    ],
  }]),
}))

import { validateRatings, filterValidRatings } from '../lib/validation.js'

describe('validateRatings', () => {
  it('returns null for valid ratings', () => {
    const result = validateRatings({ java: 3, typescript: 4 })
    expect(result).toBeNull()
  })

  it('returns error for non-object input (null)', () => {
    expect(validateRatings(null)).toBe('ratings doit \u00eatre un objet')
  })

  it('returns error for non-object input (array)', () => {
    expect(validateRatings([1, 2, 3])).toBe('ratings doit \u00eatre un objet')
  })

  it('returns error for non-object input (string)', () => {
    expect(validateRatings('not an object')).toBe('ratings doit \u00eatre un objet')
  })

  it('returns error for unknown skill ID', () => {
    const result = validateRatings({ 'unknown-skill': 3 })
    expect(result).toBe('Comp\u00e9tence inconnue: unknown-skill')
  })

  it('returns ALL unknown skill IDs in one error (oracle drift fix)', () => {
    // Demo bug: form blocks the candidate with "Comp\u00e9tence inconnue: oracle"
    // and they have to guess what other keys are also bad. Now the error
    // lists every unknown key in one shot.
    const result = validateRatings({ oracle: 4, java: 3, mysql: 2, kafka: 1 })
    expect(result).toBe('Comp\u00e9tences inconnues: oracle, mysql, kafka')
  })

  it('reports value errors before unknown-key errors when both present', () => {
    // If a known key has a bad value, that\'s the immediate error. Unknown
    // keys are only flagged if all known keys validate cleanly.
    const result = validateRatings({ java: 99, oracle: 4 })
    expect(result).toMatch(/Valeur invalide pour java/)
  })

  it('returns error for non-integer rating (float)', () => {
    const result = validateRatings({ java: 2.5 })
    expect(result).toMatch(/Valeur invalide pour java/)
  })

  it('returns error for non-integer rating (string)', () => {
    const result = validateRatings({ java: '3' })
    expect(result).toMatch(/Valeur invalide pour java/)
  })

  it('returns error for out-of-range rating (negative)', () => {
    const result = validateRatings({ java: -1 })
    expect(result).toMatch(/Valeur invalide pour java/)
  })

  it('returns error for out-of-range rating (> 5)', () => {
    const result = validateRatings({ java: 6 })
    expect(result).toMatch(/Valeur invalide pour java/)
  })
})

describe('filterValidRatings', () => {
  it('keeps valid entries, drops invalid ones', () => {
    const input: Record<string, unknown> = {
      java: 3,
      typescript: 4,
      'unknown-skill': 2,    // invalid skill ID
      python: -1,            // out of range
      java2: 'three',        // non-number
    }
    const result = filterValidRatings(input)

    expect(result).toEqual({ java: 3, typescript: 4 })
    expect(result).not.toHaveProperty('unknown-skill')
    expect(result).not.toHaveProperty('python')
    expect(result).not.toHaveProperty('java2')
  })

  it('returns empty object when all entries are invalid', () => {
    const result = filterValidRatings({ 'bad-id': 3, java: 10 })
    expect(result).toEqual({})
  })

  it('accepts boundary values 0 and 5', () => {
    const result = filterValidRatings({ java: 0, typescript: 5 })
    expect(result).toEqual({ java: 0, typescript: 5 })
  })
})

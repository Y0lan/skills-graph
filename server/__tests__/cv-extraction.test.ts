import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before vi.mock hoisting, making these available in factories
const { mockCreate, mockExtractText } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockExtractText: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

vi.mock('unpdf', () => ({
  extractText: mockExtractText,
}))

// Mock catalog to provide known skill IDs for filterValidRatings
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

import { extractCvText, extractSkillsFromCv } from '../lib/cv-extraction.js'
import type { SkillCategory } from '../../src/data/skill-catalog.js'

const mockCatalog: SkillCategory[] = [{
  id: 'core-engineering',
  label: 'Socle Technique',
  emoji: '\u{1F4BB}',
  skills: [
    { id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [] },
    { id: 'typescript', label: 'TypeScript', categoryId: 'core-engineering', descriptors: [] },
    { id: 'python', label: 'Python', categoryId: 'core-engineering', descriptors: [] },
  ],
}]

describe('extractCvText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns text from PDF buffer', async () => {
    mockExtractText.mockResolvedValueOnce({ text: 'Curriculum Vitae - John Doe' })

    const buf = Buffer.from('fake-pdf-content')
    const result = await extractCvText(buf)

    expect(result).toBe('Curriculum Vitae - John Doe')
    expect(mockExtractText).toHaveBeenCalledOnce()
    // Verify it received a Uint8Array
    const arg = mockExtractText.mock.calls[0][0]
    expect(arg).toBeInstanceOf(Uint8Array)
  })
})

describe('extractSkillsFromCv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when text < 50 chars', async () => {
    const result = await extractSkillsFromCv('short text', mockCatalog)
    expect(result).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns valid suggestions from Claude tool_use response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        id: 'test-call',
        name: 'submit_skill_ratings',
        input: { suggestions: { java: 3, typescript: 4 } },
      }],
    })

    const cvText = 'A'.repeat(100) // Long enough to pass the 50-char check
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toEqual({ java: 3, typescript: 4 })
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('filters out invalid skill IDs from Claude response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        id: 'test-call',
        name: 'submit_skill_ratings',
        input: { suggestions: { java: 3, 'nonexistent-skill': 4, typescript: 2 } },
      }],
    })

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toEqual({ java: 3, typescript: 2 })
    expect(result).not.toHaveProperty('nonexistent-skill')
  })

  it('filters out ratings outside 0-5 range', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        id: 'test-call',
        name: 'submit_skill_ratings',
        input: { suggestions: { java: 3, typescript: -1, python: 6 } },
      }],
    })

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toEqual({ java: 3 })
    expect(result).not.toHaveProperty('typescript')
    expect(result).not.toHaveProperty('python')
  })

  it('returns null when Claude API fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'))

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toBeNull()
  })

  it('returns null when no tool_use block in response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: 'I could not extract skills from this CV.',
      }],
    })

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toBeNull()
  })
})

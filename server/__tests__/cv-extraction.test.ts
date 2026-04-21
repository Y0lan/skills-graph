import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before vi.mock hoisting, making these available in factories
const { mockCreate, mockExtractText, mockExtractRawText } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockExtractText: vi.fn(),
  mockExtractRawText: vi.fn(),
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

vi.mock('mammoth', () => ({
  default: {
    extractRawText: mockExtractRawText,
  },
}))

// Mock catalog to provide known skill IDs for filterValidRatings
vi.mock('../lib/catalog.js', () => ({
  getSkillCategories: vi.fn().mockReturnValue([
    {
      id: 'core-engineering',
      label: 'Socle Technique',
      emoji: '\u{1F4BB}',
      skills: [
        { id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
        { id: 'typescript', label: 'TypeScript', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
        { id: 'python', label: 'Python', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
      ],
    },
    {
      id: 'frontend-ui',
      label: 'Frontend & UI',
      emoji: '\u{1F3A8}',
      skills: [
        { id: 'angular', label: 'Angular', categoryId: 'frontend-ui', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
      ],
    },
  ]),
}))

import { extractCvText, extractSkillsFromCv } from '../lib/cv-extraction.js'
import type { SkillCategory } from '../../src/data/skill-catalog.js'

const mockCatalog: SkillCategory[] = [
  {
    id: 'core-engineering',
    label: 'Socle Technique',
    emoji: '\u{1F4BB}',
    skills: [
      { id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
      { id: 'typescript', label: 'TypeScript', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
      { id: 'python', label: 'Python', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
    ],
  },
  {
    id: 'frontend-ui',
    label: 'Frontend & UI',
    emoji: '\u{1F3A8}',
    skills: [
      { id: 'angular', label: 'Angular', categoryId: 'frontend-ui', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
    ],
  },
]

/** Helper: create a mock tool_use response for a category */
function mockToolResponse(suggestions: Record<string, number>, reasoning?: Record<string, string>) {
  return {
    content: [{
      type: 'tool_use',
      id: `call-${Math.random()}`,
      name: 'submit_skill_ratings',
      input: {
        suggestions,
        reasoning: reasoning ?? Object.fromEntries(
          Object.entries(suggestions).map(([k, v]) => [k, `mock reasoning for ${k}: L${v}`])
        ),
      },
    }],
  }
}

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
    const arg = mockExtractText.mock.calls[0][0]
    expect(arg).toBeInstanceOf(Uint8Array)
  })

  it('returns text from PDF with array result', async () => {
    mockExtractText.mockResolvedValueOnce({ text: ['Page 1 content', 'Page 2 content'] })

    const buf = Buffer.from('fake-pdf-content')
    const result = await extractCvText(buf)

    expect(result).toBe('Page 1 content\nPage 2 content')
  })

  it('returns text from DOCX buffer (PK magic bytes)', async () => {
    mockExtractRawText.mockResolvedValueOnce({ value: 'DOCX content here' })

    // PK magic bytes: 0x50 0x4B
    const buf = Buffer.from([0x50, 0x4B, 0x03, 0x04, ...Buffer.from('rest of docx')])
    const result = await extractCvText(buf)

    expect(result).toBe('DOCX content here')
    expect(mockExtractRawText).toHaveBeenCalledOnce()
    expect(mockExtractText).not.toHaveBeenCalled()
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

  it('makes one API call per category and merges results', async () => {
    // First call: core-engineering category
    mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 3, typescript: 4 }))
    // Second call: frontend-ui category
    mockCreate.mockResolvedValueOnce(mockToolResponse({ angular: 2 }))

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      ratings: { java: 3, typescript: 4, angular: 2 },
      failedCategories: [],
    })
  })

  it('passes temperature:0 and system message to each API call', async () => {
    mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 3 }))
    mockCreate.mockResolvedValueOnce(mockToolResponse({}))

    const cvText = 'A'.repeat(100)
    await extractSkillsFromCv(cvText, mockCatalog)

    const firstCall = mockCreate.mock.calls[0][0]
    expect(firstCall.temperature).toBe(0)
    expect(firstCall.system).toContain('Socle Technique')
    expect(typeof firstCall.system).toBe('string')
    expect(firstCall.messages[0].role).toBe('user')

    const secondCall = mockCreate.mock.calls[1][0]
    expect(secondCall.temperature).toBe(0)
    expect(secondCall.system).toContain('Frontend & UI')
  })

  it('returns partial results when some categories fail', async () => {
    // First category succeeds
    mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 3 }))
    // Second category fails
    mockCreate.mockRejectedValueOnce(new Error('Rate limit exceeded'))

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toMatchObject({
      ratings: { java: 3 },
      failedCategories: ['frontend-ui'],
    })
  })

  it('returns null when ALL categories fail', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API down'))
    mockCreate.mockRejectedValueOnce(new Error('API down'))

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toBeNull()
  })

  it('handles category returning empty suggestions', async () => {
    mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 3 }))
    // Second category: no skills detected
    mockCreate.mockResolvedValueOnce(mockToolResponse({}))

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toMatchObject({
      ratings: { java: 3 },
      failedCategories: [],
    })
  })

  it('handles category returning no tool_use block', async () => {
    mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 3 }))
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'No skills found.' }],
    })

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toMatchObject({
      ratings: { java: 3 },
      failedCategories: [],
    })
  })

  it('filters out invalid skill IDs from merged results', async () => {
    mockCreate.mockResolvedValueOnce(
      mockToolResponse({ java: 3, 'nonexistent-skill': 4, typescript: 2 })
    )
    mockCreate.mockResolvedValueOnce(mockToolResponse({}))

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result!.ratings).toEqual({ java: 3, typescript: 2 })
    expect(result!.ratings).not.toHaveProperty('nonexistent-skill')
  })

  it('filters out ratings outside 0-5 range', async () => {
    mockCreate.mockResolvedValueOnce(
      mockToolResponse({ java: 3, typescript: -1, python: 6 })
    )
    mockCreate.mockResolvedValueOnce(mockToolResponse({}))

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result!.ratings).toEqual({ java: 3 })
  })

  it('returns null when all results are empty after validation', async () => {
    // Only invalid skills
    mockCreate.mockResolvedValueOnce(mockToolResponse({ 'fake-skill': 3 }))
    mockCreate.mockResolvedValueOnce(mockToolResponse({ 'another-fake': 2 }))

    const cvText = 'A'.repeat(100)
    const result = await extractSkillsFromCv(cvText, mockCatalog)

    expect(result).toBeNull()
  })

  it('requires reasoning field in tool schema', async () => {
    mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 3 }))
    mockCreate.mockResolvedValueOnce(mockToolResponse({}))

    const cvText = 'A'.repeat(100)
    await extractSkillsFromCv(cvText, mockCatalog)

    const call = mockCreate.mock.calls[0][0]
    const tool = call.tools[0]
    expect(tool.input_schema.required).toContain('reasoning')
    expect(tool.input_schema.properties.reasoning).toBeDefined()
  })
})

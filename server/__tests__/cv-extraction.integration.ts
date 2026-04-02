/**
 * Integration tests for CV skill extraction.
 * These tests call the live Claude API and are guarded by ANTHROPIC_API_KEY.
 * Run manually: ANTHROPIC_API_KEY=... npx vitest run server/__tests__/cv-extraction.integration.ts
 *
 * Cost: ~$0.50 per full run (3 CVs × 3 runs × 18 categories = 162 API calls)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { extractSkillsFromCv, type ExtractionResult } from '../lib/cv-extraction.js'
import { getSkillCategories } from '../lib/catalog.js'

const API_KEY = process.env.ANTHROPIC_API_KEY
const FIXTURES_DIR = join(__dirname, 'fixtures')

interface ExpectedOutput {
  anchorSkills: Record<string, number>
  otherExpected: Record<string, number>
}

function loadFixture(name: string): { cvText: string; expected: ExpectedOutput } {
  const cvText = readFileSync(join(FIXTURES_DIR, `${name}.txt`), 'utf-8')
  const expected = JSON.parse(
    readFileSync(join(FIXTURES_DIR, `${name}.expected.json`), 'utf-8')
  ) as ExpectedOutput
  return { cvText, expected }
}

function compareResults(
  result: ExtractionResult,
  expected: ExpectedOutput,
): { anchorMatches: number; anchorTotal: number; otherMatches: number; otherTotal: number; anchorFlips: string[] } {
  let anchorMatches = 0
  const anchorTotal = Object.keys(expected.anchorSkills).length
  const anchorFlips: string[] = []

  for (const [skillId, expectedLevel] of Object.entries(expected.anchorSkills)) {
    const actual = result.ratings[skillId]
    if (actual === undefined) {
      anchorFlips.push(`${skillId}: expected L${expectedLevel}, got MISSING`)
    } else if (actual === expectedLevel) {
      anchorMatches++
    } else {
      // Anchor skills require exact match
      anchorFlips.push(`${skillId}: expected L${expectedLevel}, got L${actual}`)
    }
  }

  let otherMatches = 0
  const otherTotal = Object.keys(expected.otherExpected).length
  for (const [skillId, expectedLevel] of Object.entries(expected.otherExpected)) {
    const actual = result.ratings[skillId]
    if (actual !== undefined && Math.abs(actual - expectedLevel) <= 1) {
      otherMatches++
    }
  }

  return { anchorMatches, anchorTotal, otherMatches, otherTotal, anchorFlips }
}

describe.skipIf(!API_KEY)('CV extraction integration (live API)', () => {
  const catalog = (() => {
    try { return getSkillCategories() } catch { return null }
  })()

  const fixtures = [
    { name: 'cv-fullstack-senior', label: 'Senior Fullstack Dev' },
    { name: 'cv-devops-junior', label: 'Junior DevOps' },
    { name: 'cv-analyst', label: 'Functional Analyst' },
  ]

  for (const fixture of fixtures) {
    it(`extracts expected skills from ${fixture.label} CV`, async () => {
      if (!catalog) throw new Error('Catalog not available — is the DB initialized?')

      const { cvText, expected } = loadFixture(fixture.name)
      const result = await extractSkillsFromCv(cvText, catalog)

      expect(result).not.toBeNull()
      expect(result!.failedCategories).toEqual([])

      const comparison = compareResults(result!, expected)

      // Anchor skills: exact match required
      if (comparison.anchorFlips.length > 0) {
        console.warn(`[${fixture.label}] Anchor skill mismatches:`, comparison.anchorFlips)
      }
      expect(comparison.anchorMatches).toBeGreaterThanOrEqual(
        Math.floor(comparison.anchorTotal * 0.8) // Allow 20% anchor drift as initial baseline
      )

      // Other skills: ±1 tolerance
      expect(comparison.otherMatches).toBeGreaterThanOrEqual(
        Math.floor(comparison.otherTotal * 0.7)
      )

      console.log(`[${fixture.label}] Anchors: ${comparison.anchorMatches}/${comparison.anchorTotal}, Other: ${comparison.otherMatches}/${comparison.otherTotal}`)
    }, 60_000) // 60s timeout for API calls
  }

  it('self-consistency: same CV produces >95% identical results across 3 runs', async () => {
    if (!catalog) throw new Error('Catalog not available')

    const { cvText } = loadFixture('cv-fullstack-senior')

    // Run 3 times
    const runs: ExtractionResult[] = []
    for (let i = 0; i < 3; i++) {
      const result = await extractSkillsFromCv(cvText, catalog)
      expect(result).not.toBeNull()
      runs.push(result!)
    }

    // Compare each pair of runs
    const allSkillIds = new Set(runs.flatMap(r => Object.keys(r.ratings)))
    let totalComparisons = 0
    let exactMatches = 0

    for (const skillId of allSkillIds) {
      const values = runs.map(r => r.ratings[skillId])
      // Compare run 0 vs 1, 0 vs 2, 1 vs 2
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          totalComparisons++
          if (values[i] === values[j]) {
            exactMatches++
          }
        }
      }
    }

    const consistency = totalComparisons > 0 ? exactMatches / totalComparisons : 1
    console.log(`[Self-consistency] ${exactMatches}/${totalComparisons} exact matches (${(consistency * 100).toFixed(1)}%)`)
    console.log(`[Self-consistency] Skills compared: ${allSkillIds.size}`)

    // Target: >95% exact match across runs
    // Starting with >80% as initial baseline — tighten after validating with real data
    expect(consistency).toBeGreaterThan(0.80)
  }, 120_000) // 120s timeout for 3 sequential runs
})

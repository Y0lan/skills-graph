import { describe, it, expect } from 'vitest'
import { mergeExtractions, applyRecruiterDecisions, type ExtractedFields } from '../lib/extraction-merge.js'

const F = (value: unknown, confidence = 0.9): { value: unknown; confidence: number } => ({ value, confidence })

describe('mergeExtractions', () => {
  describe('additive strategy', () => {
    it('adds fields that did not exist before', async () => {
      const existing: ExtractedFields = { phone: F('+33 1') }
      const incoming: ExtractedFields = { phone: F('+33 1'), city: F('Paris') }
      const r = mergeExtractions(existing, incoming, new Set(), 'additive')
      expect(r.merged.city).toEqual(F('Paris'))
      expect(r.diff.city).toEqual({ kind: 'added', newValue: 'Paris', confidence: 0.9 })
    })

    it('does NOT overwrite an existing non-empty field', async () => {
      const existing: ExtractedFields = { phone: F('+33 1') }
      const incoming: ExtractedFields = { phone: F('+33 2') }
      const r = mergeExtractions(existing, incoming, new Set(), 'additive')
      expect(r.merged.phone).toEqual(F('+33 1'))
      expect(r.diff.phone).toEqual({ kind: 'unchanged' })
    })

    it('overwrites a previously-empty field', async () => {
      const existing: ExtractedFields = { phone: F('') }
      const incoming: ExtractedFields = { phone: F('+33 1') }
      const r = mergeExtractions(existing, incoming, new Set(), 'additive')
      expect(r.merged.phone).toEqual(F('+33 1'))
    })

    it('skips locked fields entirely', async () => {
      const existing: ExtractedFields = { phone: F('+33 1') }
      const incoming: ExtractedFields = { phone: F('+33 2') }
      const r = mergeExtractions(existing, incoming, new Set(['phone']), 'additive')
      expect(r.merged.phone).toEqual(F('+33 1'))
      expect(r.diff.phone).toEqual({
        kind: 'locked-skipped',
        lockedValue: '+33 1',
        proposedValue: '+33 2',
        proposedConfidence: 0.9,
      })
    })
  })

  describe('replace strategy', () => {
    it('overwrites every non-locked field', async () => {
      const existing: ExtractedFields = { phone: F('+33 1'), city: F('Paris') }
      const incoming: ExtractedFields = { phone: F('+33 2'), city: F('Lyon') }
      const r = mergeExtractions(existing, incoming, new Set(), 'replace')
      expect(r.merged.phone).toEqual(F('+33 2'))
      expect(r.merged.city).toEqual(F('Lyon'))
    })

    it('still respects locked fields', async () => {
      const existing: ExtractedFields = { phone: F('+33 1'), city: F('Paris') }
      const incoming: ExtractedFields = { phone: F('+33 2'), city: F('Lyon') }
      const r = mergeExtractions(existing, incoming, new Set(['city']), 'replace')
      expect(r.merged.phone).toEqual(F('+33 2'))
      expect(r.merged.city).toEqual(F('Paris'))
    })

    it('reports unchanged when value is identical', async () => {
      const existing: ExtractedFields = { phone: F('+33 1') }
      const incoming: ExtractedFields = { phone: F('+33 1') }
      const r = mergeExtractions(existing, incoming, new Set(), 'replace')
      expect(r.diff.phone).toEqual({ kind: 'unchanged' })
    })
  })

  describe('recruiter-curated strategy', () => {
    it('does NOT mutate merged for non-locked changes — surfaces diff only', async () => {
      const existing: ExtractedFields = { phone: F('+33 1') }
      const incoming: ExtractedFields = { phone: F('+33 2') }
      const r = mergeExtractions(existing, incoming, new Set(), 'recruiter-curated')
      expect(r.merged.phone).toEqual(F('+33 1'))
      expect(r.diff.phone).toEqual({ kind: 'updated', oldValue: '+33 1', newValue: '+33 2', confidence: 0.9 })
    })

    it('still adds fields that did not exist before', async () => {
      const existing: ExtractedFields = {}
      const incoming: ExtractedFields = { phone: F('+33 1') }
      const r = mergeExtractions(existing, incoming, new Set(), 'recruiter-curated')
      expect(r.merged.phone).toEqual(F('+33 1'))
    })
  })
})

describe('applyRecruiterDecisions', () => {
  it('applies only accepted fields', async () => {
    const existing: ExtractedFields = { phone: F('+33 1'), city: F('Paris') }
    const incoming: ExtractedFields = { phone: F('+33 2'), city: F('Lyon') }
    const out = applyRecruiterDecisions(existing, incoming, new Set(['phone']), new Set())
    expect(out.phone).toEqual(F('+33 2'))
    expect(out.city).toEqual(F('Paris'))
  })

  it('skips locked fields even if explicitly accepted', async () => {
    const existing: ExtractedFields = { phone: F('+33 1') }
    const incoming: ExtractedFields = { phone: F('+33 2') }
    const out = applyRecruiterDecisions(existing, incoming, new Set(['phone']), new Set(['phone']))
    expect(out.phone).toEqual(F('+33 1'))
  })

  it('ignores incoming with empty value', async () => {
    const existing: ExtractedFields = { phone: F('+33 1') }
    const incoming: ExtractedFields = { phone: F('') }
    const out = applyRecruiterDecisions(existing, incoming, new Set(['phone']), new Set())
    expect(out.phone).toEqual(F('+33 1'))
  })
})

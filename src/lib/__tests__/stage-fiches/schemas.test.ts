import { describe, it, expect } from 'vitest'
import {
  validatePartialFichePatch,
  validateMergedFiche,
  stageFicheSchemas,
  entretienFicheSchema,
  propositionFicheSchema,
} from '@/lib/stage-fiches/schemas'

describe('stage-fiches/schemas — validatePartialFichePatch (R3)', () => {
  it('rejects empty body', () => {
    const r = validatePartialFichePatch('entretien_1', {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Au moins un champ requis')
  })

  it('rejects non-object body', () => {
    const r = validatePartialFichePatch('entretien_1', null as unknown)
    expect(r.ok).toBe(false)
  })

  it('preserves null for explicit clear-via-null', () => {
    const r = validatePartialFichePatch('entretien_1', { mode: null, scheduledAt: '2026-04-30T14:00' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.mode).toBeNull()
      expect(r.data.scheduledAt).toBe('2026-04-30T14:00')
    }
  })

  it('rejects malformed datetime', () => {
    const r = validatePartialFichePatch('entretien_1', { scheduledAt: 'garbage' })
    expect(r.ok).toBe(false)
  })

  it('accepts a partial body with optional fields', () => {
    const r = validatePartialFichePatch('entretien_1', { mode: 'visio' })
    expect(r.ok).toBe(true)
  })
})

describe('stage-fiches/schemas — validateMergedFiche', () => {
  it('passes a fully-typed entretien fiche', () => {
    const r = validateMergedFiche('entretien_1', {
      scheduledAt: '2026-04-30T14:00',
      mode: 'visio',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      durationMin: 60,
      conclusion: 'go',
    })
    expect(r.ok).toBe(true)
  })

  it('fails on out-of-range durationMin', () => {
    const r = validateMergedFiche('entretien_1', { durationMin: 999 })
    expect(r.ok).toBe(false)
  })

  it('fails on summary > 10k chars', () => {
    const r = validateMergedFiche('entretien_1', { summary: 'a'.repeat(10_001) })
    expect(r.ok).toBe(false)
  })

  it('proposition fiche: salary cap', () => {
    const r = validateMergedFiche('proposition', { salaryProposedAnnualXpf: 999_999_999 })
    expect(r.ok).toBe(false)
  })
})

describe('stage-fiches/schemas — registry exhaustiveness (B2)', () => {
  it('every canonical statut has a schema', () => {
    const statuts = [
      'postule', 'preselectionne', 'skill_radar_envoye', 'skill_radar_complete',
      'entretien_1', 'aboro', 'entretien_2', 'proposition', 'embauche', 'refuse',
    ]
    for (const s of statuts) {
      expect(stageFicheSchemas).toHaveProperty(s)
    }
  })

  it('entretien_1 and entretien_2 share the same shape', () => {
    expect(stageFicheSchemas.entretien_1).toBe(entretienFicheSchema)
    expect(stageFicheSchemas.entretien_2).toBe(entretienFicheSchema)
  })

  it('proposition uses propositionFicheSchema', () => {
    expect(stageFicheSchemas.proposition).toBe(propositionFicheSchema)
  })
})

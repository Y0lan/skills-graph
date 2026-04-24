import { describe, it, expect } from 'vitest'
import { emptyProfile, type AiProfile } from '../lib/profile-schema.js'
import { isProfileDegraded } from '../lib/cv-pipeline-helpers.js'

function withFullName(p: AiProfile, value: string): AiProfile {
  p.identity.fullName = { value, runId: null, sourceDoc: 'cv', confidence: 0.9, humanLockedAt: null, humanLockedBy: null }
  return p
}

function withSummary(p: AiProfile, value: string): AiProfile {
  p.softSignals.summaryFr = { value, runId: null, sourceDoc: 'cv', confidence: 0.8, humanLockedAt: null, humanLockedBy: null }
  return p
}

describe('isProfileDegraded', () => {
  it('flags a completely empty profile', () => {
    expect(isProfileDegraded(emptyProfile())).toBe(true)
  })

  it('flags a profile that only has photoAssetId populated (the Ogier/Emmanuel case, legacy shape)', () => {
    // The real stuck-candidate shape pre-fix: identity only, with a legacy
    // photoAssetId that is no longer part of the AiProfile schema. Cast
    // through `unknown` because `isProfileDegraded` only reads the
    // non-legacy fields we still care about (all null ⇒ degraded=true).
    const p = emptyProfile() as unknown as AiProfile & { identity: { photoAssetId?: unknown } }
    p.identity.photoAssetId = { value: 'asset-id-xyz', runId: null, sourceDoc: 'cv', confidence: 0.9, humanLockedAt: null, humanLockedBy: null }
    expect(isProfileDegraded(p)).toBe(true)
  })

  it('does NOT flag a thin-but-legit CV (one language + some education)', () => {
    const p = emptyProfile()
    p.education = [{ degree: 'BTS SIO', school: 'Lycée X', field: 'Info', yearStart: 2022, yearEnd: 2024, honors: null }]
    p.languages = [{ language: 'French', level: 'native', certification: null }]
    expect(isProfileDegraded(p)).toBe(false)
  })

  it('does NOT flag when fullName is present', () => {
    expect(isProfileDegraded(withFullName(emptyProfile(), 'Alice Martin'))).toBe(false)
  })

  it('does NOT flag when summaryFr is present', () => {
    expect(isProfileDegraded(withSummary(emptyProfile(), 'Ingénieure full-stack avec 5 ans'))).toBe(false)
  })

  it('does NOT flag when currentRole.role is present', () => {
    const p = emptyProfile()
    p.currentRole.role = { value: 'Senior Dev', runId: null, sourceDoc: 'cv', confidence: 0.9, humanLockedAt: null, humanLockedBy: null }
    expect(isProfileDegraded(p)).toBe(false)
  })

  it('does NOT flag when experience array has entries', () => {
    const p = emptyProfile()
    p.experience = [{ company: 'Acme', role: 'Dev', start: '2022-01', end: null, durationMonths: 24, location: 'Paris', description: null, technologies: [] }]
    expect(isProfileDegraded(p)).toBe(false)
  })

  it('does NOT flag when contact.email is present', () => {
    const p = emptyProfile()
    p.contact.email = { value: 'alice@example.com', runId: null, sourceDoc: 'cv', confidence: 0.95, humanLockedAt: null, humanLockedBy: null }
    expect(isProfileDegraded(p)).toBe(false)
  })
})

describe('buildExtractionError (reason aggregation)', async () => {
  const { buildExtractionError } = await import('../lib/cv-pipeline-helpers.js')

  it('returns null when everything is clean', () => {
    expect(buildExtractionError({ profileFailed: false, profileDegraded: false, profileThrewMsg: null, failedCategories: 0, roleAwareFailures: 0, failedCandidatures: 0 })).toBeNull()
  })

  it('mentions degraded profile explicitly', () => {
    const e = buildExtractionError({ profileFailed: false, profileDegraded: true, profileThrewMsg: null, failedCategories: 0, roleAwareFailures: 0, failedCandidatures: 0 })
    expect(e).toMatch(/profil.*(vide|dégradé|near-empty)/i)
  })

  it('mentions thrown profile error with message', () => {
    const e = buildExtractionError({ profileFailed: true, profileDegraded: false, profileThrewMsg: 'Anthropic 503', failedCategories: 0, roleAwareFailures: 0, failedCandidatures: 0 })
    expect(e).toMatch(/profil/i)
    expect(e).toContain('Anthropic 503')
  })

  it('joins multiple reasons', () => {
    const e = buildExtractionError({ profileFailed: false, profileDegraded: true, profileThrewMsg: null, failedCategories: 2, roleAwareFailures: 1, failedCandidatures: 0 })
    expect(e).toContain('profil')
    expect(e).toMatch(/2 cat/)
    expect(e).toMatch(/1 candidature/)
  })
})

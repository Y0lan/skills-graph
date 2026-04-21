import { describe, it, expect } from 'vitest'
import { buildCanonicalFilename, formatDisplayName } from '../lib/file-naming.js'

describe('buildCanonicalFilename', () => {
  const date = new Date('2026-04-21T00:00:00Z')

  it('uppercases the stem so the whole filename is visually consistent', () => {
    const out = buildCanonicalFilename('Pierre LEFÈVRE', 'certif_aws.pdf', date)
    expect(out).toBe('CERTIF_AWS_LEFEVRE_PIERRE_20260421.pdf')
  })

  it('preserves mixed-case stems as uppercase', () => {
    const out = buildCanonicalFilename('Pierre LEFÈVRE', 'Mon CV.pdf', date)
    expect(out).toBe('MON_CV_LEFEVRE_PIERRE_20260421.pdf')
  })

  it('handles firstname-only names gracefully', () => {
    const out = buildCanonicalFilename('PIERRE', 'doc.pdf', date)
    expect(out.endsWith('_PIERRE_INCONNU_20260421.pdf') || out.endsWith('_INCONNU_PIERRE_20260421.pdf')).toBe(true)
  })

  it('strips accents from candidate name', () => {
    const out = buildCanonicalFilename('José Maréchal', 'cv.pdf', date)
    expect(out).toContain('MARECHAL')
    expect(out).toContain('JOSE')
  })

  it('keeps extension lowercase even if input is .PDF', () => {
    const out = buildCanonicalFilename('Pierre LEFÈVRE', 'CV.PDF', date)
    expect(out).toMatch(/\.pdf$/)
  })

  it('falls back to DOCUMENT when stem collapses to empty', () => {
    const out = buildCanonicalFilename('Pierre LEFÈVRE', '...pdf', date)
    expect(out).toContain('DOCUMENT')
  })
})

describe('formatDisplayName', () => {
  it('keeps "Prenom NOM" format and uppercases the lastname', () => {
    expect(formatDisplayName('pierre lefèvre')).toBe('Pierre LEFÈVRE')
  })
})

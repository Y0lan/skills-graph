import { describe, it, expect } from 'vitest'
import { buildCanonicalFilename, formatDisplayName, uppercaseStem, buildTypePrefixedFilename } from '../lib/file-naming.js'

describe('buildCanonicalFilename', () => {
  const date = new Date('2026-04-21T00:00:00Z')

  it('uppercases the stem so the whole filename is visually consistent', async () => {
    const out = buildCanonicalFilename('Pierre LEFÈVRE', 'certif_aws.pdf', date)
    expect(out).toBe('CERTIF_AWS_LEFEVRE_PIERRE_20260421.pdf')
  })

  it('preserves mixed-case stems as uppercase', async () => {
    const out = buildCanonicalFilename('Pierre LEFÈVRE', 'Mon CV.pdf', date)
    expect(out).toBe('MON_CV_LEFEVRE_PIERRE_20260421.pdf')
  })

  it('handles firstname-only names gracefully', async () => {
    const out = buildCanonicalFilename('PIERRE', 'doc.pdf', date)
    expect(out.endsWith('_PIERRE_INCONNU_20260421.pdf') || out.endsWith('_INCONNU_PIERRE_20260421.pdf')).toBe(true)
  })

  it('strips accents from candidate name', async () => {
    const out = buildCanonicalFilename('José Maréchal', 'cv.pdf', date)
    expect(out).toContain('MARECHAL')
    expect(out).toContain('JOSE')
  })

  it('keeps extension lowercase even if input is .PDF', async () => {
    const out = buildCanonicalFilename('Pierre LEFÈVRE', 'CV.PDF', date)
    expect(out).toMatch(/\.pdf$/)
  })

  it('falls back to DOCUMENT when stem collapses to empty', async () => {
    const out = buildCanonicalFilename('Pierre LEFÈVRE', '...pdf', date)
    expect(out).toContain('DOCUMENT')
  })
})

describe('uppercaseStem', () => {
  it('uppercases the stem but keeps extension lowercase', async () => {
    expect(uppercaseStem('cv.pdf')).toBe('CV.pdf')
    expect(uppercaseStem('lm.PDF')).toBe('LM.pdf')
    expect(uppercaseStem('mon_rapport_aboro.docx')).toBe('MON_RAPPORT_ABORO.docx')
  })

  it('handles files with no extension', async () => {
    expect(uppercaseStem('readme')).toBe('README')
  })

  it('handles files with leading dot (hidden)', async () => {
    expect(uppercaseStem('.hidden')).toBe('.HIDDEN')
  })

  it('preserves special characters in the stem', async () => {
    expect(uppercaseStem('cv-pierre_v2.pdf')).toBe('CV-PIERRE_V2.pdf')
  })
})

describe('buildTypePrefixedFilename', () => {
  const date = new Date('2026-04-21T00:00:00Z')

  it('builds CV_LAST_FIRST_DATE.pdf for Drupal CV uploads', async () => {
    expect(buildTypePrefixedFilename('CV', 'Pierre LEFÈVRE', 'cv.pdf', date))
      .toBe('CV_LEFEVRE_PIERRE_20260421.pdf')
  })

  it('builds LM_LAST_FIRST_DATE.pdf for Drupal lettre uploads', async () => {
    expect(buildTypePrefixedFilename('LM', 'Pierre LEFÈVRE', 'lettre.pdf', date))
      .toBe('LM_LEFEVRE_PIERRE_20260421.pdf')
  })

  it('normalises the prefix to uppercase', async () => {
    expect(buildTypePrefixedFilename('cv', 'Jane Doe', 'x.pdf', date))
      .toBe('CV_DOE_JANE_20260421.pdf')
  })

  it('strips accents from candidate name', async () => {
    expect(buildTypePrefixedFilename('CV', 'José Maréchal', 'cv.pdf', date))
      .toBe('CV_MARECHAL_JOSE_20260421.pdf')
  })

  it('uses INCONNU when firstname or lastname is missing', async () => {
    expect(buildTypePrefixedFilename('CV', 'Pierre', 'cv.pdf', date))
      .toMatch(/CV_PIERRE_INCONNU_20260421\.pdf|CV_INCONNU_PIERRE_20260421\.pdf/)
  })

  it('keeps extension lowercase even when input is .PDF', async () => {
    expect(buildTypePrefixedFilename('CV', 'Jane Doe', 'CV.PDF', date))
      .toBe('CV_DOE_JANE_20260421.pdf')
  })
})

describe('formatDisplayName', () => {
  it('keeps "Prenom NOM" format and uppercases the lastname', async () => {
    expect(formatDisplayName('pierre lefèvre')).toBe('Pierre LEFÈVRE')
  })
})

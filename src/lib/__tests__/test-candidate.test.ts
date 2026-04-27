import { describe, it, expect } from 'vitest'
import { isTestCandidateEmail } from '@/lib/test-candidate'

describe('isTestCandidateEmail', () => {
  it('flags @yopmail.com', () => {
    expect(isTestCandidateEmail('john@yopmail.com')).toBe(true)
  })
  it('flags @yopmail.fr / .net / .biz', () => {
    expect(isTestCandidateEmail('jane@yopmail.fr')).toBe(true)
    expect(isTestCandidateEmail('al.lo@yopmail.net')).toBe(true)
    expect(isTestCandidateEmail('zz@yopmail.biz')).toBe(true)
  })
  it('flags subdomained yopmail (e.g. mail.yopmail.com)', () => {
    expect(isTestCandidateEmail('x@mail.yopmail.com')).toBe(true)
  })
  it('case-insensitive', () => {
    expect(isTestCandidateEmail('Test@YopMail.COM')).toBe(true)
  })
  it('does NOT flag look-alike domains', () => {
    expect(isTestCandidateEmail('john@yopmailhost.com')).toBe(false)
    expect(isTestCandidateEmail('john@notyopmail.com')).toBe(false)
    expect(isTestCandidateEmail('yopmail@example.com')).toBe(false)
  })
  it('does NOT flag empty / null / malformed', () => {
    expect(isTestCandidateEmail(null)).toBe(false)
    expect(isTestCandidateEmail(undefined)).toBe(false)
    expect(isTestCandidateEmail('')).toBe(false)
    expect(isTestCandidateEmail('not-an-email')).toBe(false)
  })
  it('does NOT flag legitimate emails', () => {
    expect(isTestCandidateEmail('pierre@sinapse.nc')).toBe(false)
    expect(isTestCandidateEmail('ada@gmail.com')).toBe(false)
    expect(isTestCandidateEmail('candidate@outlook.com')).toBe(false)
  })
})

/**
 * Heuristic: is this candidate a test entry the recruiter created via a
 * disposable inbox (yopmail.com / .fr / .net / …) so they can step
 * through the pipeline without polluting the live candidate list?
 *
 * Scope intentionally narrow — only yopmail. If a real candidate ever
 * applies with a yopmail address, that's a worse signal anyway and the
 * "TEST" pill is a cheap heads-up for the recruiter.
 */
export function isTestCandidateEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const host = email.slice(at + 1).toLowerCase()
  return /(^|\.)yopmail\./.test(host) || host === 'yopmail'
}

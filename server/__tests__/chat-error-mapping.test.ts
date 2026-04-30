import { describe, it, expect } from 'vitest'
import { mapAnthropicError } from '../routes/chat.js'

/**
 * Diagnose-first principle (codex P3 + plan §Item 1): the chatbot used
 * to swallow every Anthropic failure as "Erreur lors de la génération",
 * leaving Yolan/Guillaume guessing whether they hit a rate limit, a
 * context overflow, an auth issue, or something else. Now the actual
 * error class drives a French message that tells them what to do next.
 */
describe('mapAnthropicError', () => {
  it('rate_limit_error → réessaie message', async () => {
    const err = { status: 429, error: { error: { type: 'rate_limit_error', message: 'Rate exceeded' } } }
    expect(mapAnthropicError(err)).toMatch(/surchargée/i)
  })

  it('429 status without typed error still maps to rate-limit message', async () => {
    const err = { status: 429, message: 'Too many requests' }
    expect(mapAnthropicError(err)).toMatch(/surchargée/i)
  })

  it('context_length_exceeded → "sélectionne quelques membres" message', async () => {
    const err = { status: 400, error: { error: { type: 'context_length_exceeded' } } }
    expect(mapAnthropicError(err)).toMatch(/Contexte trop large/i)
  })

  it('error message containing "context length" still maps to context-too-large', async () => {
    const err = { status: 400, message: 'prompt is too long for the context window' }
    expect(mapAnthropicError(err)).toMatch(/Contexte trop large/i)
  })

  it('authentication_error (401) → admin notice', async () => {
    const err = { status: 401, error: { error: { type: 'authentication_error' } } }
    expect(mapAnthropicError(err)).toMatch(/admin/i)
  })

  it('invalid_request_error (400) without context-length signal → generic 400', async () => {
    const err = { status: 400, error: { error: { type: 'invalid_request_error', message: 'Bad payload' } } }
    expect(mapAnthropicError(err)).toMatch(/Requête invalide/i)
  })

  it('overloaded_error (529) → réessaie message', async () => {
    const err = { status: 529, error: { error: { type: 'overloaded_error' } } }
    expect(mapAnthropicError(err)).toMatch(/surchargée/i)
  })

  it('unknown error class → generic fallback (still mentions logs)', async () => {
    const err = { status: 500, message: 'something else' }
    expect(mapAnthropicError(err)).toMatch(/logs serveur/i)
  })

  it('null/undefined error → generic fallback', async () => {
    expect(mapAnthropicError(null)).toMatch(/logs serveur/i)
    expect(mapAnthropicError(undefined)).toMatch(/logs serveur/i)
  })

  it('error.type at top level (no nested error.error) still resolves', async () => {
    // Anthropic SDK shape can vary across versions; the mapper handles
    // both nested {error: {error: {type}}} and flat {type} envelopes.
    const err = { status: 429, type: 'rate_limit_error' }
    expect(mapAnthropicError(err)).toMatch(/surchargée/i)
  })
})

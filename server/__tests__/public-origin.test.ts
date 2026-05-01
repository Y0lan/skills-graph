import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveAppPublicOrigin } from '../lib/public-origin.js'

const OLD_ENV = { ...process.env }

afterEach(() => {
  vi.unstubAllEnvs()
  for (const key of ['APP_PUBLIC_ORIGIN', 'BETTER_AUTH_URL', 'CORS_ORIGIN'] as const) {
    if (OLD_ENV[key] === undefined) delete process.env[key]
    else process.env[key] = OLD_ENV[key]
  }
})

describe.sequential('resolveAppPublicOrigin', () => {
  it('prefers APP_PUBLIC_ORIGIN for production email links', () => {
    process.env.APP_PUBLIC_ORIGIN = 'https://competences.sinapse.nc/'
    process.env.BETTER_AUTH_URL = 'https://auth.example.com'
    process.env.CORS_ORIGIN = 'https://cors.example.com'

    expect(resolveAppPublicOrigin()).toBe('https://competences.sinapse.nc')
  })

  it('falls back through Better Auth then CORS origin', () => {
    delete process.env.APP_PUBLIC_ORIGIN
    process.env.BETTER_AUTH_URL = 'https://competences.sinapse.nc'
    process.env.CORS_ORIGIN = 'https://cors.example.com'
    expect(resolveAppPublicOrigin()).toBe('https://competences.sinapse.nc')

    delete process.env.BETTER_AUTH_URL
    expect(resolveAppPublicOrigin()).toBe('https://cors.example.com')
  })

  it('does not use wildcard or allowlist CORS values as public link origins', () => {
    delete process.env.APP_PUBLIC_ORIGIN
    delete process.env.BETTER_AUTH_URL
    process.env.CORS_ORIGIN = 'https://app.example.com,https://admin.example.com'
    expect(resolveAppPublicOrigin()).toBe('http://localhost:5173')

    process.env.CORS_ORIGIN = '*'
    expect(resolveAppPublicOrigin()).toBe('http://localhost:5173')
  })

  it('rejects URL paths in public origin env candidates', () => {
    process.env.APP_PUBLIC_ORIGIN = 'https://competences.sinapse.nc/evaluate'
    delete process.env.BETTER_AUTH_URL
    process.env.CORS_ORIGIN = 'https://cors.example.com'

    expect(resolveAppPublicOrigin()).toBe('https://cors.example.com')
  })

  it('uses request host only for local development', () => {
    vi.stubEnv('APP_PUBLIC_ORIGIN', '')
    vi.stubEnv('BETTER_AUTH_URL', '')
    vi.stubEnv('CORS_ORIGIN', '')

    expect(resolveAppPublicOrigin({ protocol: 'http', get: () => 'localhost:3001' })).toBe('http://localhost:3001')
    expect(resolveAppPublicOrigin({ protocol: 'http', get: () => 'skill-radar:8080' })).toBe('http://localhost:5173')
  })
})

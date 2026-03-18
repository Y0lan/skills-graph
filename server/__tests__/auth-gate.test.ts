import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock requireAuth: rejects by default, allows when x-test-auth header is present
const mockRequireAuth: express.RequestHandler = (req, res, next) => {
  if (req.headers['x-test-auth'] === 'valid') {
    return next()
  }
  res.status(401).json({ error: 'Non authentifie' })
}

function createTestApp() {
  const app = express()

  // Mirror the global auth gate from server/index.ts
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next()
    if (req.path === '/catalog' || req.path === '/catalog/') return next()
    return mockRequireAuth(req, res, next)
  })

  // Stub routes that mirror production
  app.get('/api/auth/session', (_req, res) => res.json({ ok: true }))
  app.get('/api/catalog', (_req, res) => res.json({ categories: [] }))
  app.get('/api/aggregates', (_req, res) => res.json({ team: {} }))
  app.get('/api/aggregates/:slug', (_req, res) => res.json({ member: {} }))
  app.get('/api/ratings', (_req, res) => res.json({ ratings: {} }))
  app.get('/api/members', (_req, res) => res.json({ members: [] }))
  app.get('/api/categories', (_req, res) => res.json({ categories: [] }))

  return app
}

describe('Global auth middleware', () => {
  let app: express.Express

  beforeAll(() => {
    app = createTestApp()
  })

  it('returns 401 for GET /api/aggregates without session', async () => {
    const res = await request(app).get('/api/aggregates')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Non authentifie')
  })

  it('returns 401 for GET /api/ratings without session', async () => {
    const res = await request(app).get('/api/ratings')
    expect(res.status).toBe(401)
  })

  it('returns 401 for GET /api/members without session', async () => {
    const res = await request(app).get('/api/members')
    expect(res.status).toBe(401)
  })

  it('returns 401 for GET /api/categories without session', async () => {
    const res = await request(app).get('/api/categories')
    expect(res.status).toBe(401)
  })

  it('returns 200 for GET /api/catalog without session', async () => {
    const res = await request(app).get('/api/catalog')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('categories')
  })

  it('passes through /api/auth/* routes', async () => {
    const res = await request(app).get('/api/auth/session')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('returns 200 for GET /api/aggregates with valid session', async () => {
    const res = await request(app)
      .get('/api/aggregates')
      .set('x-test-auth', 'valid')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('team')
  })

  it('returns 200 for GET /api/aggregates/:slug with valid session', async () => {
    const res = await request(app)
      .get('/api/aggregates/john-doe')
      .set('x-test-auth', 'valid')
    expect(res.status).toBe(200)
  })

  it('returns 200 for GET /api/ratings with valid session', async () => {
    const res = await request(app)
      .get('/api/ratings')
      .set('x-test-auth', 'valid')
    expect(res.status).toBe(200)
  })
})

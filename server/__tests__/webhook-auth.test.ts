import { describe, it, expect } from 'vitest'
import supertest from 'supertest'
import express from 'express'

describe('webhook auth guard logic', () => {
  it('rejects with 401 when wrong secret is provided', async () => {
    const app = express()
    app.use(express.json())
    app.post('/test-intake', (req, res) => {
      const secret = 'test-secret-123'
      if (!secret) { res.status(500).json({ error: 'Webhook not configured' }); return }
      const provided = req.headers['x-webhook-secret'] as string | undefined
      if (!provided || provided !== secret) { res.status(401).json({ error: 'Webhook secret invalide' }); return }
      res.json({ ok: true })
    })

    const res = await supertest(app)
      .post('/test-intake')
      .set('x-webhook-secret', 'wrong-secret')
      .send({ nom: 'Test', email: 'test@test.com', poste_vise: 'dev' })
    expect(res.status).toBe(401)
  })

  it('accepts request with correct secret', async () => {
    const app = express()
    app.use(express.json())
    app.post('/test-intake', (req, res) => {
      const secret = 'test-secret-123'
      if (!secret) { res.status(500).json({ error: 'Webhook not configured' }); return }
      const provided = req.headers['x-webhook-secret'] as string | undefined
      if (!provided || provided !== secret) { res.status(401).json({ error: 'Webhook secret invalide' }); return }
      res.json({ ok: true })
    })

    const res = await supertest(app)
      .post('/test-intake')
      .set('x-webhook-secret', 'test-secret-123')
      .send({ nom: 'Test', email: 'test@test.com', poste_vise: 'dev' })
    expect(res.status).toBe(200)
  })

  it('rejects with 500 when secret is not configured', async () => {
    const app = express()
    app.use(express.json())
    app.post('/test-intake', (req, res) => {
      const secret: string | undefined = undefined
      if (!secret) { res.status(500).json({ error: 'Webhook not configured' }); return }
      const provided = req.headers['x-webhook-secret'] as string | undefined
      if (!provided || provided !== secret) { res.status(401).json({ error: 'Webhook secret invalide' }); return }
      res.json({ ok: true })
    })

    const res = await supertest(app)
      .post('/test-intake')
      .set('x-webhook-secret', 'any-secret')
      .send({ nom: 'Test', email: 'test@test.com', poste_vise: 'dev' })
    expect(res.status).toBe(500)
  })
})

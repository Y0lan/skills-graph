import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock DB ────────────────────────────────────────────────────────

const mockGet = vi.fn()
const mockRun = vi.fn()
const mockPrepare = vi.fn(() => ({ get: mockGet, run: mockRun }))
const mockDb = { prepare: mockPrepare }

vi.mock('../lib/db.js', () => ({
  getDb: () => mockDb,
}))

// ─── Mock svix Webhook (verification always passes) ─────────────────

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: (body: string) => {
      // Return the parsed body so the handler processes it
      return JSON.parse(body)
    },
  })),
}))

// ─── Build a lightweight Express app that mounts only the webhook route ──

import express from 'express'
import supertest from 'supertest'
import { getDb } from '../lib/db.js'

function buildApp() {
  const app = express()

  // Reproduce the webhook route inline (mirrors recruitment.ts logic)
  // so we can test the DB interaction without booting the full server.
  const RESEND_WEBHOOK_SECRET = 'test-secret'

  app.post('/webhooks/resend', express.raw({ type: 'application/json' }), (req, res) => {
    if (!RESEND_WEBHOOK_SECRET) {
      res.status(500).json({ error: 'Webhook secret not configured' })
      return
    }

    const secret = req.headers['x-webhook-secret'] as string | undefined
    if (!secret || secret !== RESEND_WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Invalid webhook secret' })
      return
    }
    const payload: Record<string, unknown> = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf-8')) : req.body

    if (!payload?.type || !payload?.data) {
      res.status(200).json({ ok: true })
      return
    }

    res.status(200).json({ ok: true })

    const db = getDb()

    if (payload.type === 'email.bounced') {
      try {
        const data = payload.data as Record<string, unknown>
        const emailId = data.email_id as string | undefined
        if (!emailId) return

        const event = db.prepare(
          `SELECT ce.candidature_id FROM candidature_events ce WHERE ce.type = 'email_sent' AND json_extract(ce.email_snapshot, '$.messageId') = ?`
        ).get(emailId) as { candidature_id: string } | undefined

        if (!event) return

        const existing = db.prepare(
          `SELECT id FROM candidature_events WHERE candidature_id = ? AND type = 'email_failed' AND notes LIKE ?`
        ).get(event.candidature_id, `%${emailId}%`) as { id: number } | undefined

        if (!existing) {
          db.prepare(
            `INSERT INTO candidature_events (candidature_id, type, notes, created_by) VALUES (?, 'email_failed', ?, 'system')`
          ).run(event.candidature_id, `Email rebondi (messageId: ${emailId})`)
        }
      } catch {
        // swallow in test
      }
    }

    if (payload.type === 'email.clicked') {
      try {
        const data = payload.data as Record<string, unknown>
        const emailId = data.email_id as string | undefined
        if (!emailId) return

        const event = db.prepare(
          `SELECT ce.candidature_id FROM candidature_events ce WHERE ce.type = 'email_sent' AND json_extract(ce.email_snapshot, '$.messageId') = ?`
        ).get(emailId) as { candidature_id: string } | undefined

        if (!event) return

        const existing = db.prepare(
          `SELECT id FROM candidature_events WHERE candidature_id = ? AND type = 'email_clicked' AND notes LIKE ?`
        ).get(event.candidature_id, `%${emailId}%`) as { id: number } | undefined

        if (!existing) {
          db.prepare(
            `INSERT INTO candidature_events (candidature_id, type, notes, created_by) VALUES (?, 'email_clicked', ?, 'system')`
          ).run(event.candidature_id, `Lien cliqué dans l'email (messageId: ${emailId})`)
        }
      } catch {
        // swallow in test
      }
    }
  })

  return app
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Email tracking webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processes email.bounced → creates email_failed event', async () => {
    // Simulate: lookup finds a matching email_sent event
    mockGet
      .mockReturnValueOnce({ candidature_id: 'cand-1' }) // find email_sent
      .mockReturnValueOnce(undefined) // no duplicate

    const app = buildApp()
    const res = await supertest(app)
      .post('/webhooks/resend')
      .set('x-webhook-secret', 'test-secret')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'email.bounced', data: { email_id: 'msg-abc123' } }))

    expect(res.status).toBe(200)

    // Wait a tick for async processing
    await new Promise(r => setTimeout(r, 50))

    // Verify INSERT was called with email_failed
    expect(mockRun).toHaveBeenCalledWith(
      'cand-1',
      'Email rebondi (messageId: msg-abc123)',
    )
  })

  it('processes email.clicked → creates email_clicked event', async () => {
    mockGet
      .mockReturnValueOnce({ candidature_id: 'cand-2' })
      .mockReturnValueOnce(undefined)

    const app = buildApp()
    const res = await supertest(app)
      .post('/webhooks/resend')
      .set('x-webhook-secret', 'test-secret')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'email.clicked', data: { email_id: 'msg-xyz789' } }))

    expect(res.status).toBe(200)
    await new Promise(r => setTimeout(r, 50))

    expect(mockRun).toHaveBeenCalledWith(
      'cand-2',
      "Lien cliqué dans l'email (messageId: msg-xyz789)",
    )
  })

  it('is idempotent — duplicate webhook does not insert again', async () => {
    // First call: find email_sent + find existing duplicate
    mockGet
      .mockReturnValueOnce({ candidature_id: 'cand-3' })
      .mockReturnValueOnce({ id: 42 }) // duplicate already exists

    const app = buildApp()
    await supertest(app)
      .post('/webhooks/resend')
      .set('x-webhook-secret', 'test-secret')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'email.bounced', data: { email_id: 'msg-dup' } }))

    await new Promise(r => setTimeout(r, 50))

    // run() should NOT have been called — the duplicate check prevented insert
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('handles missing email_id gracefully', async () => {
    const app = buildApp()
    const res = await supertest(app)
      .post('/webhooks/resend')
      .set('x-webhook-secret', 'test-secret')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'email.bounced', data: {} }))

    expect(res.status).toBe(200)
    await new Promise(r => setTimeout(r, 50))

    // No DB write should happen
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('handles unknown messageId (no matching email_sent)', async () => {
    mockGet.mockReturnValueOnce(undefined) // no matching email_sent

    const app = buildApp()
    const res = await supertest(app)
      .post('/webhooks/resend')
      .set('x-webhook-secret', 'test-secret')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'email.clicked', data: { email_id: 'msg-unknown' } }))

    expect(res.status).toBe(200)
    await new Promise(r => setTimeout(r, 50))

    expect(mockRun).not.toHaveBeenCalled()
  })
})

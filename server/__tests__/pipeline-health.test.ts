import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import supertest from 'supertest'

// ─── Mock DB ────────────────────────────────────────────────────────

const mockGet = vi.fn()
const mockPrepare = vi.fn(() => ({ get: mockGet }))
const mockDb = { prepare: mockPrepare }

vi.mock('../lib/db.js', () => ({
  getDb: () => mockDb,
}))

import { getDb } from '../lib/db.js'

// ─── Build a lightweight app with only the health endpoint ──────────

function buildApp() {
  const app = express()

  app.get('/pipeline-health', (_req, res) => {
    try {
      const db = getDb()

      const lastIntake = db.prepare(
        `SELECT created_at FROM candidature_events WHERE type = 'transition' AND statut_to = 'postule' ORDER BY created_at DESC LIMIT 1`
      ).get() as { created_at: string } | undefined

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const recentCount = db.prepare(
        `SELECT COUNT(*) as count FROM candidatures WHERE created_at >= ?`
      ).get(twentyFourHoursAgo) as { count: number }

      const emailServiceStatus = !!process.env.RESEND_API_KEY
      const virusTotalConfigured = !!process.env.VIRUSTOTAL_API_KEY
      const clamAvConfigured = !!process.env.CLAMAV_HOST || !!process.env.CLAMDSCAN_PATH

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
      if (!emailServiceStatus) status = 'degraded'
      if (!lastIntake) status = 'degraded'

      res.json({
        drupalWebhookLastReceived: lastIntake?.created_at ?? null,
        emailServiceStatus: emailServiceStatus ? 'configured' : 'not_configured',
        scannerStatus: {
          virustotal: virusTotalConfigured ? 'configured' : 'not_configured',
          clamav: clamAvConfigured ? 'configured' : 'not_configured',
        },
        candidatesLast24h: recentCount.count,
        status,
      })
    } catch {
      res.status(500).json({ status: 'unhealthy', error: 'Health check failed' })
    }
  })

  return app
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Pipeline Health endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.VIRUSTOTAL_API_KEY
    delete process.env.CLAMAV_HOST
    delete process.env.CLAMDSCAN_PATH
  })

  it('returns correct structure', async () => {
    mockGet
      .mockReturnValueOnce({ created_at: '2026-04-16T10:00:00Z' }) // lastIntake
      .mockReturnValueOnce({ count: 5 }) // recentCount

    process.env.RESEND_API_KEY = 'test-key'
    process.env.VIRUSTOTAL_API_KEY = 'vt-key'
    process.env.CLAMAV_HOST = '127.0.0.1'

    const app = buildApp()
    const res = await supertest(app).get('/pipeline-health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      drupalWebhookLastReceived: '2026-04-16T10:00:00Z',
      emailServiceStatus: 'configured',
      scannerStatus: {
        virustotal: 'configured',
        clamav: 'configured',
      },
      candidatesLast24h: 5,
      status: 'healthy',
    })
  })

  it('returns candidatesLast24h = 0 when no candidates', async () => {
    mockGet
      .mockReturnValueOnce({ created_at: '2026-04-16T10:00:00Z' })
      .mockReturnValueOnce({ count: 0 })

    process.env.RESEND_API_KEY = 'test-key'

    const app = buildApp()
    const res = await supertest(app).get('/pipeline-health')

    expect(res.status).toBe(200)
    expect(res.body.candidatesLast24h).toBe(0)
  })

  it('returns degraded when email service is not configured', async () => {
    mockGet
      .mockReturnValueOnce({ created_at: '2026-04-16T10:00:00Z' })
      .mockReturnValueOnce({ count: 3 })

    // No RESEND_API_KEY set
    const app = buildApp()
    const res = await supertest(app).get('/pipeline-health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('degraded')
    expect(res.body.emailServiceStatus).toBe('not_configured')
  })

  it('returns degraded when no intake has ever been received', async () => {
    mockGet
      .mockReturnValueOnce(undefined) // no lastIntake
      .mockReturnValueOnce({ count: 0 })

    process.env.RESEND_API_KEY = 'test-key'

    const app = buildApp()
    const res = await supertest(app).get('/pipeline-health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('degraded')
    expect(res.body.drupalWebhookLastReceived).toBeNull()
  })

  it('returns healthy when email is configured and intake exists', async () => {
    mockGet
      .mockReturnValueOnce({ created_at: '2026-04-16T10:00:00Z' })
      .mockReturnValueOnce({ count: 2 })

    process.env.RESEND_API_KEY = 'test-key'

    const app = buildApp()
    const res = await supertest(app).get('/pipeline-health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('healthy')
  })
})

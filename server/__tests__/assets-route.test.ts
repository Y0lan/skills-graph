import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-route-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))
vi.mock('../middleware/require-lead.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/require-lead.js')>('../middleware/require-lead.js')
  return {
    ...actual,
    requireLead: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  }
})
vi.mock('express-rate-limit', () => ({
  default: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')
const { putAsset } = await import('../lib/asset-storage.js')

function preSeed() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('version', '5.1.0')").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((c, i) => ins.run(c, c, '*', i))
  db.close()
}

async function buildApp() {
  const { recruitmentRouter } = await import('../routes/recruitment.js')
  const app = express()
  app.use(express.json())
  app.use('/api/recruitment', recruitmentRouter)
  return app
}

describe('GET /api/recruitment/assets/:assetId', () => {
  let photoAssetId: string
  let cvAssetId: string

  beforeAll(() => {
    preSeed()
    initDatabase()
    const db = getDb()
    db.prepare(`
      INSERT INTO candidates (id, name, role, email, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c-photo', 'Pierre LEFEVRE', 'Architecte', 'p@example.com', 'test-lead',
      new Date(Date.now() + 365 * 86400000).toISOString(),
    )

    // Tiny 2-byte JPEG header as the stored content
    const photo = putAsset({
      candidateId: 'c-photo',
      kind: 'photo',
      buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
      mime: 'image/jpeg',
    })
    photoAssetId = photo.id

    const cv = putAsset({
      candidateId: 'c-photo',
      kind: 'cv_text',
      buffer: Buffer.from('hello from cv'),
      mime: 'text/plain',
    })
    cvAssetId = cv.id
  })

  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('streams photo bytes with correct content-type', async () => {
    const app = await buildApp()
    const res = await supertest(app).get(`/api/recruitment/assets/${photoAssetId}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.body.length).toBeGreaterThan(0)
    // Verify JPEG magic bytes
    expect(res.body[0]).toBe(0xFF)
    expect(res.body[1]).toBe(0xD8)
  })

  it('returns 404 when assetId does not exist', async () => {
    const app = await buildApp()
    const res = await supertest(app).get('/api/recruitment/assets/does-not-exist')
    expect(res.status).toBe(404)
  })

  it('returns 404 when asset kind is not photo (prevents CV leak)', async () => {
    const app = await buildApp()
    const res = await supertest(app).get(`/api/recruitment/assets/${cvAssetId}`)
    expect(res.status).toBe(404)
  })
})

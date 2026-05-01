import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../tests/helpers/postgres-sync-test-db.js'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postes-route-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))

// Stub requireLead so we don't need to wire full auth in tests
vi.mock('../middleware/require-lead.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/require-lead.js')>('../middleware/require-lead.js')
  return {
    ...actual,
    requireLead: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  }
})

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')

function preSeed() {
  const db = new Database(TEST_DATABASE_HANDLE)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
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

describe('PUT /api/recruitment/postes/:posteId (fiche de poste editor)', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })
  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('persists description and returns it back', async () => {
    const app = await buildApp()
    const posteId = getDb().prepare("SELECT id FROM postes LIMIT 1").get() as { id: string }
    const body = 'Mission : Développer le socle technique Java.\nProfil : 5+ ans d\'expérience.'
    const res = await supertest(app).put(`/api/recruitment/postes/${posteId.id}`).send({ description: body })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.description).toBe(body)

    const stored = getDb().prepare('SELECT description FROM postes WHERE id = ?').get(posteId.id) as { description: string }
    expect(stored.description).toBe(body)
  })

  it('rejects description > 20,000 chars with 400', async () => {
    const app = await buildApp()
    const posteId = getDb().prepare("SELECT id FROM postes LIMIT 1").get() as { id: string }
    const tooLong = 'A'.repeat(20001)
    const res = await supertest(app).put(`/api/recruitment/postes/${posteId.id}`).send({ description: tooLong })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('max 20000')
  })

  it('stores empty string as NULL', async () => {
    const app = await buildApp()
    const posteId = getDb().prepare("SELECT id FROM postes LIMIT 1").get() as { id: string }
    await supertest(app).put(`/api/recruitment/postes/${posteId.id}`).send({ description: 'initial' })
    const res = await supertest(app).put(`/api/recruitment/postes/${posteId.id}`).send({ description: '' })
    expect(res.status).toBe(200)
    expect(res.body.description).toBeNull()
    const stored = getDb().prepare('SELECT description FROM postes WHERE id = ?').get(posteId.id) as { description: string | null }
    expect(stored.description).toBeNull()
  })

  it('stores explicit null as NULL', async () => {
    const app = await buildApp()
    const posteId = getDb().prepare("SELECT id FROM postes LIMIT 1").get() as { id: string }
    const res = await supertest(app).put(`/api/recruitment/postes/${posteId.id}`).send({ description: null })
    expect(res.status).toBe(200)
    expect(res.body.description).toBeNull()
  })

  it('rejects non-string / non-null description with 400', async () => {
    const app = await buildApp()
    const posteId = getDb().prepare("SELECT id FROM postes LIMIT 1").get() as { id: string }
    const res = await supertest(app).put(`/api/recruitment/postes/${posteId.id}`).send({ description: 123 })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown poste id', async () => {
    const app = await buildApp()
    const res = await supertest(app).put('/api/recruitment/postes/does-not-exist').send({ description: 'x' })
    expect(res.status).toBe(404)
  })

  it('GET /postes exposes description in list response', async () => {
    const app = await buildApp()
    const posteId = getDb().prepare("SELECT id FROM postes LIMIT 1").get() as { id: string }
    await supertest(app).put(`/api/recruitment/postes/${posteId.id}`).send({ description: 'visible in list' })
    const res = await supertest(app).get('/api/recruitment/postes')
    expect(res.status).toBe(200)
    const found = (res.body as Array<{ id: string; description: string | null }>).find(p => p.id === posteId.id)
    expect(found?.description).toBe('visible in list')
  })
})

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-shortlist-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

// Two different users share the same dev app — parametrize requireLead
// to inject whichever one the test wants.
let currentUserId = 'user-alice'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: vi.fn() } } }))
vi.mock('../middleware/require-lead.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/require-lead.js')>('../middleware/require-lead.js')
  return {
    ...actual,
    requireLead: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      ;(req as express.Request & { user: { id: string; email: string; name: string; slug: string } }).user = {
        id: currentUserId,
        email: `${currentUserId}@example.com`,
        name: currentUserId,
        slug: currentUserId,
      }
      next()
    },
  }
})
vi.mock('express-rate-limit', () => ({
  default: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')

function preSeed() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
    -- Stub the Better Auth user table so user_shortlists' FK has a target.
    -- Real auth migrations don't run in this isolated test env.
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
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

function seedUser(id: string) {
  getDb().prepare(`
    INSERT OR IGNORE INTO user (id, email, name, emailVerified)
    VALUES (?, ?, ?, 1)
  `).run(id, `${id}@example.com`, id)
}

function seedCandidatureRow(candidateName: string): string {
  const db = getDb()
  const candidateId = crypto.randomUUID()
  db.prepare('INSERT INTO candidates (id, name, role, email, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(candidateId, candidateName, 'R', `${candidateName.replace(/\s+/g, '-')}@example.com`, 'system')
  const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
  const cid = crypto.randomUUID()
  db.prepare(
    `INSERT INTO candidatures (id, candidate_id, poste_id, statut, taux_global)
     VALUES (?, ?, ?, 'postule', 80)`,
  ).run(cid, candidateId, posteId)
  return cid
}

describe('#6 user_shortlists — cross-poste save', () => {
  beforeAll(() => {
    preSeed()
    initDatabase()
    seedUser('user-alice')
    seedUser('user-bob')
  })
  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
  beforeEach(() => {
    currentUserId = 'user-alice'
    getDb().prepare('DELETE FROM user_shortlists').run()
  })

  it('POST /shortlist upserts (no dup error on second star, note updates)', async () => {
    const cid = seedCandidatureRow('Cand1')
    const app = await buildApp()

    const res1 = await supertest(app).post('/api/recruitment/shortlist').send({ candidatureId: cid })
    expect(res1.status).toBe(200)
    const res2 = await supertest(app).post('/api/recruitment/shortlist').send({ candidatureId: cid, note: 'updated' })
    expect(res2.status).toBe(200)

    const row = getDb().prepare('SELECT note FROM user_shortlists WHERE user_id = ? AND candidature_id = ?').get('user-alice', cid) as { note: string | null } | undefined
    expect(row?.note).toBe('updated')

    const count = (getDb().prepare('SELECT COUNT(*) as n FROM user_shortlists WHERE user_id = ?').get('user-alice') as { n: number }).n
    expect(count).toBe(1)
  })

  it('GET /shortlist returns only the current user shortlist', async () => {
    const cid1 = seedCandidatureRow('Alice cand')
    const cid2 = seedCandidatureRow('Bob cand')
    const app = await buildApp()

    currentUserId = 'user-alice'
    await supertest(app).post('/api/recruitment/shortlist').send({ candidatureId: cid1 })
    currentUserId = 'user-bob'
    await supertest(app).post('/api/recruitment/shortlist').send({ candidatureId: cid2 })

    currentUserId = 'user-alice'
    const aliceRes = await supertest(app).get('/api/recruitment/shortlist')
    expect(aliceRes.status).toBe(200)
    const aliceIds = (aliceRes.body.items as Array<{ candidatureId: string }>).map(i => i.candidatureId)
    expect(aliceIds).toEqual([cid1])

    currentUserId = 'user-bob'
    const bobRes = await supertest(app).get('/api/recruitment/shortlist')
    const bobIds = (bobRes.body.items as Array<{ candidatureId: string }>).map(i => i.candidatureId)
    expect(bobIds).toEqual([cid2])
  })

  it('DELETE /shortlist/:id removes only that row, returns removed count', async () => {
    const cid = seedCandidatureRow('Del cand')
    const app = await buildApp()
    await supertest(app).post('/api/recruitment/shortlist').send({ candidatureId: cid })

    const res = await supertest(app).delete(`/api/recruitment/shortlist/${cid}`)
    expect(res.status).toBe(200)
    expect(res.body.removed).toBe(1)

    const row = getDb().prepare('SELECT COUNT(*) as n FROM user_shortlists WHERE user_id = ? AND candidature_id = ?').get('user-alice', cid) as { n: number }
    expect(row.n).toBe(0)
  })

  it('ON DELETE CASCADE on candidature cleans up shortlist entries', async () => {
    const cid = seedCandidatureRow('Cascade cand')
    const app = await buildApp()
    await supertest(app).post('/api/recruitment/shortlist').send({ candidatureId: cid })

    getDb().prepare('DELETE FROM candidatures WHERE id = ?').run(cid)

    const row = getDb().prepare('SELECT COUNT(*) as n FROM user_shortlists WHERE candidature_id = ?').get(cid) as { n: number }
    expect(row.n).toBe(0)
  })

  it('ON DELETE CASCADE on user cleans up shortlist entries', async () => {
    seedUser('user-doomed')
    const cid = seedCandidatureRow('Doom cand')
    getDb().prepare('INSERT INTO user_shortlists (user_id, candidature_id) VALUES (?, ?)')
      .run('user-doomed', cid)

    getDb().prepare('DELETE FROM user WHERE id = ?').run('user-doomed')

    const row = getDb().prepare('SELECT COUNT(*) as n FROM user_shortlists WHERE user_id = ?').get('user-doomed') as { n: number }
    expect(row.n).toBe(0)
  })

  it('POST with unknown candidatureId returns 404', async () => {
    const app = await buildApp()
    const res = await supertest(app).post('/api/recruitment/shortlist').send({ candidatureId: 'does-not-exist' })
    expect(res.status).toBe(404)
  })
})

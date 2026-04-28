import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canal-patch-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'
process.env.RECRUITMENT_LEADS = 'audit@test'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))
vi.mock('../middleware/require-lead.js', () => ({
  requireLead: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    // Mimic the middleware that attaches the user before passing to handler.
    Object.assign(req, { user: { id: 'u1', slug: 'yolan-maldonado', email: 'yolan@test', name: 'Yolan' } })
    next()
  },
}))

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')

function preSeed() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, label TEXT NOT NULL, sort_order INTEGER NOT NULL);
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

function seedCandidature(canal: 'cabinet' | 'site' | 'candidature_directe' | 'reseau' = 'site'): string {
  const db = getDb()
  const roleId = `role-${crypto.randomUUID()}`
  db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'R', 'system')
  const posteId = `poste-${crypto.randomUUID().slice(0, 8)}`
  db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
    VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId, roleId, 'P')
  const candidateId = crypto.randomUUID()
  db.prepare('INSERT INTO candidates (id, name, role, role_id, created_by) VALUES (?, ?, ?, ?, ?)').run(
    candidateId, 'Test Candidat', 'R', roleId, 'system',
  )
  const cid = crypto.randomUUID()
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal) VALUES (?, ?, ?, ?, ?)').run(
    cid, candidateId, posteId, 'postule', canal,
  )
  return cid
}

describe('PATCH /api/recruitment/candidatures/:id/canal', () => {
  beforeAll(() => {
    preSeed()
    initDatabase()
  })
  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('updates canal site → cabinet and returns changed=true', async () => {
    const cid = seedCandidature('site')
    const app = await buildApp()
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${cid}/canal`)
      .send({ canal: 'cabinet' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ canal: 'cabinet', changed: true })

    const row = getDb().prepare('SELECT canal FROM candidatures WHERE id = ?').get(cid) as { canal: string }
    expect(row.canal).toBe('cabinet')
  })

  it('records a canal_change audit row (NOT status_change) with French diff', async () => {
    const cid = seedCandidature('site')
    const app = await buildApp()
    await supertest(app).patch(`/api/recruitment/candidatures/${cid}/canal`).send({ canal: 'cabinet' })

    const events = getDb().prepare(
      'SELECT type, notes, created_by FROM candidature_events WHERE candidature_id = ? ORDER BY created_at DESC'
    ).all(cid) as { type: string; notes: string; created_by: string }[]
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('canal_change')
    expect(events[0].notes).toMatch(/Canal changé de site → cabinet/)
    expect(events[0].created_by).toBe('yolan-maldonado')
  })

  it('preserves prior non-cabinet canal on round-trip cabinet → off', async () => {
    // Frontend remembers the prior canal in component state. The
    // backend just stores whatever it receives; both site → cabinet
    // and cabinet → site are pure UPDATEs.
    const cid = seedCandidature('reseau')
    const app = await buildApp()
    await supertest(app).patch(`/api/recruitment/candidatures/${cid}/canal`).send({ canal: 'cabinet' })
    await supertest(app).patch(`/api/recruitment/candidatures/${cid}/canal`).send({ canal: 'reseau' })
    const row = getDb().prepare('SELECT canal FROM candidatures WHERE id = ?').get(cid) as { canal: string }
    expect(row.canal).toBe('reseau')
  })

  it('rejects invalid canal values', async () => {
    const cid = seedCandidature('site')
    const app = await buildApp()
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${cid}/canal`)
      .send({ canal: 'pigeon-courrier' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/canal invalide/i)
  })

  it('returns 404 when candidature does not exist', async () => {
    const app = await buildApp()
    const res = await supertest(app)
      .patch('/api/recruitment/candidatures/does-not-exist/canal')
      .send({ canal: 'cabinet' })
    expect(res.status).toBe(404)
  })

  it('no-op when canal is already the requested value (no audit row)', async () => {
    const cid = seedCandidature('cabinet')
    const app = await buildApp()
    const before = getDb().prepare(
      'SELECT COUNT(*) as cnt FROM candidature_events WHERE candidature_id = ?'
    ).get(cid) as { cnt: number }
    const res = await supertest(app).patch(`/api/recruitment/candidatures/${cid}/canal`).send({ canal: 'cabinet' })
    expect(res.status).toBe(200)
    expect(res.body.changed).toBe(false)
    const after = getDb().prepare(
      'SELECT COUNT(*) as cnt FROM candidature_events WHERE candidature_id = ?'
    ).get(cid) as { cnt: number }
    expect(after.cnt).toBe(before.cnt)
  })
})

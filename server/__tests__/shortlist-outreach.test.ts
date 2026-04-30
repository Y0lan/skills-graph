import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortlist-outreach-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

const sendMock = vi.fn()

vi.mock('resend', () => ({
  Resend: class { emails = { send: sendMock } },
}))
vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('../middleware/require-lead.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/require-lead.js')>('../middleware/require-lead.js')
  return { ...actual, requireLead: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() }
})
// Bypass rate limiting — tests fire too fast and would trigger heavyRateLimit.
vi.mock('express-rate-limit', () => ({
  default: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')

function preSeed() {
  const db = new Database(TEST_DATABASE_HANDLE)
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

function seedCandidature(posteId: string, params: { global: number | null; name?: string; email?: string | null }): string {
  const db = getDb()
  const candidateId = crypto.randomUUID()
  const emailValue = params.email === null ? null : (params.email ?? `c${candidateId.slice(0, 4)}@example.com`)
  db.prepare('INSERT INTO candidates (id, name, role, email, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(candidateId, params.name ?? `cand-${candidateId.slice(0, 6)}`, 'R', emailValue, 'system')
  const cid = crypto.randomUUID()
  db.prepare(
    `INSERT INTO candidatures (id, candidate_id, poste_id, statut, taux_compatibilite_poste, taux_compatibilite_equipe, taux_global)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(cid, candidateId, posteId, 'postule', params.global, params.global, params.global)
  return cid
}

describe('Phase 10: shortlist + outreach', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })
  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    sendMock.mockResolvedValue({ data: { id: 'msg-ok' }, error: null })
  })

  describe('GET /postes/:posteId/shortlist', () => {
    it('returns candidatures ranked by taux_global DESC, excludes null scores', async () => {
      const posteId = (getDb().prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      seedCandidature(posteId, { global: 80 })
      seedCandidature(posteId, { global: 90 })
      seedCandidature(posteId, { global: null }) // excluded
      seedCandidature(posteId, { global: 70 })

      const app = await buildApp()
      const res = await supertest(app).get(`/api/recruitment/postes/${posteId}/shortlist`)
      expect(res.status).toBe(200)
      const scores = (res.body.items as Array<{ tauxGlobal: number }>).map(i => i.tauxGlobal)
      expect(scores).toEqual([90, 80, 70])
    })

    it('respects limit param (default 10)', async () => {
      const posteId = (getDb().prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      const app = await buildApp()
      const res = await supertest(app).get(`/api/recruitment/postes/${posteId}/shortlist?limit=2`)
      expect(res.body.items.length).toBeLessThanOrEqual(2)
    })

    it('404 for unknown poste', async () => {
      const app = await buildApp()
      const res = await supertest(app).get('/api/recruitment/postes/does-not-exist/shortlist')
      expect(res.status).toBe(404)
    })

    it('returns top-3 skills from role_aware when present, baseline otherwise', async () => {
      const db = getDb()
      const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      const cid = seedCandidature(posteId, { global: 60 })
      db.prepare('UPDATE candidatures SET role_aware_suggestions = ? WHERE id = ?').run(
        JSON.stringify({ java: 5, python: 4, typescript: 3 }), cid,
      )
      const app = await buildApp()
      const res = await supertest(app).get(`/api/recruitment/postes/${posteId}/shortlist`)
      const item = (res.body.items as Array<{ candidatureId: string; top3Skills: Array<{ skillId: string; rating: number }> }>).find(i => i.candidatureId === cid)!
      expect(item.top3Skills[0]).toMatchObject({ skillId: 'java', rating: 5 })
      expect(item.top3Skills).toHaveLength(3)
    })
  })

  describe('POST /postes/:posteId/outreach', () => {
    it('sends emails to N candidates, logs events, returns {sent, failed}', async () => {
      const db = getDb()
      const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      const c1 = seedCandidature(posteId, { global: 90, email: 'a@example.com' })
      const c2 = seedCandidature(posteId, { global: 80, email: 'b@example.com' })

      const app = await buildApp()
      const res = await supertest(app).post(`/api/recruitment/postes/${posteId}/outreach`).send({
        candidatureIds: [c1, c2],
        statut: 'skill_radar_envoye',
      })
      expect(res.status).toBe(200)
      expect(res.body.sent.sort()).toEqual([c1, c2].sort())
      expect(res.body.failed).toHaveLength(0)

      const events = db.prepare("SELECT candidature_id FROM candidature_events WHERE type = 'email_sent' AND candidature_id IN (?, ?)").all(c1, c2) as Array<{ candidature_id: string }>
      expect(events.length).toBeGreaterThanOrEqual(2)
    })

    it('continues on per-email failure, reports failed list', async () => {
      const db = getDb()
      const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      const c1 = seedCandidature(posteId, { global: 90, email: 'ok@example.com' })
      const c2 = seedCandidature(posteId, { global: 80, email: null }) // no email

      const app = await buildApp()
      const res = await supertest(app).post(`/api/recruitment/postes/${posteId}/outreach`).send({
        candidatureIds: [c1, c2],
        statut: 'skill_radar_envoye',
      })
      expect(res.status).toBe(200)
      expect(res.body.sent).toContain(c1)
      expect(res.body.failed).toContainEqual(expect.objectContaining({ candidatureId: c2 }))
    })

    it('skill_radar_envoye outreach includes each candidate eval link in the sent email (preview/send parity)', async () => {
      const db = getDb()
      const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      const c1 = seedCandidature(posteId, { global: 90, email: 'eval-test@example.com', name: 'Testy' })

      const app = await buildApp()
      const res = await supertest(app).post(`/api/recruitment/postes/${posteId}/outreach`).send({
        candidatureIds: [c1],
        statut: 'skill_radar_envoye',
      })
      expect(res.status).toBe(200)
      expect(res.body.sent).toContain(c1)

      // The Resend mock captured the outgoing email. The HTML body MUST
      // contain /evaluate/<candidateId> — previously this endpoint sent
      // the email with an empty href="" because it didn't pass
      // evaluationUrl to sendTransitionEmail. Codex pass-2 finding #5.
      expect(sendMock).toHaveBeenCalled()
      const call = sendMock.mock.calls[0]
      const payload = call[0] as { html?: string } | undefined
      const html = payload?.html ?? ''
      expect(html).toMatch(/\/evaluate\//)
    })

    it('400 when batch exceeds 20', async () => {
      const posteId = (getDb().prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      const app = await buildApp()
      const res = await supertest(app).post(`/api/recruitment/postes/${posteId}/outreach`).send({
        candidatureIds: Array.from({ length: 21 }).map((_, i) => `x-${i}`),
        statut: 'skill_radar_envoye',
      })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('batch-too-large')
    })

    it('400 when missing candidatureIds or statut', async () => {
      const posteId = (getDb().prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      const app = await buildApp()
      const res1 = await supertest(app).post(`/api/recruitment/postes/${posteId}/outreach`).send({ statut: 'x' })
      expect(res1.status).toBe(400)
      const res2 = await supertest(app).post(`/api/recruitment/postes/${posteId}/outreach`).send({ candidatureIds: ['x'] })
      expect(res2.status).toBe(400)
    })

    it('idempotency key: second call returns cached response without re-sending', async () => {
      const db = getDb()
      const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
      const c1 = seedCandidature(posteId, { global: 85, email: 'idem@example.com' })
      const app = await buildApp()
      const key = 'test-idem-key-' + crypto.randomUUID()
      const res1 = await supertest(app)
        .post(`/api/recruitment/postes/${posteId}/outreach`)
        .set('x-idempotency-key', key)
        .send({ candidatureIds: [c1], statut: 'skill_radar_envoye' })
      expect(res1.status).toBe(200)
      const callsAfterFirst = sendMock.mock.calls.length

      const res2 = await supertest(app)
        .post(`/api/recruitment/postes/${posteId}/outreach`)
        .set('x-idempotency-key', key)
        .send({ candidatureIds: [c1], statut: 'skill_radar_envoye' })
      expect(res2.status).toBe(200)
      expect(res2.body).toEqual(res1.body)
      expect(sendMock.mock.calls.length).toBe(callsAfterFirst) // no additional calls
    })
  })
})

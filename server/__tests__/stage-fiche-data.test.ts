import { describe, it, expect, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import supertest from 'supertest'
import Database from 'better-sqlite3'

/**
 * GET / PATCH /api/recruitment/candidatures/:id/stages/:stage/data
 *
 * Per-stage structured fiche endpoints (v5.1). Hardened per codex
 * adversarial review: optimistic lock via If-Match (R1), merge-not-replace
 * with null-clears-field (R3), audit row in candidature_events (R6),
 * SSE emit (R2), origin guard (Y5).
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-fiche-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'
// Disable origin guard for tests (mirrors the express-rate-limit mock).
delete process.env.APP_PUBLIC_ORIGIN
delete process.env.APP_DEV_ORIGIN

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))
vi.mock('express-rate-limit', () => ({
  default: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  rateLimit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))
vi.mock('../middleware/require-lead.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/require-lead.js')>('../middleware/require-lead.js')
  return {
    ...actual,
    requireLead: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  }
})

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')

function preSeed(): void {
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

async function buildApp(opts: { user?: { slug: string } } = {}): Promise<express.Express> {
  const { recruitmentRouter } = await import('../routes/recruitment.js')
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    (req as unknown as { user: { slug: string; role: string; email: string } }).user = {
      slug: opts.user?.slug ?? 'yolan.test',
      role: 'lead',
      email: 'yolan@test.local',
    }
    next()
  })
  app.use('/api/recruitment', recruitmentRouter)
  return app
}

function seedCandidatureFixture(statut: string = 'entretien_1'): string {
  const db = getDb()
  const candidateId = `cand-${Math.random().toString(36).slice(2, 10)}`
  const candidatureId = `candidature-${Math.random().toString(36).slice(2, 10)}`
  const role = db.prepare('SELECT id FROM roles LIMIT 1').get() as { id: string } | undefined
  const effectiveRoleId = role?.id ?? (() => {
    const id = `role-${Math.random().toString(36).slice(2, 10)}`
    db.prepare('INSERT INTO roles (id, label, description, created_by) VALUES (?, ?, ?, ?)').run(id, 'Dev', '', 'yolan.test')
    return id
  })()
  const posteId = db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string } | undefined
  const effectivePosteId = posteId?.id ?? (() => {
    const id = `poste-${Math.random().toString(36).slice(2, 10)}`
    db.prepare(`INSERT INTO postes (id, titre, role_id, created_by, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))`).run(id, 'Dev Java Senior', effectiveRoleId, 'yolan.test')
    return id
  })()
  db.prepare(`INSERT INTO candidates (id, name, role, role_id, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'))`)
    .run(candidateId, 'Test Candidate', 'Dev', effectiveRoleId, 'yolan.test')
  db.prepare(`INSERT INTO candidatures (id, candidate_id, poste_id, canal, statut, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
    .run(candidatureId, candidateId, effectivePosteId, 'site', statut)
  return candidatureId
}

preSeed()
initDatabase()

afterAll(() => {
  try { getDb().close() } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('GET /candidatures/:id/stages/:stage/data', () => {
  it('returns empty data + null updatedAt when no row exists', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app).get(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: {}, updatedAt: null, updatedBy: null })
  })

  it('returns 400 for an unknown stage', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app).get(`/api/recruitment/candidatures/${id}/stages/not_a_stage/data`)
    expect(res.status).toBe(400)
  })

  it('returns 404 for a missing candidature', async () => {
    const app = await buildApp()
    const res = await supertest(app).get(`/api/recruitment/candidatures/missing/stages/entretien_1/data`)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /candidatures/:id/stages/:stage/data — happy path', () => {
  it('writes the row, returns the updated payload, inserts an audit event', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ scheduledAt: '2026-04-30T14:00', mode: 'visio', meetLink: 'https://meet.google.com/abc-defg-hij' })
    expect(res.status).toBe(200)
    expect(res.body.data.scheduledAt).toBe('2026-04-30T14:00')
    expect(res.body.data.mode).toBe('visio')
    expect(res.body.data.meetLink).toBe('https://meet.google.com/abc-defg-hij')
    expect(res.body.updatedAt).toBeTruthy()
    expect(res.body.updatedBy).toBe('yolan.test')

    // Stored row reflects the JSON we expect.
    const row = getDb().prepare(`SELECT data_json FROM candidature_stage_data WHERE candidature_id = ? AND stage = ?`).get(id, 'entretien_1') as { data_json: string }
    expect(JSON.parse(row.data_json)).toEqual({
      scheduledAt: '2026-04-30T14:00',
      mode: 'visio',
      meetLink: 'https://meet.google.com/abc-defg-hij',
    })

    // Audit row written under the same stage.
    const auditRows = getDb().prepare(`SELECT type, stage, content_md, created_by FROM candidature_events WHERE candidature_id = ? AND type = 'stage_data_changed'`).all(id) as Array<{ type: string; stage: string; content_md: string; created_by: string }>
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0].stage).toBe('entretien_1')
    expect(auditRows[0].created_by).toBe('yolan.test')
    expect(auditRows[0].content_md).toContain('scheduledAt')
  })

  it('generated columns project the dates for the upstream pill', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ scheduledAt: '2026-05-01T09:30' })
    const row = getDb().prepare(`SELECT scheduled_at FROM candidature_stage_data WHERE candidature_id = ? AND stage = ?`).get(id, 'entretien_1') as { scheduled_at: string }
    expect(row.scheduled_at).toBe('2026-05-01T09:30')
  })

  it('emits stage_data_changed on the SSE bus', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const { recruitmentBus } = await import('../lib/event-bus.js')
    let payload: { candidatureId: string; stage: string; updatedAt: string; byUserSlug: string } | null = null
    const off = recruitmentBus.subscribe('stage_data_changed', (p) => { payload = p })
    try {
      await supertest(app)
        .patch(`/api/recruitment/candidatures/${id}/stages/aboro/data`)
        .send({ scheduledAt: '2026-05-15T10:00' })
      expect(payload).not.toBeNull()
      expect(payload!.candidatureId).toBe(id)
      expect(payload!.stage).toBe('aboro')
      expect(payload!.byUserSlug).toBe('yolan.test')
      expect(payload!.updatedAt).toBeTruthy()
    } finally { off() }
  })
})

describe('PATCH — merge semantics (R3)', () => {
  it('rejects an empty body with 400', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Au moins un champ requis')
  })

  it('preserves prior fields when partial payload arrives', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ scheduledAt: '2026-04-30T14:00', mode: 'visio' })
    await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ conclusion: 'go' })
    const r = await supertest(app).get(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
    expect(r.body.data).toEqual({ scheduledAt: '2026-04-30T14:00', mode: 'visio', conclusion: 'go' })
  })

  it('null in the payload clears the field; other fields stay', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ scheduledAt: '2026-04-30T14:00', mode: 'visio' })
    await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ mode: null })
    const r = await supertest(app).get(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
    expect(r.body.data).toEqual({ scheduledAt: '2026-04-30T14:00' })
  })
})

describe('PATCH — Zod validation', () => {
  it('rejects an invalid datetime shape with 400', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ scheduledAt: 'not-a-datetime' })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid URL on meetLink with 400', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ meetLink: 'not a url' })
    expect(res.status).toBe(400)
  })

  it('rejects unknown fields by ignoring them (Zod strips by default)', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ mode: 'visio', __nope: true })
    expect(res.status).toBe(200)
    const r = await supertest(app).get(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
    expect(r.body.data).toEqual({ mode: 'visio' })
  })
})

describe('PATCH — optimistic lock (R1)', () => {
  it('accepts If-Match matching the current updated_at', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const r1 = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ mode: 'visio' })
    const r2 = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .set('If-Match', r1.body.updatedAt as string)
      .send({ conclusion: 'go' })
    expect(r2.status).toBe(200)
    expect(r2.body.data).toEqual({ mode: 'visio', conclusion: 'go' })
  })

  it('rejects a stale If-Match with 409 + currentUpdatedAt body', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const r1 = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ mode: 'visio' })
    // Sleep enough for `datetime('now')` (second precision) to advance.
    await new Promise(r => setTimeout(r, 1100))
    await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .send({ scheduledAt: '2026-04-30T14:00' })  // server now newer
    const stale = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/stages/entretien_1/data`)
      .set('If-Match', r1.body.updatedAt as string)
      .send({ conclusion: 'go' })
    expect(stale.status).toBe(409)
    expect(stale.body.currentUpdatedAt).toBeTruthy()
    expect(stale.body.currentUpdatedAt).not.toBe(r1.body.updatedAt)
  })
})

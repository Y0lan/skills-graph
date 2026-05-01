import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import supertest from 'supertest'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratings-recalc-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

const mocks = vi.hoisted(() => ({
  recalculateAllCandidatureScores: vi.fn().mockResolvedValue({ reason: 'test', total: 0, scored: 0, failed: [], results: [] }),
  scheduleAllCandidatureScoreRecalculation: vi.fn(),
}))

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('../lib/summary.js', () => ({ generateAndSaveSummary: vi.fn().mockResolvedValue(null) }))
vi.mock('../lib/scoring-helpers.js', () => ({
  recalculateAllCandidatureScores: mocks.recalculateAllCandidatureScores,
  scheduleAllCandidatureScoreRecalculation: mocks.scheduleAllCandidatureScoreRecalculation,
}))
vi.mock('../middleware/require-auth.js', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireOwnership: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')
const { ratingsRouter } = await import('../routes/ratings.js')

function preSeed() {
  const db = new Database(`${TEST_DATABASE_HANDLE}-ratings-recalculation`)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), label TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const insert = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((cat, index) => insert.run(cat, cat, '*', index))
  db.prepare('INSERT INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
    .run('java', 'core-engineering', 'Java', 0)
  db.close()
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/ratings', ratingsRouter)
  return app
}

describe('team rating mutations refresh recruit scores', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })

  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    mocks.recalculateAllCandidatureScores.mockClear()
    mocks.scheduleAllCandidatureScoreRecalculation.mockClear()
  })

  it('PUT /api/ratings/:slug schedules coalesced recalculation without blocking on full rescore', async () => {
    const app = buildApp()
    const res = await supertest(app).put('/api/ratings/yolan-maldonado').send({
      ratings: { java: 4 },
      experience: {},
      skippedCategories: [],
      declinedCategories: [],
    })

    expect(res.status).toBe(200)
    expect(mocks.scheduleAllCandidatureScoreRecalculation).toHaveBeenCalledWith('team-rating-upsert:yolan-maldonado')
    expect(mocks.recalculateAllCandidatureScores).not.toHaveBeenCalled()
  })

  it('POST submit and DELETE reset both schedule coalesced recalculation', async () => {
    const app = buildApp()
    const db = getDb()
    db.prepare(`
      INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories)
      VALUES (?, ?, '{}', '[]', '[]')
      ON CONFLICT (slug) DO UPDATE SET ratings = EXCLUDED.ratings
    `).run('yolan-maldonado', JSON.stringify({ java: 3 }))

    const submit = await supertest(app).post('/api/ratings/yolan-maldonado/submit')
    expect(submit.status).toBe(200)
    expect(mocks.scheduleAllCandidatureScoreRecalculation).toHaveBeenCalledWith('team-rating-submit:yolan-maldonado')
    expect(mocks.recalculateAllCandidatureScores).not.toHaveBeenCalled()

    const reset = await supertest(app).delete('/api/ratings/yolan-maldonado')
    expect(reset.status).toBe(200)
    expect(reset.body).toMatchObject({ ok: true, rescoreScheduled: true })
    expect(mocks.scheduleAllCandidatureScoreRecalculation).toHaveBeenCalledWith('team-rating-delete:yolan-maldonado')
    expect(mocks.recalculateAllCandidatureScores).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unknown-skill-audit-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'
process.env.RECRUITMENT_LEADS = 'audit@test'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))

// Bypass requireLead for the test by stubbing the middleware to a passthrough.
vi.mock('../middleware/require-lead.js', () => ({
  requireLead: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')

function preSeed() {
  const db = new Database(TEST_DATABASE_HANDLE)
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
  const skillIns = db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)')
  skillIns.run('java', 'core-engineering', 'Java', 0)
  skillIns.run('typescript', 'core-engineering', 'TypeScript', 1)
  skillIns.run('postgresql', 'data-engineering-governance', 'PostgreSQL', 0)
  db.close()
}

async function buildApp() {
  const { recruitmentRouter } = await import('../routes/recruitment.js')
  const app = express()
  app.use(express.json())
  app.use('/api/recruitment', recruitmentRouter)
  return app
}

function seedCandidate(name: string, aiSuggestions: Record<string, number> | null): string {
  const cid = crypto.randomUUID()
  getDb().prepare(
    'INSERT INTO candidates (id, name, role, created_by, ai_suggestions) VALUES (?, ?, ?, ?, ?)'
  ).run(cid, name, 'R', 'system', aiSuggestions ? JSON.stringify(aiSuggestions) : null)
  return cid
}

describe('GET /api/recruitment/_audit/unknown-skill-keys', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })
  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty when no candidates have hallucinated keys', async () => {
    seedCandidate('Clean Candidate', { java: 4, typescript: 3 })
    const app = await buildApp()
    const res = await supertest(app).get('/api/recruitment/_audit/unknown-skill-keys')
    expect(res.status).toBe(200)
    expect(res.body.candidatesAffected).toBe(0)
    expect(res.body.candidates).toEqual([])
    expect(res.body.keyFrequency).toEqual({})
  })

  it('lists every candidate with hallucinated keys + per-key frequency', async () => {
    seedCandidate('Pierre LEFEVRE', { java: 4, oracle: 3, postgresql: 2 })
    seedCandidate('Marie DUPONT', { typescript: 3, oracle: 4, kafka: 2 })
    seedCandidate('Jean MARTIN', { oracle: 5 }) // only hallucinated keys

    const app = await buildApp()
    const res = await supertest(app).get('/api/recruitment/_audit/unknown-skill-keys')
    expect(res.status).toBe(200)
    expect(res.body.candidatesAffected).toBe(3)
    expect(res.body.totalUnknownKeys).toBe(2) // oracle + kafka
    expect(res.body.keyFrequency).toEqual({ oracle: 3, kafka: 1 }) // sorted desc
    expect(res.body.candidates).toHaveLength(3)
    const names = res.body.candidates.map((c: { name: string }) => c.name).sort()
    expect(names).toEqual(['Jean MARTIN', 'Marie DUPONT', 'Pierre LEFEVRE'])
    const pierre = res.body.candidates.find((c: { name: string }) => c.name === 'Pierre LEFEVRE')
    expect(pierre.unknownKeys).toEqual(['oracle'])
    const marie = res.body.candidates.find((c: { name: string }) => c.name === 'Marie DUPONT')
    expect(marie.unknownKeys.sort()).toEqual(['kafka', 'oracle'])
  })

  it('skips candidates with null or empty ai_suggestions', async () => {
    seedCandidate('No Extraction', null)
    seedCandidate('Empty Extraction', {})
    const app = await buildApp()
    const res = await supertest(app).get('/api/recruitment/_audit/unknown-skill-keys')
    expect(res.status).toBe(200)
    // Only the candidates with actual hallucinated keys should appear.
    // Candidates seeded earlier in this describe may persist (no per-test
    // cleanup), so we just verify the new ones are absent.
    const names = res.body.candidates.map((c: { name: string }) => c.name)
    expect(names).not.toContain('No Extraction')
    expect(names).not.toContain('Empty Extraction')
  })
})

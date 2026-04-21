import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'candidatures-preview-'))
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

function makeAiProfile() {
  const pf = <T,>(value: T | null) => ({
    value, runId: 'r1', sourceDoc: 'cv' as const, confidence: 0.9, humanLockedAt: null, humanLockedBy: null,
  })
  return {
    identity: { fullName: pf('Pierre LEFEVRE') },
    location: { city: pf('Nouméa'), country: pf('NC'), willingToRelocate: pf(null), remotePreference: pf(null), drivingLicense: pf(null) },
    currentRole: { company: pf('Sinapse'), role: pf('Architecte SI'), isCurrentlyEmployed: pf(true), startedAt: pf('2022') },
    totalExperienceYears: pf(18),
    availability: { noticePeriodDays: pf(30), earliestStart: pf(null) },
  }
}

describe('GET /api/recruitment/candidatures — previewProfile', () => {
  beforeAll(() => {
    preSeed()
    initDatabase()
    // Seed skill catalog for label lookup
    const db = getDb()
    db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)').run('java', 'backend-integration', 'Java', 0)
    db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)').run('spring', 'backend-integration', 'Spring', 1)
    db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)').run('aws', 'platform-engineering', 'AWS', 2)

    // Insert candidate with full ai_profile + ai_suggestions
    db.prepare(`
      INSERT INTO candidates (id, name, role, email, created_by, expires_at, ai_profile, ai_suggestions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'c-pierre', 'Pierre LEFEVRE', 'Architecte SI', 'p@example.com', 'test-lead',
      new Date(Date.now() + 365 * 86400000).toISOString(),
      JSON.stringify(makeAiProfile()),
      JSON.stringify({ java: 4, spring: 4, aws: 3 }),
    )

    // Candidate without profile
    db.prepare(`
      INSERT INTO candidates (id, name, role, email, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'c-empty', 'Jane Doe', 'Dev', 'j@example.com', 'test-lead',
      new Date(Date.now() + 365 * 86400000).toISOString(),
    )

    const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id

    // Candidatures for each
    db.prepare(`
      INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run('cand-pierre', 'c-pierre', posteId, 'postule', 'site')

    db.prepare(`
      INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run('cand-jane', 'c-empty', posteId, 'postule', 'site')
  })
  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns previewProfile populated from ai_profile + ai_suggestions', async () => {
    const app = await buildApp()
    const res = await supertest(app).get('/api/recruitment/candidatures')
    expect(res.status).toBe(200)
    const pierre = (res.body as Array<{ id: string; previewProfile: Record<string, unknown> | null }>)
      .find(c => c.id === 'cand-pierre')
    expect(pierre?.previewProfile).toMatchObject({
      city: 'Nouméa',
      country: 'NC',
      currentRole: 'Architecte SI',
      currentCompany: 'Sinapse',
      totalExperienceYears: 18,
      noticePeriodDays: 30,
    })
    expect(pierre?.previewProfile?.topSkills).toHaveLength(3)
    const topSkills = pierre?.previewProfile?.topSkills as Array<{ skillId: string; skillLabel: string; rating: number }>
    expect(topSkills[0].rating).toBeGreaterThanOrEqual(topSkills[2].rating)
    // Labels are resolved from catalog
    expect(topSkills.map(s => s.skillLabel).sort()).toEqual(['AWS', 'Java', 'Spring'])
  })

  it('returns null previewProfile when candidate has no ai_profile and no suggestions', async () => {
    const app = await buildApp()
    const res = await supertest(app).get('/api/recruitment/candidatures')
    const jane = (res.body as Array<{ id: string; previewProfile: unknown }>)
      .find(c => c.id === 'cand-jane')
    expect(jane?.previewProfile).toBeNull()
  })
})

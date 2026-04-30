import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluate-cv-derived-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
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
  // Seed a handful of skills across categories used below
  const skillIns = db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)')
  skillIns.run('java', 'core-engineering', 'Java', 0)
  skillIns.run('team-management', 'management-leadership', 'Team Management', 0)
  skillIns.run('kubernetes', 'platform-engineering', 'Kubernetes', 0)
  skillIns.run('react', 'frontend-ui', 'React', 0)
  db.close()
}

async function buildApp() {
  const { evaluateRouter } = await import('../routes/evaluate.js')
  const app = express()
  app.use(express.json())
  app.use('/api/evaluate', evaluateRouter)
  return app
}

function seedCandidateWithRole(roleCategories: string[], ai: { suggestions?: Record<string, number>; reasoning?: Record<string, string> } = {}): string {
  const db = getDb()
  const roleId = `role-${crypto.randomUUID()}`
  db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'R', 'system')
  for (const c of roleCategories) {
    db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run(roleId, c)
  }
  const posteId = `poste-${crypto.randomUUID().slice(0, 8)}`
  db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
    VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId, roleId, 'P')
  const candidateId = crypto.randomUUID()
  db.prepare(
    'INSERT INTO candidates (id, name, role, role_id, created_by, ai_suggestions, ai_reasoning) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    candidateId, 'T', 'R', roleId, 'system',
    ai.suggestions ? JSON.stringify(ai.suggestions) : null,
    ai.reasoning ? JSON.stringify(ai.reasoning) : null,
  )
  const cid = crypto.randomUUID()
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)').run(cid, candidateId, posteId, 'postule')
  return candidateId
}

describe('GET /api/evaluate/:id/form — cvDerivedCategories (Phase 6)', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })
  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns categories outside role with evidence, skill rating ≥ 3', async () => {
    const cid = seedCandidateWithRole(
      ['core-engineering'], // role only covers core
      {
        suggestions: { java: 4, 'team-management': 4, kubernetes: 3 },
        reasoning: {
          java: '5 ans de Java en prod',
          'team-management': 'Manager d\'équipe 3 ans',
          kubernetes: 'Déploiement K8s prod',
        },
      },
    )
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.status).toBe(200)
    const ids = (res.body.cvDerivedCategories as Array<{ categoryId: string }>).map(c => c.categoryId).sort()
    expect(ids).toContain('management-leadership')
    expect(ids).toContain('platform-engineering')
    expect(ids).not.toContain('core-engineering') // already in role
  })

  it('excludes categories below the rating floor (< 3)', async () => {
    const cid = seedCandidateWithRole(['core-engineering'], {
      suggestions: { 'team-management': 2 }, // below floor
      reasoning: { 'team-management': 'mentioned once' },
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.body.cvDerivedCategories).toEqual([])
  })

  it('excludes categories with no evidence snippet (evidence gate)', async () => {
    const cid = seedCandidateWithRole(['core-engineering'], {
      suggestions: { 'team-management': 4 },
      reasoning: {}, // no evidence
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.body.cvDerivedCategories).toEqual([])
  })

  it('invariant: skill ids not in catalog do NOT create categories', async () => {
    const cid = seedCandidateWithRole(['core-engineering'], {
      suggestions: { 'invented-skill-id': 5 },
      reasoning: { 'invented-skill-id': 'LLM hallucination' },
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.body.cvDerivedCategories).toEqual([])
  })

  it('top-5 cap is enforced', async () => {
    const db = getDb()
    const skillIns = db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)')
    // Seed extra skills across 6 categories (so 6 candidates for Discovery, top-5 cap cuts one)
    const cats = ['backend-integration', 'observability-reliability', 'security-compliance', 'architecture-governance', 'qa-test-engineering', 'design-ux']
    for (const c of cats) skillIns.run(`test-${c}`, c, `Test ${c}`, 0)

    const cid = seedCandidateWithRole(['core-engineering'], {
      suggestions: Object.fromEntries(cats.map(c => [`test-${c}`, 4])),
      reasoning: Object.fromEntries(cats.map(c => [`test-${c}`, 'evidence'])),
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.body.cvDerivedCategories.length).toBeLessThanOrEqual(5)
  })

  it('empty when candidate has no ai_suggestions', async () => {
    const cid = seedCandidateWithRole(['core-engineering'], {})
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.body.cvDerivedCategories).toEqual([])
  })

  it('existing aiSuggestions + roleCategories fields still present', async () => {
    const cid = seedCandidateWithRole(['core-engineering'], { suggestions: { java: 4 }, reasoning: { java: 'ok' } })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.body.aiSuggestions).toMatchObject({ java: 4 })
    expect(res.body.roleCategories).toContain('core-engineering')
  })

  // Read-time filter on aiSuggestions (oracle drift fix)
  // ----------------------------------------------------
  // Demo bug: legacy candidates have ai_suggestions.oracle = 4 from
  // pre-fix CV extraction. Without the read-time filter, the form
  // page seeds ratings state with "oracle: 4" which then rides
  // invisibly into autosave/submit and gets rejected by
  // validateRatings — leaving the candidate stuck. The form-info
  // endpoint now strips non-catalog keys on read.

  it('aiSuggestions drops non-catalog skill IDs before sending to client', async () => {
    const cid = seedCandidateWithRole(['core-engineering'], {
      suggestions: { java: 4, oracle: 3, react: 2, kafka: 5 }, // oracle + kafka NOT in catalog
      reasoning: { java: 'ok', oracle: 'leaked', react: 'ok', kafka: 'leaked' },
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.status).toBe(200)
    expect(res.body.aiSuggestions).toEqual({ java: 4, react: 2 })
    expect(res.body.aiSuggestions.oracle).toBeUndefined()
    expect(res.body.aiSuggestions.kafka).toBeUndefined()
  })

  it('aiSuggestions is null when DB row has none (preserves existing contract)', async () => {
    const cid = seedCandidateWithRole(['core-engineering'], {})
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.status).toBe(200)
    expect(res.body.aiSuggestions).toBeNull()
  })

  it('aiSuggestions is empty object when DB row has only hallucinated keys', async () => {
    const cid = seedCandidateWithRole(['core-engineering'], {
      suggestions: { oracle: 3, kafka: 4 }, // both hallucinated
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/evaluate/${cid}/form`)
    expect(res.status).toBe(200)
    expect(res.body.aiSuggestions).toEqual({})
  })
})

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'
import express from 'express'
import supertest from 'supertest'

/**
 * Codex post-plan P2 #7 — endpoint-level parity tests.
 *
 * The unit tests in effective-ratings.test.ts prove the Module merges
 * correctly. The bug class this prevents is "wrong columns loaded or
 * omitted on the route side." So we hit the 4 endpoints that switched
 * to the Module and assert the response includes the merged shape,
 * NOT the old either/or or 2-source shape.
 *
 * Each test seeds a candidature with overlapping `{ ai, roleAware,
 * manual }` keys where the merged answer is unambiguously different
 * from any of the previous shapes. If a future refactor regresses
 * one site, the test fails on that site only — locality.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eff-ratings-parity-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))
vi.mock('../middleware/require-lead.js', () => ({
  requireLead: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, { user: { id: 'u1', slug: 'yolan-maldonado', email: 'y@t', name: 'Y' } })
    next()
  },
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
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((c, i) => ins.run(c, c, '*', i))
  // Seed enough skills that compat scoring has something to chew on.
  const skillIns = db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)')
  skillIns.run('java', 'core-engineering', 'Java', 0)
  skillIns.run('typescript', 'core-engineering', 'TypeScript', 1)
  skillIns.run('python', 'core-engineering', 'Python', 2)
  skillIns.run('kubernetes', 'platform-engineering', 'Kubernetes', 0)
  db.close()
}

async function buildApp() {
  const { recruitmentRouter } = await import('../routes/recruitment.js')
  const app = express()
  app.use(express.json())
  app.use('/api/recruitment', recruitmentRouter)
  return app
}

interface SeededCandidature {
  candidateId: string
  candidatureId: string
  posteId: string
  roleId: string
}

function seedCandidature(opts: {
  ai?: Record<string, number>
  roleAware?: Record<string, number>
  manual?: Record<string, number>
  globalScore?: number
} = {}): SeededCandidature {
  const db = getDb()
  const roleId = `role-${crypto.randomUUID().slice(0, 8)}`
  db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'R', 'system')
  const posteId = `poste-${crypto.randomUUID().slice(0, 8)}`
  db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
    VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId, roleId, 'P')
  const candidateId = crypto.randomUUID()
  db.prepare('INSERT INTO candidates (id, name, role, role_id, created_by, ratings, ai_suggestions, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))').run(
    candidateId, 'Test Candidate', 'R', roleId, 'system',
    opts.manual ? JSON.stringify(opts.manual) : '{}',
    opts.ai ? JSON.stringify(opts.ai) : null,
  )
  const candidatureId = crypto.randomUUID()
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut, role_aware_suggestions, taux_global) VALUES (?, ?, ?, ?, ?, ?)').run(
    candidatureId, candidateId, posteId, 'postule',
    opts.roleAware ? JSON.stringify(opts.roleAware) : null,
    opts.globalScore ?? 50,
  )
  return { candidateId, candidatureId, posteId, roleId }
}

beforeAll(async () => {
  preSeed()
  await initDatabase()
})
afterAll(async () => {
  try { await getDb().close() } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('Effective Ratings — endpoint parity', () => {
  it('GET /postes/:posteId/comparison (top-candidates list) returns the 3-source merged ratings', async () => {
    // Pre-fix: this site spread `{ ...ai, ...manual }` with no role-aware.
    // With this seed (roleAware sets java=4, ai sets java=3), the
    // OLD response would have `ratings.java === 3`. The new response
    // must have `ratings.java === 4`.
    const seed = seedCandidature({
      ai: { java: 3, kubernetes: 1 },
      roleAware: { java: 4, typescript: 3 },
      manual: { python: 4 },
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/recruitment/postes/${seed.posteId}/comparison`)
    expect(res.status).toBe(200)
    expect(res.body.candidatures).toHaveLength(1)
    const c = res.body.candidatures[0]
    expect(c.ratings).toEqual({
      java: 4,         // role-aware overrides ai (was missing pre-fix)
      kubernetes: 1,   // ai-only preserved
      typescript: 3,   // role-aware introduces (was missing pre-fix)
      python: 4,       // manual override
    })
  })

  it('GET /candidatures (list with previewProfile) merges all 3 sources for top skills', async () => {
    // Pre-fix buildPreview: roleAware OR baseline (either/or, no manual).
    // Seed where role-aware is non-empty to exercise the OLD bug path:
    // OLD top skills = roleAware only; NEW top skills = full merge so
    // the candidate\'s manual rating shows up.
    const seed = seedCandidature({
      ai: { java: 1 },
      roleAware: { typescript: 5 },
      manual: { python: 5 },          // pre-fix this would never appear
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/recruitment/candidatures?candidateId=${seed.candidateId}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    const preview = res.body[0].previewProfile
    expect(preview).not.toBeNull()
    const topSkillIds = preview.topSkills.map((s: { skillId: string }) => s.skillId).sort()
    // Pre-fix: ['typescript'] (just role-aware; manual dropped, ai dropped)
    // Post-fix: includes manual (python=5) AND role-aware (typescript=5)
    expect(topSkillIds).toContain('python')
    expect(topSkillIds).toContain('typescript')
  })

  it('GET /postes/:posteId/shortlist returns 3-source merged top-3 skills', async () => {
    // Pre-fix: this either-or\'d roleAware vs ai and ignored manual entirely.
    const seed = seedCandidature({
      ai: { java: 1 },
      roleAware: { typescript: 4 },
      manual: { python: 5 },
      globalScore: 80,
    })
    const app = await buildApp()
    const res = await supertest(app).get(`/api/recruitment/postes/${seed.posteId}/shortlist`)
    expect(res.status).toBe(200)
    const item = res.body.items.find((i: { candidatureId: string }) => i.candidatureId === seed.candidatureId)
    expect(item).toBeDefined()
    const topIds = item.top3Skills.map((t: { skillId: string }) => t.skillId)
    // Manual (python:5) MUST appear — pre-fix this entire source was dropped.
    expect(topIds).toContain('python')
    // The 5 wins over the 4 (manual > role-aware > ai)
    expect(item.top3Skills[0].skillId).toBe('python')
    expect(item.top3Skills[0].rating).toBe(5)
  })

  it('POST /reports/cross-poste-comparison EXCLUDES role-aware (cross-poste-baseline mode)', async () => {
    // Cross-poste comparison must not let role-aware (calibrated to
    // the candidature\'s OWN poste) leak into the score against a
    // DIFFERENT target poste. Seed a candidature with role-aware
    // boosting java=5, then compare against a fresh target poste
    // and assert that role-aware did NOT contribute to the resulting
    // ratings field. The ai baseline (java=1) survives because that
    // wasn\'t calibrated to a specific poste.
    const source = seedCandidature({
      ai: { java: 1, python: 2 },
      roleAware: { java: 5 },          // would tilt cross-poste if leaked
      manual: { kubernetes: 3 },
    })
    // Create a separate target poste.
    const db = getDb()
    const targetRoleId = `role-${crypto.randomUUID().slice(0, 8)}`
    db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(targetRoleId, 'TargetR', 'system')
    const targetPosteId = `poste-${crypto.randomUUID().slice(0, 8)}`
    db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
      VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(targetPosteId, targetRoleId, 'TargetPoste')

    const app = await buildApp()
    const res = await supertest(app)
      .post('/api/recruitment/reports/cross-poste-comparison')
      .send({ targetPosteId, candidatureIds: [source.candidatureId] })

    expect(res.status).toBe(200)
    expect(res.body.candidatures).toHaveLength(1)
    const c = res.body.candidatures[0]
    // Role-aware (java=5) MUST NOT appear in the result. AI baseline
    // (java=1, python=2) and manual (kubernetes=3) are merged.
    expect(c.ratings.java).toBe(1)            // ai baseline, not role-aware
    expect(c.ratings.python).toBe(2)          // ai baseline preserved
    expect(c.ratings.kubernetes).toBe(3)      // manual override survives
  })
})

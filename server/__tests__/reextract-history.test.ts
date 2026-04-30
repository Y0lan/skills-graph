import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reextract-history-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

const { mockCreate, mockExtractText } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockExtractText: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic { messages = { create: mockCreate } },
}))
vi.mock('unpdf', () => ({ extractText: mockExtractText }))
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))
vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('../lib/catalog.js', () => ({
  getSkillCategories: vi.fn().mockReturnValue([
    { id: 'core-engineering', label: 'Socle', emoji: '*', skills: [{ id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'N/A', description: 'N/A' }] }] },
  ]),
}))
vi.mock('../middleware/require-lead.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/require-lead.js')>('../middleware/require-lead.js')
  return { ...actual, requireLead: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() }
})

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')
const { startRun, finishRun } = await import('../lib/extraction-runs.js')
const { putAsset } = await import('../lib/asset-storage.js')

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
  db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)').run('java', 'core-engineering', 'Java', 0)
  db.close()
}

async function buildApp() {
  const { recruitmentRouter } = await import('../routes/recruitment.js')
  const app = express()
  app.use(express.json())
  app.use('/api/recruitment', recruitmentRouter)
  return app
}

function seedCandidateWithPoste(): string {
  const db = getDb()
  const candidateId = crypto.randomUUID()
  db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'T', 'T', 'system')
  const posteId = db.prepare("SELECT id FROM postes LIMIT 1").get() as { id: string }
  const cid = crypto.randomUUID()
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)').run(cid, candidateId, posteId.id, 'postule')
  return candidateId
}

function mockToolResponse(ratings: Record<string, number> = { java: 3 }) {
  return {
    content: [{
      type: 'tool_use',
      id: `t-${Math.random()}`,
      name: 'submit_skill_ratings',
      input: {
        suggestions: ratings,
        reasoning: Object.fromEntries(Object.keys(ratings).map(k => [k, `r ${k}`])),
        questions: Object.fromEntries(Object.keys(ratings).map(k => [k, `q ${k}?`])),
      },
    }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function mockProfile() {
  return {
    content: [{
      type: 'tool_use',
      id: 'p-' + Math.random(),
      name: 'submit_candidate_profile',
      input: { identity: { fullName: { value: 'T', sourceDoc: 'cv', confidence: 0.9 } } },
    }],
    usage: { input_tokens: 200, output_tokens: 100 },
  }
}

describe('Phase 8: re-extract + history + diff', () => {
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
    mockExtractText.mockResolvedValue({ text: 'A'.repeat(200) })
  })

  describe('POST /candidates/:id/reextract', () => {
    it('409 when no raw_pdf asset exists', async () => {
      const cid = seedCandidateWithPoste()
      const app = await buildApp()
      const res = await supertest(app).post(`/api/recruitment/candidates/${cid}/reextract`)
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('no-raw-pdf')
    })

    it('happy path: runs pipeline, returns status', async () => {
      const cid = seedCandidateWithPoste()
      await putAsset({ candidateId: cid, kind: 'raw_pdf', buffer: Buffer.from('fake-pdf'), mime: 'application/pdf' })

      mockCreate.mockResolvedValueOnce(mockToolResponse())
      mockCreate.mockResolvedValueOnce(mockProfile())

      const app = await buildApp()
      const res = await supertest(app).post(`/api/recruitment/candidates/${cid}/reextract`)
      expect(res.status).toBe(200)
      expect(['succeeded', 'partial']).toContain(res.body.status)
    })

    it('returns 409 when another extraction is running (CAS lock)', async () => {
      const cid = seedCandidateWithPoste()
      await putAsset({ candidateId: cid, kind: 'raw_pdf', buffer: Buffer.from('fake-pdf'), mime: 'application/pdf' })
      // Manually mark running
      getDb().prepare("UPDATE candidates SET extraction_status = 'running' WHERE id = ?").run(cid)

      const app = await buildApp()
      const res = await supertest(app).post(`/api/recruitment/candidates/${cid}/reextract`)
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('in-flight')
    })
  })

  describe('GET /candidates/:id/extraction-runs', () => {
    it('returns metadata only (no payloads)', async () => {
      const cid = seedCandidateWithPoste()
      const rid = await startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
      await finishRun({ runId: rid, status: 'success', payload: { huge: 'X'.repeat(10000) } })

      const app = await buildApp()
      const res = await supertest(app).get(`/api/recruitment/candidates/${cid}/extraction-runs`)
      expect(res.status).toBe(200)
      expect(res.body.runs).toHaveLength(1)
      expect(res.body.runs[0]).not.toHaveProperty('payload')
      expect(res.body.runs[0].hasPayload).toBe(true)
    })

    it('respects limit param', async () => {
      const cid = seedCandidateWithPoste()
      for (let i = 0; i < 5; i++) {
        const rid = await startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
        await finishRun({ runId: rid, status: 'success', payload: { i } })
      }
      const app = await buildApp()
      const res = await supertest(app).get(`/api/recruitment/candidates/${cid}/extraction-runs?limit=3`)
      expect(res.body.runs).toHaveLength(3)
    })
  })

  describe('GET /extraction-runs/:runId/payload', () => {
    it('returns payload when present', async () => {
      const cid = seedCandidateWithPoste()
      const rid = await startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
      await finishRun({ runId: rid, status: 'success', payload: { ratings: { java: 4 } } })

      const app = await buildApp()
      const res = await supertest(app).get(`/api/recruitment/extraction-runs/${rid}/payload`)
      expect(res.status).toBe(200)
      expect(res.body.payload).toMatchObject({ ratings: { java: 4 } })
    })

    it('410 Gone when payload has been pruned', async () => {
      const cid = seedCandidateWithPoste()
      const rid = await startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
      await finishRun({ runId: rid, status: 'success', payload: { ratings: { java: 4 } } })
      getDb().prepare('UPDATE cv_extraction_runs SET payload = NULL WHERE id = ?').run(rid)

      const app = await buildApp()
      const res = await supertest(app).get(`/api/recruitment/extraction-runs/${rid}/payload`)
      expect(res.status).toBe(410)
      expect(res.body.code).toBe('payload-pruned')
    })

    it('404 for unknown run id', async () => {
      const app = await buildApp()
      const res = await supertest(app).get('/api/recruitment/extraction-runs/does-not-exist/payload')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /extraction-runs/compare', () => {
    it('diffs two skill runs', async () => {
      const cid = seedCandidateWithPoste()
      const r1 = await startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
      await finishRun({ runId: r1, status: 'success', payload: { ratings: { java: 3 } } })
      const r2 = await startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
      await finishRun({ runId: r2, status: 'success', payload: { ratings: { java: 4, python: 3 } } })

      const app = await buildApp()
      const res = await supertest(app).post('/api/recruitment/extraction-runs/compare').send({ runIdA: r1, runIdB: r2 })
      expect(res.status).toBe(200)
      expect(res.body.kind).toBe('skills')
      expect(res.body.diff.added).toContainEqual({ skillId: 'python', rating: 3 })
      expect(res.body.diff.changed).toContainEqual({ skillId: 'java', from: 3, to: 4 })
    })

    it('diffs two profile runs', async () => {
      const cid = seedCandidateWithPoste()
      const r1 = await startRun({ candidateId: cid, kind: 'profile', promptVersion: 2, model: 't' })
      await finishRun({ runId: r1, status: 'success', payload: { identity: { fullName: { value: 'Old Name', humanLockedAt: null } } } })
      const r2 = await startRun({ candidateId: cid, kind: 'profile', promptVersion: 2, model: 't' })
      await finishRun({ runId: r2, status: 'success', payload: { identity: { fullName: { value: 'New Name', humanLockedAt: null } } } })

      const app = await buildApp()
      const res = await supertest(app).post('/api/recruitment/extraction-runs/compare').send({ runIdA: r1, runIdB: r2 })
      expect(res.body.kind).toBe('profile')
      expect(res.body.diff.fieldChanges).toContainEqual({ path: 'identity.fullName', from: 'Old Name', to: 'New Name' })
    })

    it('400 when payload missing body params', async () => {
      const app = await buildApp()
      const res = await supertest(app).post('/api/recruitment/extraction-runs/compare').send({})
      expect(res.status).toBe(400)
    })
  })
})

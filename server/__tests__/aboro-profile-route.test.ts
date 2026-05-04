import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import express from 'express'
import supertest from 'supertest'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aboro-profile-route-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('../middleware/require-lead.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/require-lead.js')>('../middleware/require-lead.js')
  return { ...actual, requireLead: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() }
})
vi.mock('express-rate-limit', () => ({
  default: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  rateLimit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')

function preSeed(): void {
  const db = new Database(TEST_DATABASE_HANDLE)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((c, i) => ins.run(c, c, '*', i))
  db.close()
}

async function buildApp(): Promise<express.Express> {
  const { recruitmentRouter } = await import('../routes/recruitment.js')
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as unknown as { user: { slug: string; role: string; email: string } }).user = {
      slug: 'yolan.test',
      role: 'lead',
      email: 'yolan@test.local',
    }
    next()
  })
  app.use('/api/recruitment', recruitmentRouter)
  return app
}

const traits = {
  leadership: { ascendant: 7, conviction: 7, sociabilite: 7, diplomatie: 7 },
  prise_en_compte: { implication: 7, ouverture: 7, critique: 7, consultation: 7 },
  creativite: { taches_variees: 7, abstraction: 7, inventivite: 7, changement: 7 },
  rigueur: { methode: 7, details: 7, perseverance: 7, initiative: 7 },
  equilibre: { detente: 7, positivite: 7, controle: 7, stabilite: 7 },
}

function seedCandidate(): { candidateId: string; candidatureId: string; posteId: string } {
  const db = getDb()
  const candidateId = crypto.randomUUID()
  const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
  const candidatureId = crypto.randomUUID()
  db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)')
    .run(candidateId, 'Camille Aboro', 'Dev', 'yolan.test')
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut, taux_compatibilite_poste, taux_compatibilite_equipe) VALUES (?, ?, ?, ?, ?, ?)')
    .run(candidatureId, candidateId, posteId, 'aboro', 80, 60)
  return { candidateId, candidatureId, posteId }
}

beforeAll(async () => {
  preSeed()
  await initDatabase()
})

afterAll(async () => {
  try { await getDb().close() } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('Aboro profile routes', () => {
  it('awaits and returns the stored profile with score metadata', async () => {
    const { candidateId, candidatureId } = seedCandidate()
    const docId = crypto.randomUUID()
    getDb().prepare('INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by, display_filename) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(docId, candidatureId, 'aboro', 'swipe.pdf', `${tmpDir}/swipe.pdf`, 'yolan.test', 'SWIPE_CAMILLE.pdf')
    getDb().prepare('INSERT INTO aboro_profiles (id, candidate_id, profile_json, source_document_id, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), candidateId, JSON.stringify({ traits, talent_cloud: {}, talents: [], axes_developpement: [] }), docId, 'yolan.test')

    const app = await buildApp()
    const res = await supertest(app).get(`/api/recruitment/candidates/${candidateId}/aboro`)

    expect(res.status).toBe(200)
    expect(res.body.profile.traits.leadership.ascendant).toBe(7)
    expect(res.body.source).toBe('pdf')
    expect(res.body.sourceDocumentName).toBe('SWIPE_CAMILLE.pdf')
    expect(res.body.softSkillScore).toBe(70)
  })

  it('awaits manual save and returns the saved profile plus soft score', async () => {
    const { candidateId } = seedCandidate()
    const app = await buildApp()

    const res = await supertest(app)
      .post(`/api/recruitment/candidates/${candidateId}/aboro/manual`)
      .send({ traits })

    expect(res.status).toBe(200)
    expect(res.body.profile.traits.creativite.changement).toBe(7)
    expect(res.body.softSkillScore).toBe(70)

    const row = getDb().prepare('SELECT taux_soft_skills FROM candidatures WHERE candidate_id = ?').get(candidateId) as { taux_soft_skills: number }
    expect(row.taux_soft_skills).toBe(70)
  })
})

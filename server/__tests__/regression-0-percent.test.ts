import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

// Regression guard for the Pierre LEFEVRE 0% bug:
//   When a candidate is created via the direct-upload path with a CV, the
//   candidature MUST have non-null taux_compatibilite_* scores after
//   processCvForCandidate returns 'succeeded'. A "succeeded" status that
//   leaves scores null (or that leaves them at a fake 0) is a regression.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regression-0pct-'))
process.env.DATA_DIR = tmpDir

const { mockCreate, mockExtractText } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockExtractText: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic { messages = { create: mockCreate } },
}))
vi.mock('unpdf', () => ({ extractText: mockExtractText }))
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }))
vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('../lib/catalog.js', () => ({
  getSkillCategories: vi.fn().mockReturnValue([
    {
      id: 'core-engineering',
      label: 'Socle Technique',
      emoji: '*',
      skills: [
        { id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'N/A', description: 'N/A' }] },
      ],
    },
  ]),
}))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')
const { processCvForCandidate } = await import('../lib/cv-pipeline.js')

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

describe('Pierre LEFEVRE 0% bug regression', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })
  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('CV upload path: non-null taux_* after pipeline marks succeeded', async () => {
    const db = getDb()
    const roleId = 'role-lefevre'
    const posteId = 'poste-lefevre'
    const candidateId = crypto.randomUUID()
    const candidatureId = crypto.randomUUID()

    db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'Test', 'system')
    db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run(roleId, 'core-engineering')
    db.prepare(`INSERT OR IGNORE INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
      VALUES (?, ?, 'Pierre Poste', 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId, roleId)
    db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Pierre LEFEVRE', 'Test', 'system')
    db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)').run(candidatureId, candidateId, posteId, 'postule')

    mockExtractText.mockResolvedValue({ text: 'CV de Pierre LEFEVRE — '.repeat(20) })
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        id: 'call-1',
        name: 'submit_skill_ratings',
        input: {
          suggestions: { java: 4 },
          reasoning: { java: '5 ans de Java en prod = L4' },
          questions: { java: 'Décrivez votre dernière optim JVM.' },
        },
      }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        id: 'profile-1',
        name: 'submit_candidate_profile',
        input: {
          identity: { fullName: { value: 'Pierre LEFEVRE', sourceDoc: 'cv', confidence: 0.95 } },
        },
      }],
      usage: { input_tokens: 200, output_tokens: 100 },
    })

    const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))
    expect(result.status).toBe('succeeded')

    const cand = db.prepare('SELECT taux_compatibilite_poste, taux_compatibilite_equipe, taux_global FROM candidatures WHERE id = ?').get(candidatureId) as { taux_compatibilite_poste: number | null; taux_compatibilite_equipe: number | null; taux_global: number | null }

    // The bug: these were null after CV upload. Guard must prevent return of null.
    expect(cand.taux_compatibilite_poste).not.toBeNull()
    expect(cand.taux_compatibilite_equipe).not.toBeNull()
    expect(cand.taux_global).not.toBeNull()

    const candidate = db.prepare('SELECT extraction_status, ai_suggestions FROM candidates WHERE id = ?').get(candidateId) as { extraction_status: string; ai_suggestions: string }
    expect(candidate.extraction_status).toBe('succeeded')
    expect(JSON.parse(candidate.ai_suggestions)).toMatchObject({ java: 4 })
  })
})

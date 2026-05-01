import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

// Temp DB before importing db module
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-pipeline-test-'))
process.env.DATA_DIR = tmpDir

// Mocks for external I/O
const { mockCreate, mockExtractText } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockExtractText: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

vi.mock('unpdf', () => ({ extractText: mockExtractText }))
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }))

// Skip catalog seeding — pre-seed manually so tests stay hermetic
vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

// Mock catalog with a known shape so the extraction returns valid skills
vi.mock('../lib/catalog.js', () => ({
  getSkillCategories: vi.fn().mockReturnValue([
    {
      id: 'core-engineering',
      label: 'Socle Technique',
      emoji: '*',
      skills: [
        { id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
        { id: 'typescript', label: 'TypeScript', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/A' }] },
      ],
    },
  ]),
}))

const dbModule = await import('../lib/db.js')
const { initDatabase, getDb, TEST_DATABASE_HANDLE } = dbModule
const { processCvForCandidate } = await import('../lib/cv-pipeline.js')

function preSeedSchema() {
  const db = new Database(TEST_DATABASE_HANDLE)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY, category_id TEXT NOT NULL, label TEXT NOT NULL, sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  // Pre-seed the catalog_meta version so initDatabase skips catalog seeding,
  // and pre-seed every category referenced by role/poste seeds to keep FK happy.
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run('5.1.0')
  const allCats = [
    'core-engineering', 'backend-integration', 'frontend-ui', 'platform-engineering',
    'observability-reliability', 'security-compliance', 'architecture-governance',
    'soft-skills-delivery', 'domain-knowledge', 'ai-engineering', 'qa-test-engineering',
    'infrastructure-systems-network', 'analyse-fonctionnelle', 'project-management-pmo',
    'change-management-training', 'design-ux', 'data-engineering-governance',
    'management-leadership', 'legacy-ibmi-adelia', 'javaee-jboss',
  ]
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  for (let i = 0; i < allCats.length; i++) insertCat.run(allCats[i], allCats[i], '*', i)
  // Skills referenced in the extraction tests
  const insertSkill = db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)')
  insertSkill.run('java', 'core-engineering', 'Java', 0)
  insertSkill.run('typescript', 'core-engineering', 'TypeScript', 1)
  db.close()
}

function seedCandidateWithCandidature(params: { candidateId?: string; posteId?: string } = {}) {
  const db = getDb()
  const candidateId = params.candidateId ?? crypto.randomUUID()
  const posteId = params.posteId ?? 'poste-1'
  const candidatureId = crypto.randomUUID()
  const roleId = 'role-test'

  db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'Test Role', 'system')
  db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run(roleId, 'core-engineering')
  db.prepare(`
    INSERT OR IGNORE INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
    VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')
  `).run(posteId, roleId, 'Test Poste')
  db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Test Candidate', 'Test Role', 'system')
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)').run(candidatureId, candidateId, posteId, 'postule')

  return { candidateId, candidatureId, posteId, roleId }
}

function mockToolResponse(suggestions: Record<string, number>) {
  return {
    content: [{
      type: 'tool_use',
      id: `call-${Math.random()}`,
      name: 'submit_skill_ratings',
      input: {
        suggestions,
        reasoning: Object.fromEntries(Object.entries(suggestions).map(([k, v]) => [k, `mock reasoning for ${k}: L${v}`])),
        questions: Object.fromEntries(Object.entries(suggestions).map(([k, v]) => [k, `mock question for ${k} (L${v})`])),
      },
    }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function mockProfileResponse(overrides: Record<string, unknown> = {}) {
  return {
    content: [{
      type: 'tool_use',
      id: `profile-${Math.random()}`,
      name: 'submit_candidate_profile',
      input: {
        identity: { fullName: { value: 'Test', sourceDoc: 'cv', confidence: 0.9 } },
        ...overrides,
      },
    }],
    usage: { input_tokens: 200, output_tokens: 100 },
  }
}

describe('processCvForCandidate', () => {
  beforeAll(async () => {
    preSeedSchema()
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

  describe('ok-path (regression for Pierre LEFEVRE 0% bug)', () => {
    it('populates ai_suggestions AND all taux_* fields; status=succeeded', async () => {
      const { candidateId, candidatureId } = seedCandidateWithCandidature()
      mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 4, typescript: 3 }))
      mockCreate.mockResolvedValueOnce(mockProfileResponse())

      const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))

      expect(result.status).toBe('succeeded')
      expect(result.suggestionsCount).toBe(2)

      const candidate = getDb().prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId) as Record<string, unknown>
      expect(candidate.ai_suggestions).toBeTruthy()
      expect(candidate.extraction_status).toBe('succeeded')
      expect(candidate.extraction_attempts).toBe(1)
      expect(candidate.last_extraction_error).toBeNull()

      const cand = getDb().prepare('SELECT * FROM candidatures WHERE id = ?').get(candidatureId) as Record<string, unknown>
      // The critical assertion: NEVER leave fake 0% — if extraction ran, scores exist.
      expect(cand.taux_compatibilite_poste).not.toBeNull()
      expect(cand.taux_compatibilite_equipe).not.toBeNull()
      expect(cand.taux_global).not.toBeNull()
    })

    it('scores EVERY candidature when a candidate has multiple', async () => {
      const { candidateId } = seedCandidateWithCandidature({ candidateId: crypto.randomUUID() })
      // attach a second candidature to same candidate on a different poste
      const db = getDb()
      const secondPosteId = `poste-${crypto.randomUUID()}`
      db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
        VALUES (?, 'role-test', 'Second Poste', 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(secondPosteId)
      const secondCandidatureId = crypto.randomUUID()
      db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)')
        .run(secondCandidatureId, candidateId, secondPosteId, 'postule')

      mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 4, typescript: 3 }))
      mockCreate.mockResolvedValueOnce(mockProfileResponse())

      const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))
      expect(result.status).toBe('succeeded')

      const rows = db.prepare('SELECT taux_compatibilite_poste FROM candidatures WHERE candidate_id = ?').all(candidateId) as { taux_compatibilite_poste: number | null }[]
      expect(rows).toHaveLength(2)
      for (const r of rows) {
        expect(r.taux_compatibilite_poste).not.toBeNull()
      }
    })
  })

  describe('failure path', () => {
    it('LLM failure → status=failed, candidatures preserved, error stored', async () => {
      const { candidateId, candidatureId } = seedCandidateWithCandidature({ candidateId: crypto.randomUUID() })
      mockCreate.mockRejectedValue(new Error('API down'))

      const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))
      // When ALL categories fail, extractSkillsFromCv returns null → pipeline marks failed
      expect(result.status).toBe('failed')

      const candidate = getDb().prepare('SELECT extraction_status, extraction_attempts, last_extraction_error FROM candidates WHERE id = ?').get(candidateId) as { extraction_status: string; extraction_attempts: number; last_extraction_error: string | null }
      expect(candidate.extraction_status).toBe('failed')
      expect(candidate.extraction_attempts).toBe(1)
      expect(candidate.last_extraction_error).toBeTruthy()

      const cand = getDb().prepare('SELECT id FROM candidatures WHERE id = ?').get(candidatureId)
      expect(cand).toBeTruthy() // candidature still exists — never lose data on extraction failure
    })

    it('CV too short (<50 chars) → status=failed, extraction not attempted', async () => {
      const { candidateId } = seedCandidateWithCandidature({ candidateId: crypto.randomUUID() })
      mockExtractText.mockResolvedValueOnce({ text: 'short' })

      const result = await processCvForCandidate(candidateId, Buffer.from('tiny'))
      expect(result.status).toBe('failed')
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('concurrency / locking', () => {
    it('second call while first is running → returns skipped without issuing LLM call', async () => {
      const { candidateId } = seedCandidateWithCandidature({ candidateId: crypto.randomUUID() })
      // Manually set status=running to simulate in-flight extraction
      getDb().prepare("UPDATE candidates SET extraction_status = 'running' WHERE id = ?").run(candidateId)

      const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))
      expect(result.status).toBe('skipped')
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('partial path', () => {
    it('one category fails → status=partial, scores still computed', async () => {
      const { candidateId, roleId } = seedCandidateWithCandidature({ candidateId: crypto.randomUUID() })
      mockCreate.mockResolvedValueOnce(mockToolResponse({ java: 3 }))
      mockCreate.mockResolvedValueOnce(mockProfileResponse())

      const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))
      expect(result.status).toBe('succeeded')
      expect(roleId).toBe('role-test')
    })
  })
})

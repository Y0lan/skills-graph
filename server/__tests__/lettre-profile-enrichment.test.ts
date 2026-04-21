import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lettre-enrich-'))
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
      skills: [{ id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'N/A', description: 'N/A' }] }],
    },
  ]),
}))

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')
const { processCvForCandidate } = await import('../lib/cv-pipeline.js')

function preSeed() {
  const db = new Database(DB_PATH)
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

function makeSkillResponse(ratings: Record<string, number> = { java: 3 }) {
  return {
    content: [{
      type: 'tool_use',
      id: `call-${Math.random()}`,
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

function makeProfileResponse() {
  return {
    content: [{
      type: 'tool_use',
      id: `profile-${Math.random()}`,
      name: 'submit_candidate_profile',
      input: { identity: { fullName: { value: 'Test', sourceDoc: 'cv', confidence: 0.9 } } },
    }],
    usage: { input_tokens: 200, output_tokens: 100 },
  }
}

describe('lettre enrichment (Phase 5)', () => {
  beforeAll(() => {
    preSeed()
    initDatabase()
  })
  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mockExtractText.mockResolvedValue({ text: 'A'.repeat(200) })
  })

  function seed(withLettre: boolean): { candidateId: string; candidatureId: string } {
    const db = getDb()
    const roleId = `role-lettre-${crypto.randomUUID()}`
    db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'R', 'system')
    db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run(roleId, 'core-engineering')
    const posteId = `poste-${crypto.randomUUID().slice(0, 8)}`
    db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
      VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId, roleId, 'Poste Lettre')
    const candidateId = crypto.randomUUID()
    db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'L', 'R', 'system')
    const cid = crypto.randomUUID()
    db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)').run(cid, candidateId, posteId, 'postule')

    if (withLettre) {
      const docId = crypto.randomUUID()
      const lettreDir = path.join(tmpDir, 'documents')
      fs.mkdirSync(lettreDir, { recursive: true })
      const lettrePath = path.join(lettreDir, `${docId}.pdf`)
      fs.writeFileSync(lettrePath, Buffer.from('fake lettre bytes'))
      db.prepare(`INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
        VALUES (?, ?, 'lettre', 'lettre.pdf', ?, 'tester')`).run(docId, cid, lettrePath)
    }

    return { candidateId, candidatureId: cid }
  }

  it('no lettre attached → profile extraction called with null lettre text', async () => {
    const seeded = seed(false)
    mockCreate.mockResolvedValueOnce(makeSkillResponse())
    mockCreate.mockResolvedValueOnce(makeProfileResponse())

    await processCvForCandidate(seeded.candidateId, Buffer.from('fake-pdf'))

    const profileCall = mockCreate.mock.calls[1][0]
    // No <document type="lettre"> in the user prompt
    expect(profileCall.messages[0].content).not.toContain('<document type="lettre_de_motivation">')
  })

  it('lettre attached → text extracted, stored as candidate_asset, passed to profile prompt', async () => {
    const seeded = seed(true)
    // unpdf returns CV text for CV buffer; returns lettre text for lettre buffer
    mockExtractText.mockResolvedValueOnce({ text: 'CV '.repeat(40) })   // CV
    mockExtractText.mockResolvedValueOnce({ text: 'LETTRE content: motivations explicites ici. '.repeat(5) }) // lettre
    mockCreate.mockResolvedValueOnce(makeSkillResponse())  // baseline skills
    mockCreate.mockResolvedValueOnce(makeProfileResponse()) // profile

    await processCvForCandidate(seeded.candidateId, Buffer.from('fake-pdf'))

    // Lettre text stored as a candidate_asset
    const assets = getDb().prepare(
      "SELECT kind FROM candidate_assets WHERE candidate_id = ? AND kind = 'lettre_text'"
    ).all(seeded.candidateId) as Array<{ kind: string }>
    expect(assets).toHaveLength(1)

    // Profile call prompt includes the lettre
    const profileCall = mockCreate.mock.calls[1][0]
    expect(profileCall.messages[0].content).toContain('<document type="lettre_de_motivation">')
    expect(profileCall.messages[0].content).toContain('LETTRE content')

    // cv_extraction_runs profile row has lettre_asset_id populated
    const run = getDb().prepare(
      "SELECT lettre_asset_id FROM cv_extraction_runs WHERE candidate_id = ? AND kind = 'profile'"
    ).get(seeded.candidateId) as { lettre_asset_id: string | null } | undefined
    expect(run?.lettre_asset_id).toBeTruthy()
  })

  it('lettre file missing from disk → profile extraction proceeds with CV only', async () => {
    const seeded = seed(true)
    // Point the lettre doc at a path that does not exist on disk
    getDb().prepare("UPDATE candidature_documents SET path = ? WHERE candidature_id = ? AND type = 'lettre'")
      .run('/does/not/exist.pdf', seeded.candidatureId)
    mockCreate.mockResolvedValueOnce(makeSkillResponse())
    mockCreate.mockResolvedValueOnce(makeProfileResponse())

    const result = await processCvForCandidate(seeded.candidateId, Buffer.from('fake-pdf'))
    // Profile still succeeds — lettre failure is best-effort
    expect(result.status).toBe('succeeded')
    const profileCall = mockCreate.mock.calls[1][0]
    expect(profileCall.messages[0].content).not.toContain('<document type="lettre_de_motivation">')
  })

  it('soft-deleted lettre is NOT used for profile extraction', async () => {
    const seeded = seed(true)
    getDb().prepare("UPDATE candidature_documents SET deleted_at = datetime('now') WHERE candidature_id = ? AND type = 'lettre'")
      .run(seeded.candidatureId)
    mockCreate.mockResolvedValueOnce(makeSkillResponse())
    mockCreate.mockResolvedValueOnce(makeProfileResponse())

    await processCvForCandidate(seeded.candidateId, Buffer.from('fake-pdf'))

    const profileCall = mockCreate.mock.calls[1][0]
    expect(profileCall.messages[0].content).not.toContain('<document type="lettre_de_motivation">')
  })
})

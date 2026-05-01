import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-e2e-'))
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
    { id: 'core-engineering', label: 'Socle', emoji: '*', skills: [
      { id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'N/A', description: 'N/A' }] },
      { id: 'python', label: 'Python', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'N/A', description: 'N/A' }] },
    ] },
    { id: 'management-leadership', label: 'Mgmt', emoji: '*', skills: [
      { id: 'team-management', label: 'Team Management', categoryId: 'management-leadership', descriptors: [{ level: 0, label: 'N/A', description: 'N/A' }] },
    ] },
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
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((c, i) => ins.run(c, c, '*', i))
  const skillIns = db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)')
  skillIns.run('java', 'core-engineering', 'Java', 0)
  skillIns.run('python', 'core-engineering', 'Python', 1)
  skillIns.run('team-management', 'management-leadership', 'Team Management', 0)
  db.close()
}

function mockSkills(ratings: Record<string, number>) {
  return {
    content: [{
      type: 'tool_use',
      id: `call-${Math.random()}`,
      name: 'submit_skill_ratings',
      input: {
        suggestions: ratings,
        reasoning: Object.fromEntries(Object.keys(ratings).map(k => [k, `evidence for ${k}`])),
        questions: Object.fromEntries(Object.keys(ratings).map(k => [k, `verify ${k}?`])),
      },
    }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function mockProfile(identity = 'Jean Dupont', contactPhone = '+33612345678') {
  return {
    content: [{
      type: 'tool_use',
      id: 'profile-' + Math.random(),
      name: 'submit_candidate_profile',
      input: {
        identity: { fullName: { value: identity, sourceDoc: 'cv', confidence: 0.95 } },
        contact: {
          phone: { value: contactPhone, sourceDoc: 'cv', confidence: 0.9 },
          email: { value: 'jean.dupont@example.com', sourceDoc: 'cv', confidence: 0.95 },
        },
      },
    }],
    usage: { input_tokens: 200, output_tokens: 100 },
  }
}

function mockCritique() {
  return {
    content: [{ type: 'tool_use', id: 'c', name: 'submit_critique', input: { issues: [], additions: [] } }],
    usage: { input_tokens: 300, output_tokens: 20 },
  }
}

describe('CV Intelligence — end-to-end integration', () => {
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
    mockExtractText.mockResolvedValue({ text: 'Jean Dupont — CV exemple — '.repeat(20) })
  })

  function seedCandidateWithCandidature(withFiche: boolean): { candidateId: string; candidatureId: string; posteId: string } {
    const db = getDb()
    const roleId = `role-e2e-${crypto.randomUUID()}`
    db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'R', 'system')
    db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run(roleId, 'core-engineering')
    const posteId = `poste-e2e-${crypto.randomUUID().slice(0, 8)}`
    db.prepare(`INSERT INTO postes (id, role_id, titre, description, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
      VALUES (?, ?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(
      posteId, roleId, 'Java Dev',
      withFiche ? 'Mission : dev Java senior. Profil : 5+ ans.' : null,
    )
    const candidateId = crypto.randomUUID()
    db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Jean Dupont', 'R', 'system')
    const cid = crypto.randomUUID()
    db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)').run(cid, candidateId, posteId, 'postule')
    return { candidateId, candidatureId: cid, posteId }
  }

  it('single-candidature happy path: all phases ran, status=succeeded, scores non-null, profile populated, runs logged', async () => {
    const { candidateId, candidatureId } = seedCandidateWithCandidature(true)

    // Pipeline order: baseline → multipass critique (triggered at ≥3 skills) → profile → role-aware
    mockCreate.mockResolvedValueOnce(mockSkills({ java: 4, python: 3 }))   // baseline cat1
    mockCreate.mockResolvedValueOnce(mockSkills({ 'team-management': 4 })) // baseline cat2 — 3 skills total → triggers multipass
    mockCreate.mockResolvedValueOnce(mockCritique())                       // critique (no issues → reconcile skipped)
    mockCreate.mockResolvedValueOnce(mockProfile())                        // profile
    mockCreate.mockResolvedValueOnce(mockSkills({ java: 4, python: 3 }))   // role-aware cat1
    mockCreate.mockResolvedValueOnce(mockSkills({ 'team-management': 4 })) // role-aware cat2

    const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))
    expect(result.status).toBe('succeeded')

    const db = getDb()
    const cand = db.prepare('SELECT extraction_status, ai_suggestions, ai_profile FROM candidates WHERE id = ?').get(candidateId) as { extraction_status: string; ai_suggestions: string; ai_profile: string }
    expect(cand.extraction_status).toBe('succeeded')
    expect(JSON.parse(cand.ai_suggestions)).toMatchObject({ java: 4, python: 3, 'team-management': 4 })
    expect(JSON.parse(cand.ai_profile).identity.fullName.value).toBe('Jean Dupont')

    const candidature = db.prepare('SELECT taux_compatibilite_poste, taux_compatibilite_equipe, taux_global, role_aware_suggestions FROM candidatures WHERE id = ?').get(candidatureId) as { taux_compatibilite_poste: number; taux_compatibilite_equipe: number; taux_global: number; role_aware_suggestions: string }
    expect(candidature.taux_compatibilite_poste).not.toBeNull()
    expect(candidature.taux_compatibilite_equipe).not.toBeNull()
    expect(candidature.taux_global).not.toBeNull()
    expect(candidature.role_aware_suggestions).toBeTruthy()

    const runKinds = (db.prepare("SELECT DISTINCT kind FROM cv_extraction_runs WHERE candidate_id = ? ORDER BY kind").all(candidateId) as Array<{ kind: string }>).map(r => r.kind)
    expect(runKinds).toContain('skills_baseline')
    expect(runKinds).toContain('profile')
    expect(runKinds).toContain('critique')
    expect(runKinds).toContain('skills_role_aware')

    const assets = db.prepare("SELECT kind FROM candidate_assets WHERE candidate_id = ?").all(candidateId) as Array<{ kind: string }>
    const assetKinds = assets.map(a => a.kind).sort()
    expect(assetKinds).toContain('cv_text')
    expect(assetKinds).toContain('raw_pdf')
  })

  it('multi-poste: distinct scores per candidature, single profile run', async () => {
    const db = getDb()
    const { candidateId, candidatureId: c1 } = seedCandidateWithCandidature(true)
    // Add second candidature on a different poste with a different fiche
    const roleId = `role-e2e-${crypto.randomUUID()}`
    db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'R2', 'system')
    db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run(roleId, 'management-leadership')
    const posteId2 = `poste-e2e-${crypto.randomUUID().slice(0, 8)}`
    db.prepare(`INSERT INTO postes (id, role_id, titre, description, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
      VALUES (?, ?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId2, roleId, 'Manager', 'Manager mission distincte')
    const c2 = crypto.randomUUID()
    db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)').run(c2, candidateId, posteId2, 'postule')

    mockCreate.mockResolvedValueOnce(mockSkills({ java: 4, python: 3 })) // baseline cat1
    mockCreate.mockResolvedValueOnce(mockSkills({ 'team-management': 4 })) // baseline cat2
    mockCreate.mockResolvedValueOnce(mockCritique()) // critique
    mockCreate.mockResolvedValueOnce(mockProfile()) // profile
    // Role-aware for candidature 1 (Java poste)
    mockCreate.mockResolvedValueOnce(mockSkills({ java: 5, python: 3 }))
    mockCreate.mockResolvedValueOnce(mockSkills({ 'team-management': 3 }))
    // Role-aware for candidature 2 (Manager poste)
    mockCreate.mockResolvedValueOnce(mockSkills({ java: 3, python: 2 }))
    mockCreate.mockResolvedValueOnce(mockSkills({ 'team-management': 5 }))

    const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))
    expect(result.status).toBe('succeeded')

    const c1Row = db.prepare('SELECT role_aware_suggestions, taux_global FROM candidatures WHERE id = ?').get(c1) as { role_aware_suggestions: string; taux_global: number }
    const c2Row = db.prepare('SELECT role_aware_suggestions, taux_global FROM candidatures WHERE id = ?').get(c2) as { role_aware_suggestions: string; taux_global: number }
    const c1Skills = JSON.parse(c1Row.role_aware_suggestions) as Record<string, number>
    const c2Skills = JSON.parse(c2Row.role_aware_suggestions) as Record<string, number>
    expect(c1Skills.java).toBe(5)
    expect(c2Skills['team-management']).toBe(5)
    // Distinct scores per candidature proves role-awareness is working
    expect(c1Row.taux_global).not.toBe(c2Row.taux_global)

    // One profile run total, not two
    const profileRuns = db.prepare("SELECT COUNT(*) as n FROM cv_extraction_runs WHERE candidate_id = ? AND kind = 'profile'").get(candidateId) as { n: number }
    expect(profileRuns.n).toBe(1)
  })

  it('fallback: candidature without fiche uses baseline, not role-aware', async () => {
    const { candidateId, candidatureId } = seedCandidateWithCandidature(false)
    mockCreate.mockResolvedValueOnce(mockSkills({ java: 4, python: 3 })) // baseline cat1
    mockCreate.mockResolvedValueOnce(mockSkills({ 'team-management': 4 })) // baseline cat2
    mockCreate.mockResolvedValueOnce(mockCritique()) // critique
    mockCreate.mockResolvedValueOnce(mockProfile()) // profile
    // NO role-aware calls expected — no fiche

    const result = await processCvForCandidate(candidateId, Buffer.from('fake-pdf'))
    expect(result.status).toBe('succeeded')

    const cand = getDb().prepare('SELECT role_aware_suggestions FROM candidatures WHERE id = ?').get(candidatureId) as { role_aware_suggestions: string | null }
    expect(cand.role_aware_suggestions).toBeNull()

    const roleAwareRuns = getDb().prepare("SELECT COUNT(*) as n FROM cv_extraction_runs WHERE candidate_id = ? AND kind = 'skills_role_aware'").get(candidateId) as { n: number }
    expect(roleAwareRuns.n).toBe(0)
  })
})

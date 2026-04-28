import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-multipass-'))
process.env.DATA_DIR = tmpDir

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic { messages = { create: mockCreate } },
}))
vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')
const { runMultipass } = await import('../lib/cv-multipass.js')

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

/**
 * Seed the `skills` table with the test catalog. Must run AFTER
 * initDatabase() (which creates the schema via CREATE TABLE IF NOT
 * EXISTS) so we don\'t fight the canonical column order. java/
 * typescript/python are the catalog-valid IDs the tests reference;
 * anything else (oracle, kafka, …) is treated as a hallucination by
 * filterValidRatings, which is the multipass reconcile drift fix.
 */
function seedSkills() {
  const db = getDb()
  const insSkill = db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)')
  ;[['java', 'Java'], ['typescript', 'TypeScript'], ['python', 'Python']].forEach(([id, label], i) => {
    insSkill.run(id, 'core-engineering', label, i)
  })
}

function seedCandidate(): string {
  const cid = crypto.randomUUID()
  getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(cid, 'T', 'T', 'system')
  return cid
}

function mockCritique(payload: { issues: Array<unknown>; additions: Array<unknown> }) {
  return {
    content: [{
      type: 'tool_use',
      id: 'c',
      name: 'submit_critique',
      input: payload,
    }],
    usage: { input_tokens: 300, output_tokens: 100 },
  }
}

function mockReconcile(payload: { ratings: Record<string, number>; reasoning: Record<string, string>; questions: Record<string, string> }) {
  return {
    content: [{
      type: 'tool_use',
      id: 'r',
      name: 'submit_final',
      input: payload,
    }],
    usage: { input_tokens: 400, output_tokens: 200 },
  }
}

describe('runMultipass', () => {
  beforeAll(() => {
    preSeed()
    initDatabase()
    seedSkills()
  })
  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
  beforeEach(() => vi.clearAllMocks())

  it('critique identifies missed skill → reconcile includes it', async () => {
    mockCreate.mockResolvedValueOnce(mockCritique({
      issues: [],
      additions: [{ skillId: 'python', suggestedRating: 3, evidence: 'mentioned Python prod' }],
    }))
    mockCreate.mockResolvedValueOnce(mockReconcile({
      ratings: { java: 4, python: 3 },
      reasoning: { java: 'original', python: 'added by reconcile' },
      questions: { java: 'q1?', python: 'q2?' },
    }))

    const result = await runMultipass({
      candidateId: seedCandidate(),
      cvText: 'A'.repeat(200),
      baseline: { ratings: { java: 4 }, reasoning: { java: 'original' }, questions: { java: 'q1?' } },
    })

    expect(result).not.toBeNull()
    expect(result!.ratings.python).toBe(3)
    expect(result!.critiqueIssues).toBe(0)
    expect(result!.reconcileAdded).toBe(1)
  })

  it('critique returns no issues/additions → short-circuits without reconcile call', async () => {
    mockCreate.mockResolvedValueOnce(mockCritique({ issues: [], additions: [] }))

    const result = await runMultipass({
      candidateId: seedCandidate(),
      cvText: 'A'.repeat(200),
      baseline: { ratings: { java: 4 }, reasoning: { java: 'ok' }, questions: { java: 'q?' } },
    })

    expect(result).not.toBeNull()
    expect(result!.ratings.java).toBe(4)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('critique API failure → returns null, caller keeps baseline', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API 503'))
    const result = await runMultipass({
      candidateId: seedCandidate(),
      cvText: 'A'.repeat(200),
      baseline: { ratings: { java: 4 }, reasoning: { java: 'ok' }, questions: { java: 'q?' } },
    })
    expect(result).toBeNull()
  })

  it('critique returns no tool_use → null', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'nope' }], usage: { input_tokens: 10, output_tokens: 5 } })
    const result = await runMultipass({
      candidateId: seedCandidate(),
      cvText: 'A'.repeat(200),
      baseline: { ratings: { java: 4 }, reasoning: { java: 'ok' }, questions: { java: 'q?' } },
    })
    expect(result).toBeNull()
  })

  it('reconcile fails after critique succeeds → null, baseline untouched upstream', async () => {
    mockCreate.mockResolvedValueOnce(mockCritique({
      issues: [{ skillId: 'java', kind: 'over-rating', explanation: 'thin evidence' }],
      additions: [],
    }))
    mockCreate.mockRejectedValueOnce(new Error('timeout'))

    const result = await runMultipass({
      candidateId: seedCandidate(),
      cvText: 'A'.repeat(200),
      baseline: { ratings: { java: 4 }, reasoning: { java: 'original' }, questions: { java: 'q?' } },
    })
    expect(result).toBeNull()
  })

  it('reconcile hallucinated skill IDs (not in catalog) are dropped before persistence', async () => {
    // Demo bug: Anthropic emits "oracle" or "kafka" in the reconcile pass.
    // The old code filtered by numeric value only, so these hallucinated
    // keys made it into ai_suggestions, then into the form\'s ratings
    // state via prefill, then got rejected on submit by validateRatings —
    // leaving the candidate stuck. Now the multipass reconcile filters
    // against the catalog at write time. See plan §Item 2.
    const cid = seedCandidate()
    // Critique surfaces an addition so the reconcile pass actually runs
    // (otherwise it short-circuits and filterValidRatings never sees the
    // hallucinated keys).
    mockCreate.mockResolvedValueOnce(mockCritique({
      issues: [],
      additions: [{ skillId: 'typescript', suggestedRating: 2, evidence: 'mentioned TS' }],
    }))
    mockCreate.mockResolvedValueOnce(mockReconcile({
      ratings: { java: 4, oracle: 3, typescript: 2, kafka: 5 }, // oracle + kafka NOT in catalog
      reasoning: { java: 'ok', oracle: 'leaked', typescript: 'ok', kafka: 'leaked' },
      questions: { java: 'q?', oracle: 'q?', typescript: 'q?', kafka: 'q?' },
    }))

    const result = await runMultipass({
      candidateId: cid,
      cvText: 'A'.repeat(200),
      baseline: { ratings: { java: 4 }, reasoning: { java: 'ok' }, questions: { java: 'q?' } },
    })
    expect(result).not.toBeNull()
    expect(result!.ratings).toEqual({ java: 4, typescript: 2 })
    expect(result!.ratings.oracle).toBeUndefined()
    expect(result!.ratings.kafka).toBeUndefined()
    // ai_reasoning entries for hallucinated keys are also stripped to keep
    // the column coherent with ai_suggestions.
    expect(result!.reasoning.oracle).toBeUndefined()
    expect(result!.reasoning.kafka).toBeUndefined()
    expect(result!.questions.oracle).toBeUndefined()
    expect(result!.questions.kafka).toBeUndefined()
  })

  it('reconcile ratings out-of-range are filtered, not persisted', async () => {
    const cid = seedCandidate()
    mockCreate.mockResolvedValueOnce(mockCritique({ issues: [], additions: [{ skillId: 'python', suggestedRating: 3, evidence: 'ok' }] }))
    mockCreate.mockResolvedValueOnce(mockReconcile({
      ratings: { java: 4, python: 99 as unknown as number }, // 99 out of 0-5 range
      reasoning: { java: 'ok', python: 'bad rating' },
      questions: { java: 'q?', python: 'q?' },
    }))

    const result = await runMultipass({
      candidateId: cid,
      cvText: 'A'.repeat(200),
      baseline: { ratings: { java: 4 }, reasoning: { java: 'ok' }, questions: { java: 'q?' } },
    })
    expect(result).not.toBeNull()
    expect(result!.ratings.java).toBe(4)
    expect(result!.ratings.python).toBeUndefined() // filtered out of range
    expect(result!.reasoning.python).toBeUndefined() // reasoning dropped because rating dropped
  })

  it('both passes logged as cv_extraction_runs rows', async () => {
    const cid = seedCandidate()
    mockCreate.mockResolvedValueOnce(mockCritique({ issues: [{ skillId: 'java', kind: 'over-rating', explanation: 'x' }], additions: [] }))
    mockCreate.mockResolvedValueOnce(mockReconcile({ ratings: { java: 3 }, reasoning: { java: 'downgraded' }, questions: { java: 'q?' } }))

    await runMultipass({
      candidateId: cid,
      cvText: 'A'.repeat(200),
      baseline: { ratings: { java: 4 }, reasoning: { java: 'ok' }, questions: { java: 'q?' } },
    })

    const rows = getDb().prepare("SELECT kind, status FROM cv_extraction_runs WHERE candidate_id = ?").all(cid) as Array<{ kind: string; status: string }>
    const kinds = rows.map(r => r.kind).sort()
    expect(kinds).toEqual(['critique', 'reconcile'])
    for (const r of rows) expect(r.status).toBe('success')
  })
})

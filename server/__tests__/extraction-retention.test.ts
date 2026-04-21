import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')
const { startRun, finishRun } = await import('../lib/extraction-runs.js')
const { pruneExtractionRuns } = await import('../lib/extraction-retention.js')

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

describe('extraction-retention', () => {
  beforeAll(() => {
    preSeed()
    initDatabase()
  })
  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('keeps N most recent successful payloads per (candidate, kind); older get payload=NULL', () => {
    const db = getDb()
    const cid = crypto.randomUUID()
    db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(cid, 'T', 'T', 'system')

    // 5 successful baseline runs with payloads, different started_at
    for (let i = 0; i < 5; i++) {
      const r = startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
      finishRun({ runId: r, status: 'success', payload: { seq: i } })
      // Artificially age the row so ORDER BY started_at DESC has a stable order
      db.prepare("UPDATE cv_extraction_runs SET started_at = datetime('now', '-' || ? || ' minutes') WHERE id = ?").run((5 - i).toString(), r)
    }

    const before = db.prepare('SELECT COUNT(*) as n FROM cv_extraction_runs WHERE candidate_id = ? AND payload IS NOT NULL').get(cid) as { n: number }
    expect(before.n).toBe(5)

    const stats = pruneExtractionRuns({ keep: 2 })
    expect(stats.payloadsNulled).toBe(3)

    const after = db.prepare('SELECT COUNT(*) as n FROM cv_extraction_runs WHERE candidate_id = ? AND payload IS NOT NULL').get(cid) as { n: number }
    expect(after.n).toBe(2)

    // All 5 rows still exist (metadata preserved)
    const total = db.prepare('SELECT COUNT(*) as n FROM cv_extraction_runs WHERE candidate_id = ?').get(cid) as { n: number }
    expect(total.n).toBe(5)
  })

  it('partitions per (candidate, kind) — profile runs are independent of skills_baseline runs', () => {
    const db = getDb()
    const cid = crypto.randomUUID()
    db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(cid, 'T', 'T', 'system')
    for (let i = 0; i < 3; i++) {
      const r1 = startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
      finishRun({ runId: r1, status: 'success', payload: { k: 'skills', seq: i } })
      const r2 = startRun({ candidateId: cid, kind: 'profile', promptVersion: 2, model: 't' })
      finishRun({ runId: r2, status: 'success', payload: { k: 'profile', seq: i } })
    }
    pruneExtractionRuns({ keep: 2 })
    const nonNull = db.prepare('SELECT kind, COUNT(*) as n FROM cv_extraction_runs WHERE candidate_id = ? AND payload IS NOT NULL GROUP BY kind').all(cid) as Array<{ kind: string; n: number }>
    for (const row of nonNull) {
      expect(row.n).toBe(2)
    }
  })

  it('hard-deletes metadata-only rows beyond retention_days', () => {
    const db = getDb()
    const cid = crypto.randomUUID()
    db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(cid, 'T', 'T', 'system')

    // Make retention very small for the test
    db.prepare("UPDATE scoring_weights SET retention_days = 1 WHERE id = 'default'").run()

    // One row with NULL payload, aged 30 days
    const r = startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
    finishRun({ runId: r, status: 'success', payload: { a: 1 } })
    db.prepare("UPDATE cv_extraction_runs SET payload = NULL, started_at = datetime('now', '-30 days') WHERE id = ?").run(r)

    const stats = pruneExtractionRuns()
    expect(stats.rowsDeleted).toBeGreaterThanOrEqual(1)
    const remaining = db.prepare('SELECT id FROM cv_extraction_runs WHERE id = ?').get(r)
    expect(remaining).toBeUndefined()

    // restore default for other tests
    db.prepare("UPDATE scoring_weights SET retention_days = 90 WHERE id = 'default'").run()
  })

  it('leaves failed runs alone (only prunes success payloads)', () => {
    const db = getDb()
    const cid = crypto.randomUUID()
    db.prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(cid, 'T', 'T', 'system')
    for (let i = 0; i < 4; i++) {
      const r = startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 't' })
      finishRun({ runId: r, status: 'failed', error: 'simulated', payload: { rawError: true } })
    }
    pruneExtractionRuns({ keep: 2 })
    const nonNull = db.prepare('SELECT COUNT(*) as n FROM cv_extraction_runs WHERE candidate_id = ? AND payload IS NOT NULL').get(cid) as { n: number }
    expect(nonNull.n).toBe(4) // all failed payloads preserved
  })
})

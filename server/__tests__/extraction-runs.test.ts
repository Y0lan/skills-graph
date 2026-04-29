import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extraction-runs-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')
const { startRun, finishRun, listRuns, getRunPayload, withExtractionRun } = await import('../lib/extraction-runs.js')

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

function seedCandidate() {
  const candidateId = crypto.randomUUID()
  getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Test', 'Role', 'system')
  return candidateId
}

describe('extraction-runs', () => {
  beforeAll(() => {
    preSeed()
    initDatabase()
  })
  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('startRun assigns monotonically increasing run_index per candidate', () => {
    const cid = seedCandidate()
    const r1 = startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 'test' })
    const r2 = startRun({ candidateId: cid, kind: 'profile', promptVersion: 2, model: 'test' })
    const r3 = startRun({ candidateId: cid, kind: 'critique', promptVersion: 2, model: 'test' })
    const rows = listRuns(cid)
    expect(rows).toHaveLength(3)
    const indices = rows.map(r => r.runIndex).sort()
    expect(indices).toEqual([1, 2, 3])
    // runs are different ids
    expect(new Set([r1, r2, r3]).size).toBe(3)
  })

  it('finishRun persists status + payload + token counts', () => {
    const cid = seedCandidate()
    const runId = startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 'test' })
    finishRun({
      runId,
      status: 'success',
      payload: { ratings: { java: 4 } },
      inputTokens: 1234,
      outputTokens: 567,
    })
    const runs = listRuns(cid)
    expect(runs[0].status).toBe('success')
    expect(runs[0].inputTokens).toBe(1234)
    expect(runs[0].outputTokens).toBe(567)
    expect(runs[0].hasPayload).toBe(true)
    expect(getRunPayload(runId)).toMatchObject({ ratings: { java: 4 } })
  })

  it('finishRun records error on failure', () => {
    const cid = seedCandidate()
    const runId = startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 'test' })
    finishRun({ runId, status: 'failed', error: 'API down' })
    const runs = listRuns(cid)
    expect(runs[0].status).toBe('failed')
    expect(runs[0].error).toBe('API down')
    expect(runs[0].hasPayload).toBe(false)
  })

  it('listRuns respects limit + orders by startedAt DESC', () => {
    const cid = seedCandidate()
    for (let i = 0; i < 5; i++) startRun({ candidateId: cid, kind: 'skills_baseline', promptVersion: 2, model: 'test' })
    const runs = listRuns(cid, 3)
    expect(runs).toHaveLength(3)
  })

  it('posteSnapshot + catalogVersion roundtrip as JSON', () => {
    const cid = seedCandidate()
    const runId = startRun({
      candidateId: cid,
      kind: 'skills_role_aware',
      promptVersion: 2,
      model: 'test',
      posteSnapshot: { titre: 'Dev', description: 'short' },
      catalogVersion: '5.1.0',
    })
    finishRun({ runId, status: 'success', payload: { ratings: {} } })
    const runs = listRuns(cid)
    const run = runs.find(r => r.id === runId)!
    expect(run.posteSnapshot).toMatchObject({ titre: 'Dev', description: 'short' })
    expect(run.catalogVersion).toBe('5.1.0')
  })

  // ─── withExtractionRun lifecycle wrapper ──────────────────────────────

  it('withExtractionRun closes the row as success + records token counts', async () => {
    const cid = seedCandidate()
    const outcome = await withExtractionRun<{ ok: true }>(
      { candidateId: cid, kind: 'profile', promptVersion: 1, model: 'm' },
      async () => ({
        status: 'success',
        payload: { ok: true },
        inputTokens: 123,
        outputTokens: 45,
      }),
    )
    expect(outcome.status).toBe('success')
    if (outcome.status === 'success') expect(outcome.payload.ok).toBe(true)
    const runs = listRuns(cid)
    const run = runs.find(r => r.id === outcome.runId)!
    expect(run.status).toBe('success')
    expect(run.inputTokens).toBe(123)
    expect(run.outputTokens).toBe(45)
    expect(getRunPayload(outcome.runId)).toEqual({ ok: true })
  })

  it('withExtractionRun closes the row as partial when the body returns partial', async () => {
    const cid = seedCandidate()
    const outcome = await withExtractionRun<{ items: number }>(
      { candidateId: cid, kind: 'profile', promptVersion: 1, model: 'm' },
      async () => ({
        status: 'partial',
        payload: { items: 3 },
        error: 'half the categories failed',
        inputTokens: 50,
        outputTokens: 10,
      }),
    )
    expect(outcome.status).toBe('partial')
    const run = listRuns(cid).find(r => r.id === outcome.runId)!
    expect(run.status).toBe('partial')
    expect(run.error).toMatch(/half the categories/i)
    expect(run.inputTokens).toBe(50)
  })

  it('withExtractionRun closes the row as failed when the body returns failed (no throw)', async () => {
    const cid = seedCandidate()
    const outcome = await withExtractionRun(
      { candidateId: cid, kind: 'profile', promptVersion: 1, model: 'm' },
      async () => ({ status: 'failed' as const, error: 'returned null' }),
    )
    expect(outcome.status).toBe('failed')
    const run = listRuns(cid).find(r => r.id === outcome.runId)!
    expect(run.status).toBe('failed')
    expect(run.error).toBe('returned null')
  })

  it('withExtractionRun closes the row as failed AND rethrows when the body throws', async () => {
    const cid = seedCandidate()
    let thrown: Error | null = null
    let runId: string | null = null
    const tracker = listRuns(cid).length
    try {
      await withExtractionRun(
        { candidateId: cid, kind: 'profile', promptVersion: 1, model: 'm' },
        async (id) => {
          runId = id
          throw new Error('boom')
        },
      )
    } catch (err) {
      thrown = err as Error
    }
    expect(thrown).not.toBeNull()
    expect(thrown!.message).toBe('boom')
    expect(runId).not.toBeNull()
    const newRuns = listRuns(cid)
    expect(newRuns.length).toBe(tracker + 1)
    const run = newRuns.find(r => r.id === runId!)!
    expect(run.status).toBe('failed')
    expect(run.error).toBe('boom')
  })

  // ─── startRun race fix (codex post-plan P2 #8) ───────────────────────

  it('startRun assigns unique monotonic run_index under concurrent calls', async () => {
    const cid = seedCandidate()
    // Five parallel startRun calls for the SAME candidate. Pre-fix:
    // SELECT MAX + INSERT was non-transactional, so two parallel
    // calls could compute the same nextIndex. Fix: wrap in a
    // db.transaction. Assert all 5 received unique run_index values.
    const runIds = await Promise.all(
      [0, 1, 2, 3, 4].map(() => Promise.resolve().then(() => startRun({
        candidateId: cid, kind: 'profile', promptVersion: 1, model: 'm',
      }))),
    )
    const runs = listRuns(cid).filter(r => runIds.includes(r.id))
    const indexes = runs.map(r => r.runIndex).sort((a, b) => a - b)
    // 5 unique values
    expect(new Set(indexes).size).toBe(5)
    // Monotonic — each greater than the last
    for (let i = 1; i < indexes.length; i++) {
      expect(indexes[i]).toBeGreaterThan(indexes[i - 1])
    }
    // Cleanup so other tests' run_index expectations stay stable.
    for (const id of runIds) finishRun({ runId: id, status: 'success' })
  })
})

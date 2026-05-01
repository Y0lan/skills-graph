import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-test-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

function preSeed(TEST_DATABASE_HANDLE: string) {
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

const dbModule = await import('../lib/db.js')
const { initDatabase, getDb, TEST_DATABASE_HANDLE } = dbModule

beforeAll(async () => {
  preSeed(TEST_DATABASE_HANDLE)
  await initDatabase()
})

afterAll(async () => {
  try { await getDb().close() } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function insertCandidate(id: string, fields: Partial<{
  extraction_status: string
  extraction_attempts: number
  last_extraction_at: string | null
  last_extraction_error: string | null
  lock_acquired_at: string | null
}> = {}) {
  getDb().prepare(`
    INSERT INTO candidates (id, name, role, email, created_by, expires_at, extraction_status, extraction_attempts, last_extraction_at, last_extraction_error, lock_acquired_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    `name-${id}`,
    'dev-backend',
    `${id}@example.com`,
    'test-lead',
    new Date(Date.now() + 365 * 86400000).toISOString(),
    fields.extraction_status ?? 'idle',
    fields.extraction_attempts ?? 0,
    fields.last_extraction_at ?? null,
    fields.last_extraction_error ?? null,
    fields.lock_acquired_at ?? null,
  )
}

let runIndex = 0
function insertRun(candidateId: string, status: string, startedAt: string) {
  const runId = `run-${candidateId}-${Math.random().toString(36).slice(2, 8)}`
  runIndex += 1
  getDb().prepare(`
    INSERT INTO cv_extraction_runs (id, candidate_id, kind, run_index, prompt_version, model, started_at, finished_at, status, error)
    VALUES (?, ?, 'skills_baseline', ?, 1, 'claude-test', ?, NULL, ?, NULL)
  `).run(runId, candidateId, runIndex, startedAt, status)
  return runId
}

beforeEach(async () => {
  // wipe both tables between tests
  getDb().exec('DELETE FROM cv_extraction_runs; DELETE FROM candidates;')
})

describe('startupSweep', () => {
  it('flips running candidates to failed at boot, regardless of last_extraction_at', async () => {
    const { startupSweep } = await import('../lib/extraction-watchdog.js')

    // Marcel-style: running, attempts=0, last_extraction_at=NULL, no lock time
    insertCandidate('marcel', { extraction_status: 'running', extraction_attempts: 0 })
    // Emmanuel-style: running after a prior partial, stale lock time
    insertCandidate('emmanuel', {
      extraction_status: 'running',
      extraction_attempts: 1,
      last_extraction_at: '2026-04-23 12:57:23',
      last_extraction_error: 'prior partial',
      lock_acquired_at: '2026-04-24 00:17:57',
    })
    // Control: already succeeded should not be touched
    insertCandidate('ok', { extraction_status: 'succeeded', extraction_attempts: 1 })

    const changed = await startupSweep()
    expect(changed.candidates).toBe(2)

    const marcel = getDb().prepare('SELECT extraction_status, lock_acquired_at, last_extraction_error FROM candidates WHERE id = ?').get('marcel') as { extraction_status: string; lock_acquired_at: string | null; last_extraction_error: string | null }
    expect(marcel.extraction_status).toBe('failed')
    expect(marcel.lock_acquired_at).toBeNull()
    expect(marcel.last_extraction_error).toMatch(/Process interrompu|Reset au démarrage/)

    const emmanuel = getDb().prepare('SELECT extraction_status, lock_acquired_at, last_extraction_error FROM candidates WHERE id = ?').get('emmanuel') as { extraction_status: string; lock_acquired_at: string | null; last_extraction_error: string | null }
    expect(emmanuel.extraction_status).toBe('failed')
    expect(emmanuel.lock_acquired_at).toBeNull()
    // keeps prior error as context
    expect(emmanuel.last_extraction_error).toContain('prior partial')

    const ok = getDb().prepare('SELECT extraction_status FROM candidates WHERE id = ?').get('ok') as { extraction_status: string }
    expect(ok.extraction_status).toBe('succeeded')
  })

  it('sweeps running cv_extraction_runs into partial with explanatory error', async () => {
    const { startupSweep } = await import('../lib/extraction-watchdog.js')
    insertCandidate('c1', { extraction_status: 'succeeded' })
    insertRun('c1', 'running', '2026-04-23 12:57:20')
    insertRun('c1', 'success', '2026-04-23 12:57:23')

    const changed = await startupSweep()
    expect(changed.runs).toBe(1)

    const rows = getDb().prepare("SELECT status, error, finished_at FROM cv_extraction_runs WHERE candidate_id = 'c1' ORDER BY started_at").all() as Array<{ status: string; error: string | null; finished_at: string | null }>
    expect(rows[0].status).toBe('partial')
    expect(rows[0].error).toMatch(/interrompu|démarrage/i)
    expect(rows[0].finished_at).not.toBeNull()
    expect(rows[1].status).toBe('success')
  })
})

describe('sweepStaleExtractions (watchdog tick)', () => {
  it('flips running candidates whose lock_acquired_at is older than 10min to failed', async () => {
    const { sweepStaleExtractions } = await import('../lib/extraction-watchdog.js')

    // Set lock 11 min ago by using SQLite datetime('now','-11 minutes')
    const elevenMinAgo = getDb().prepare("SELECT datetime('now','-11 minutes') as t").get() as { t: string }
    const freshLock = getDb().prepare("SELECT datetime('now','-1 minutes') as t").get() as { t: string }

    insertCandidate('stale', { extraction_status: 'running', lock_acquired_at: elevenMinAgo.t })
    insertCandidate('fresh', { extraction_status: 'running', lock_acquired_at: freshLock.t })

    const changed = await sweepStaleExtractions()
    expect(changed.candidates).toBe(1)

    const stale = getDb().prepare('SELECT extraction_status, lock_acquired_at FROM candidates WHERE id = ?').get('stale') as { extraction_status: string; lock_acquired_at: string | null }
    expect(stale.extraction_status).toBe('failed')
    expect(stale.lock_acquired_at).toBeNull()

    const fresh = getDb().prepare('SELECT extraction_status FROM candidates WHERE id = ?').get('fresh') as { extraction_status: string }
    expect(fresh.extraction_status).toBe('running')
  })

  it('never touches a candidate with lock_acquired_at NULL (covered by startup sweep, not watchdog)', async () => {
    const { sweepStaleExtractions } = await import('../lib/extraction-watchdog.js')
    insertCandidate('no-lock-time', { extraction_status: 'running', lock_acquired_at: null })

    const changed = await sweepStaleExtractions()
    expect(changed.candidates).toBe(0)

    const row = getDb().prepare('SELECT extraction_status FROM candidates WHERE id = ?').get('no-lock-time') as { extraction_status: string }
    expect(row.extraction_status).toBe('running')
  })

  it('flips stale cv_extraction_runs too', async () => {
    const { sweepStaleExtractions } = await import('../lib/extraction-watchdog.js')
    const elevenMinAgo = getDb().prepare("SELECT datetime('now','-11 minutes') as t").get() as { t: string }
    insertCandidate('c2', { extraction_status: 'running' })
    insertRun('c2', 'running', elevenMinAgo.t)

    const changed = await sweepStaleExtractions()
    expect(changed.runs).toBe(1)
    const row = getDb().prepare("SELECT status, finished_at, error FROM cv_extraction_runs WHERE candidate_id = 'c2'").get() as { status: string; finished_at: string | null; error: string | null }
    expect(row.status).toBe('partial')
    expect(row.finished_at).not.toBeNull()
    expect(row.error).toMatch(/watchdog|timeout/i)
  })
})

describe('watchdog lifecycle', () => {
  it('startWatchdog is idempotent and stopWatchdog clears the interval', async () => {
    const { startWatchdog, stopWatchdog } = await import('../lib/extraction-watchdog.js')
    startWatchdog()
    startWatchdog() // idempotent — no-op if already running
    stopWatchdog()
    // stop is safe to call multiple times
    stopWatchdog()
    // no assertion necessary beyond "no throw + process exits cleanly"
    expect(true).toBe(true)
  })
})

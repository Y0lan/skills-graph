import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-storage-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')
const { putAsset, getAssetById, getLatestAsset, readAssetBuffer } = await import('../lib/asset-storage.js')

function preSeed() {
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

describe('asset-storage', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })
  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('stores a new asset and returns a record with sha256 + storage_path', async () => {
    const candidateId = crypto.randomUUID()
    getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Test', 'Test', 'system')

    const record = await putAsset({ candidateId, kind: 'cv_text', buffer: 'hello world' })
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(record.sizeBytes).toBe(11)
    expect(record.storagePath).toContain(record.sha256)
    expect(fs.existsSync(record.storagePath)).toBe(true)
  })

  it('dedupes: same (candidate, kind, content) returns existing record', async () => {
    const candidateId = crypto.randomUUID()
    getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Test', 'Test', 'system')

    const first = await putAsset({ candidateId, kind: 'cv_text', buffer: 'identical content' })
    const second = await putAsset({ candidateId, kind: 'cv_text', buffer: 'identical content' })
    expect(second.id).toBe(first.id)
    const rows = getDb().prepare('SELECT id FROM candidate_assets WHERE candidate_id = ?').all(candidateId) as { id: string }[]
    expect(rows).toHaveLength(1)
  })

  it('different content = new row', async () => {
    const candidateId = crypto.randomUUID()
    getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Test', 'Test', 'system')
    await putAsset({ candidateId, kind: 'cv_text', buffer: 'v1' })
    await putAsset({ candidateId, kind: 'cv_text', buffer: 'v2' })
    const rows = getDb().prepare('SELECT COUNT(*) as n FROM candidate_assets WHERE candidate_id = ?').get(candidateId) as { n: number }
    expect(rows.n).toBe(2)
  })

  it('readAssetBuffer returns the original bytes', async () => {
    const candidateId = crypto.randomUUID()
    getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Test', 'Test', 'system')
    const rec = await putAsset({ candidateId, kind: 'cv_text', buffer: 'round-trip' })
    const buf = await readAssetBuffer(rec.id)
    expect(buf?.toString('utf-8')).toBe('round-trip')
  })

  it('getLatestAsset returns the most recent by created_at', async () => {
    const candidateId = crypto.randomUUID()
    getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(candidateId, 'Test', 'Test', 'system')
    await putAsset({ candidateId, kind: 'cv_text', buffer: 'old' })
    // Force a measurable time gap so SQLite datetime('now') differs
    const older = getDb().prepare('SELECT created_at FROM candidate_assets WHERE candidate_id = ? LIMIT 1').get(candidateId) as { created_at: string }
    getDb().prepare("UPDATE candidate_assets SET created_at = datetime(?, '-1 hour') WHERE candidate_id = ?").run(older.created_at, candidateId)
    const newer = await putAsset({ candidateId, kind: 'cv_text', buffer: 'new' })
    const latest = await getLatestAsset(candidateId, 'cv_text')
    expect(latest?.id).toBe(newer.id)
  })

  it('getAssetById returns null for unknown id', async () => {
    expect(await getAssetById('does-not-exist')).toBeNull()
  })
})

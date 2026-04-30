import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-weights-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')
const { calculateGlobalScore } = await import('../lib/compatibility.js')

function preSeed() {
  const db = new Database(TEST_DATABASE_HANDLE)
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

describe('calculateGlobalScore (Phase 9 weight fix)', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })
  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('uses table weights when scoring_weights row exists (default 0.5/0.2/0.3)', async () => {
    // Default row is seeded by initDatabase — weights should be 0.5/0.2/0.3
    const score = await calculateGlobalScore(80, 60, 70)
    // 80*0.5 + 60*0.2 + 70*0.3 = 40 + 12 + 21 = 73
    expect(score).toBe(73)
  })

  it('regression: fallback when scoring_weights row is missing uses 0.5/0.2/0.3 (NOT 0.7/0.3/0)', async () => {
    // Temporarily remove the default row
    const db = getDb()
    const backup = db.prepare("SELECT * FROM scoring_weights WHERE id = 'default'").get() as { id: string; weight_poste: number; weight_equipe: number; weight_soft: number }
    db.prepare("DELETE FROM scoring_weights WHERE id = 'default'").run()
    try {
      const score = await calculateGlobalScore(80, 60, 70)
      expect(score).toBe(73)
    } finally {
      // Restore
      db.prepare(
        'INSERT INTO scoring_weights (id, weight_poste, weight_equipe, weight_soft) VALUES (?, ?, ?, ?)'
      ).run(backup.id, backup.weight_poste, backup.weight_equipe, backup.weight_soft)
    }
  })

  it('null soft → redistributes soft weight proportionally between poste + equipe', async () => {
    // With defaults 0.5/0.2/0.3 and no soft:
    // fallbackWp = 0.5 + 0.3 * (0.5 / 0.7) = 0.5 + 0.214 = 0.714
    // fallbackWe = 0.2 + 0.3 * (0.2 / 0.7) = 0.2 + 0.086 = 0.286
    // 80*0.714 + 60*0.286 = 57.14 + 17.14 = 74.29 → rounds to 74
    const score = await calculateGlobalScore(80, 60, null)
    expect(score).toBe(74)
  })

  it('returns null when poste is null AND soft is null (no way to compute)', async () => {
    expect(await calculateGlobalScore(null, 60, null)).toBeNull()
  })
})

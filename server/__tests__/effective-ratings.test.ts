import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-ratings-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')
const { mergeEffectiveRatings, loadEffectiveRatings } = await import('../lib/effective-ratings.js')

function preSeed() {
  const db = new Database(TEST_DATABASE_HANDLE)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('version', '5.1.0')").run()
  // initDatabase seeds default roles which FK-reference 20 categories;
  // preSeed must satisfy that or the migration will fail.
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((c, i) => ins.run(c, c, '*', i))
  db.close()
}

function seedCandidature(opts: {
  ai?: Record<string, number> | null
  roleAware?: Record<string, number> | null
  manual?: Record<string, number> | null
} = {}): string {
  const db = getDb()
  const roleId = `role-${crypto.randomUUID()}`
  db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'R', 'system')
  const posteId = `poste-${crypto.randomUUID().slice(0, 8)}`
  db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
    VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId, roleId, 'P')
  const candidateId = crypto.randomUUID()
  // candidates.ratings is NOT NULL — default to '{}' when the test
  // doesn\'t specify a manual ratings record.
  const manualJson = opts.manual !== undefined && opts.manual !== null
    ? JSON.stringify(opts.manual)
    : '{}'
  db.prepare('INSERT INTO candidates (id, name, role, role_id, created_by, ratings, ai_suggestions) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    candidateId, 'Test', 'R', roleId, 'system',
    manualJson,
    opts.ai !== undefined ? (opts.ai === null ? null : JSON.stringify(opts.ai)) : null,
  )
  const cid = crypto.randomUUID()
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut, role_aware_suggestions) VALUES (?, ?, ?, ?, ?)').run(
    cid, candidateId, posteId, 'postule',
    opts.roleAware !== undefined ? (opts.roleAware === null ? null : JSON.stringify(opts.roleAware)) : null,
  )
  return cid
}

// One module-level setup so the in-memory tests and DB-backed tests
// share the same tmpdir / initialized DB. Splitting describes was
// triggering "directory does not exist" on the second describe\'s
// preSeed because the first describe\'s afterAll already removed it.

beforeAll(async () => {
  preSeed()
  await initDatabase()
})
afterAll(async () => {
  try { await getDb().close() } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('mergeEffectiveRatings — pure in-memory variant', () => {

  // ─── Precedence: manual > role-aware > ai ────────────────────────────

  it('precedence: manual overrides role-aware overrides ai for the same key', async () => {
    const result = mergeEffectiveRatings({
      ai: { java: 1, python: 1 },
      roleAware: { java: 2 },
      manual: { java: 3 },
    })
    expect(result.ratings.java).toBe(3)         // manual wins
    expect(result.ratings.python).toBe(1)       // ai baseline preserved (no override)
  })

  it('preserves ai-only keys not present in role-aware or manual', async () => {
    // The original drift bug: when role-aware was non-empty, the
    // either/or logic dropped every ai-only key. Module restores them.
    const result = mergeEffectiveRatings({
      ai: { java: 3, python: 2, kubernetes: 1 },
      roleAware: { java: 4, typescript: 3 },
      manual: { python: 4 },
    })
    expect(result.ratings).toEqual({
      java: 4,        // role-aware overrides ai
      python: 4,      // manual overrides ai (and roleAware doesn\'t have python)
      kubernetes: 1,  // ai-only, preserved
      typescript: 3,  // role-aware introduces
    })
  })

  // ─── Cross-poste mode excludes role-aware ─────────────────────────────

  it('cross-poste-baseline mode drops role-aware even when present', async () => {
    const result = mergeEffectiveRatings(
      {
        ai: { java: 1 },
        roleAware: { java: 5 },        // would dominate in current-poste
        manual: {},
      },
      'cross-poste-baseline',
    )
    expect(result.ratings.java).toBe(1)   // ai survives, roleAware excluded
  })

  it('cross-poste-baseline mode reports mergedSources.roleAware = false even when DB had it', async () => {
    const result = mergeEffectiveRatings(
      { ai: { java: 1 }, roleAware: { java: 5 }, manual: {} },
      'cross-poste-baseline',
    )
    expect(result.availableSources.roleAware).toBe(true)   // was in the data
    expect(result.mergedSources.roleAware).toBe(false)     // didn\'t contribute
  })

  it('current-poste mode (default) includes role-aware', async () => {
    const result = mergeEffectiveRatings({
      ai: { java: 1 },
      roleAware: { java: 5 },
      manual: {},
    })
    expect(result.ratings.java).toBe(5)
    expect(result.mergedSources.roleAware).toBe(true)
  })

  // ─── availableSources vs mergedSources ────────────────────────────────

  it('reports availableSources.manual = false for null/empty/whitespace JSON', async () => {
    expect(mergeEffectiveRatings({ ai: null, roleAware: null, manual: null }).availableSources.manual).toBe(false)
    expect(mergeEffectiveRatings({ ai: null, roleAware: null, manual: '{}' }).availableSources.manual).toBe(false)
    expect(mergeEffectiveRatings({ ai: null, roleAware: null, manual: {} }).availableSources.manual).toBe(false)
  })

  it('availableSources tracks every non-empty source even in cross-poste mode', async () => {
    const result = mergeEffectiveRatings(
      { ai: { java: 1 }, roleAware: { python: 2 }, manual: { kotlin: 3 } },
      'cross-poste-baseline',
    )
    expect(result.availableSources).toEqual({ ai: true, roleAware: true, manual: true })
    expect(result.mergedSources).toEqual({ ai: true, roleAware: false, manual: true })
  })

  // ─── Input shape flexibility ──────────────────────────────────────────

  it('accepts JSON strings and pre-parsed records interchangeably', async () => {
    const fromString = mergeEffectiveRatings({
      ai: JSON.stringify({ java: 3 }),
      roleAware: JSON.stringify({ python: 2 }),
      manual: JSON.stringify({ go: 1 }),
    })
    const fromRecord = mergeEffectiveRatings({
      ai: { java: 3 },
      roleAware: { python: 2 },
      manual: { go: 1 },
    })
    expect(fromString).toEqual(fromRecord)
  })

  it('mixes JSON strings and records on the same call', async () => {
    const result = mergeEffectiveRatings({
      ai: JSON.stringify({ java: 3 }),
      roleAware: { python: 2 },
      manual: null,
    })
    expect(result.ratings).toEqual({ java: 3, python: 2 })
  })

  // ─── Pre-fix repro ────────────────────────────────────────────────────

  it('pre-fix repro: either/or logic dropped ai-only keys when roleAware was set', async () => {
    // The compat-breakdown handler at recruitment.ts:2014 used to do:
    //     rating = roleAware ?? ai
    // With roleAware = { java: 4 } and ai = { java: 3, python: 2 }
    // it returned { java: 4 }, dropping python entirely.
    // The Module returns the merged shape.
    const oldShape = { java: 4 }   // either/or bug result
    const newShape = mergeEffectiveRatings({
      ai: { java: 3, python: 2 },
      roleAware: { java: 4 },
      manual: null,
    }).ratings
    expect(newShape).not.toEqual(oldShape)
    expect(newShape).toEqual({ java: 4, python: 2 })
  })
})

describe('loadEffectiveRatings — DB-backed variant', () => {

  it('matches the in-memory variant for the same row', async () => {
    const cid = seedCandidature({
      ai: { java: 3, kubernetes: 1 },
      roleAware: { java: 4, typescript: 3 },
      manual: { python: 4 },
    })
    const fromDb = await loadEffectiveRatings(cid)
    const fromMemory = mergeEffectiveRatings({
      ai: { java: 3, kubernetes: 1 },
      roleAware: { java: 4, typescript: 3 },
      manual: { python: 4 },
    })
    expect(fromDb.ratings).toEqual(fromMemory.ratings)
    expect(fromDb.availableSources).toEqual(fromMemory.availableSources)
    expect(fromDb.mergedSources).toEqual(fromMemory.mergedSources)
  })

  it('returns empty + all-false sources for unknown candidatureId', async () => {
    const result = await loadEffectiveRatings('does-not-exist')
    expect(result.ratings).toEqual({})
    expect(result.availableSources).toEqual({ ai: false, roleAware: false, manual: false })
    expect(result.mergedSources).toEqual({ ai: false, roleAware: false, manual: false })
  })

  it('honors mode argument when called from DB', async () => {
    const cid = seedCandidature({
      ai: { java: 1 },
      roleAware: { java: 5 },
    })
    const current = await loadEffectiveRatings(cid, 'current-poste')
    const cross = await loadEffectiveRatings(cid, 'cross-poste-baseline')
    expect(current.ratings.java).toBe(5)
    expect(cross.ratings.java).toBe(1)
  })
})

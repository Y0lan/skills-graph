import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'

// Create temp dir and set DATA_DIR before db module resolves its const
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-test-'))
process.env.DATA_DIR = tmpDir

// Mock seedCatalog to avoid dependency on skill-catalog-full.json
vi.mock('../lib/seed-catalog.js', () => ({
  seedCatalog: vi.fn(),
}))

const dbModule = await import('../lib/db.js')
const {
  initDatabase,
  getRoles,
  getRole,
  createRole,
  updateRole,
  softDeleteRole,
  getRoleCategories,
  getDb,
  DB_PATH,
} = dbModule

/**
 * Pre-seed the categories table before initDatabase() runs, because
 * initDatabase seeds roles (with FK to categories) before it seeds
 * the catalog. In production the DB already has categories from a
 * prior run; in a fresh test DB we must create them up front.
 */
function preSeedCategories() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      emoji TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )
  `)
  const insert = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  const cats = [
    'core-engineering',
    'backend-integration',
    'frontend-ui',
    'soft-skills-delivery',
    'platform-engineering',
    'observability-reliability',
    'security-compliance',
    'qa-test-engineering',
    'analyse-fonctionnelle',
    'domain-knowledge',
    'project-management-pmo',
    'change-management-training',
  ]
  for (let i = 0; i < cats.length; i++) {
    insert.run(cats[i], cats[i], '', i)
  }
  db.close()
}

describe('Role DB helpers', () => {
  beforeAll(() => {
    preSeedCategories()
    initDatabase()
  })

  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('getRoles() returns seeded roles (4 roles)', () => {
    const roles = getRoles()
    expect(roles).toHaveLength(4)
    const ids = roles.map(r => r.id).sort()
    expect(ids).toEqual([
      'analyste-fonctionnel',
      'dev-full-stack',
      'devops',
      'qa-engineer',
    ])
  })

  it('getRole("dev-full-stack") returns the full-stack role with correct category IDs', () => {
    const role = getRole('dev-full-stack')
    expect(role).not.toBeNull()
    expect(role!.id).toBe('dev-full-stack')
    expect(role!.label).toBe('Développeur Full Stack')
    expect(role!.createdBy).toBe('system')
    expect(role!.categoryIds).toEqual(
      expect.arrayContaining([
        'core-engineering',
        'backend-integration',
        'frontend-ui',
        'soft-skills-delivery',
      ]),
    )
    expect(role!.categoryIds).toHaveLength(4)
  })

  it('getRole("nonexistent") returns null', () => {
    const role = getRole('nonexistent')
    expect(role).toBeNull()
  })

  it('createRole() creates a new role with categories', () => {
    const role = createRole('test-role', 'Test Role', ['core-engineering', 'frontend-ui'], 'tester')
    expect(role.id).toBe('test-role')
    expect(role.label).toBe('Test Role')
    expect(role.createdBy).toBe('tester')
    expect(role.categoryIds).toEqual(
      expect.arrayContaining(['core-engineering', 'frontend-ui']),
    )
    expect(role.categoryIds).toHaveLength(2)

    // Verify it appears in getRoles()
    const all = getRoles()
    expect(all.find(r => r.id === 'test-role')).toBeDefined()
  })

  it('createRole() with duplicate ID throws (SQLite UNIQUE)', () => {
    expect(() => {
      createRole('dev-full-stack', 'Duplicate', ['core-engineering'], 'tester')
    }).toThrow()
  })

  it('updateRole() updates label and categories', () => {
    const updated = updateRole('test-role', 'Updated Role', ['core-engineering'])
    expect(updated).not.toBeNull()
    expect(updated!.label).toBe('Updated Role')
    expect(updated!.categoryIds).toEqual(['core-engineering'])
  })

  it('updateRole() with nonexistent ID returns null', () => {
    const result = updateRole('does-not-exist', 'Whatever', ['core-engineering'])
    expect(result).toBeNull()
  })

  it('softDeleteRole() marks role as deleted', () => {
    const deleted = softDeleteRole('test-role')
    expect(deleted).toBe(true)

    // Verify it no longer appears via getRole
    const role = getRole('test-role')
    expect(role).toBeNull()
  })

  it('softDeleteRole() — deleted role not returned by getRoles()', () => {
    // test-role was soft-deleted in the previous test
    const all = getRoles()
    expect(all.find(r => r.id === 'test-role')).toBeUndefined()
  })

  it('getRoleCategories() returns correct category IDs', () => {
    const cats = getRoleCategories('devops')
    expect(cats).toEqual(
      expect.arrayContaining([
        'core-engineering',
        'platform-engineering',
        'observability-reliability',
        'security-compliance',
      ]),
    )
    expect(cats).toHaveLength(4)
  })
})

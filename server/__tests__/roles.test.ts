import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

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
  TEST_DATABASE_HANDLE,
} = dbModule

/**
 * Pre-seed the categories table before initDatabase() runs, because
 * initDatabase seeds roles (with FK to categories) before it seeds
 * the catalog. In production the DB already has categories from a
 * prior run; in a fresh test DB we must create them up front.
 */
function preSeedCategories() {
  const db = new Database(TEST_DATABASE_HANDLE)
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
    'architecture-governance',
    'design-ux',
    'legacy-ibmi-adelia',
    'ai-engineering',
    'management-leadership',
    'data-engineering-governance',
  ]
  for (let i = 0; i < cats.length; i++) {
    insert.run(cats[i], cats[i], '', i)
  }
  db.close()
}

describe('Role DB helpers', () => {
  beforeAll(async () => {
    preSeedCategories()
    await initDatabase()
  })

  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('getRoles() returns the seeded recruitment roles, all wired to a poste', async () => {
    const roles = await getRoles()
    const ids = roles.map(r => r.id).sort()
    expect(ids).toEqual(expect.arrayContaining([
      'architecte-si',
      'business-analyst',
      'candidature-libre',
      'dev-java-fullstack',
      'dev-jboss-senior',
      'dev-senior-adelia',
      'tech-lead-adelia',
      'tech-lead-java',
    ]))
    for (const r of roles.filter(r => r.createdBy === 'system')) {
      expect(r.hasPoste).toBe(true)
    }
  })

  it('legacy team-skill-radar roles are no longer exposed', async () => {
    for (const legacyId of ['dev-full-stack', 'devops', 'qa-engineer', 'analyste-fonctionnel']) {
      expect(await getRole(legacyId)).toBeNull()
    }
  })

  it('getRole("architecte-si") returns the architecte role with correct category IDs', async () => {
    const role = await getRole('architecte-si')
    expect(role).not.toBeNull()
    expect(role!.id).toBe('architecte-si')
    expect(role!.label).toBe('Architecte SI Logiciel')
    expect(role!.createdBy).toBe('system')
    expect(role!.hasPoste).toBe(true)
    expect(role!.categoryIds).toEqual(
      expect.arrayContaining([
        'architecture-governance',
        'core-engineering',
        'backend-integration',
        'platform-engineering',
        'frontend-ui',
        'soft-skills-delivery',
      ]),
    )
    expect(role!.categoryIds).toHaveLength(6)
  })

  it('getRole("nonexistent") returns null', async () => {
    const role = await getRole('nonexistent')
    expect(role).toBeNull()
  })

  it('createRole() creates a new role with categories', async () => {
    const role = await createRole('test-role', 'Test Role', ['core-engineering', 'frontend-ui'], 'tester')
    expect(role.id).toBe('test-role')
    expect(role.label).toBe('Test Role')
    expect(role.createdBy).toBe('tester')
    expect(role.categoryIds).toEqual(
      expect.arrayContaining(['core-engineering', 'frontend-ui']),
    )
    expect(role.categoryIds).toHaveLength(2)

    // Verify it appears in getRoles()
    const all = await getRoles()
    expect(all.find(r => r.id === 'test-role')).toBeDefined()
  })

  it('createRole() with duplicate ID throws', async () => {
    await expect(createRole('architecte-si', 'Duplicate', ['core-engineering'], 'tester')).rejects.toThrow()
  })

  it('updateRole() updates label and categories', async () => {
    const updated = await updateRole('test-role', 'Updated Role', ['core-engineering'])
    expect(updated).not.toBeNull()
    expect(updated!.label).toBe('Updated Role')
    expect(updated!.categoryIds).toEqual(['core-engineering'])
  })

  it('updateRole() with nonexistent ID returns null', async () => {
    const result = await updateRole('does-not-exist', 'Whatever', ['core-engineering'])
    expect(result).toBeNull()
  })

  it('softDeleteRole() marks role as deleted', async () => {
    const deleted = await softDeleteRole('test-role')
    expect(deleted).toBe(true)

    // Verify it no longer appears via getRole
    const role = await getRole('test-role')
    expect(role).toBeNull()
  })

  it('softDeleteRole() — deleted role not returned by getRoles()', async () => {
    // test-role was soft-deleted in the previous test
    const all = await getRoles()
    expect(all.find(r => r.id === 'test-role')).toBeUndefined()
  })

  it('getRoleCategories() returns correct category IDs', async () => {
    const cats = await getRoleCategories('tech-lead-java')
    expect(cats).toEqual(
      expect.arrayContaining([
        'core-engineering',
        'backend-integration',
        'frontend-ui',
        'platform-engineering',
        'architecture-governance',
        'soft-skills-delivery',
      ]),
    )
    expect(cats).toHaveLength(6)
  })
})

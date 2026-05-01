import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

/**
 * Regression guard for the "pill says 18%, modal says 19%" drift.
 * Scoring was inline in 5+ places with THREE different merge strategies.
 * The shared rescoreCandidature → loadEffectiveRatings helper is the
 * single source of truth now. These tests lock the merge order and
 * confirm the DB UPDATE lands.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoring-helpers-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')
const { loadEffectiveRatings, rescoreCandidature, rescorePoste, recalculateAllCandidatureScores } = await import('../lib/scoring-helpers.js')
const { calculatePosteCompatibility, calculateEquipeCompatibility, TEAM_DRAFT_MIN_RATED_SKILLS } = await import('../lib/compatibility.js')

function preSeed() {
  const db = new Database(`${TEST_DATABASE_HANDLE}-scoring-helpers`)
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

beforeAll(async () => {
  preSeed()
  await initDatabase()
  const db = getDb()
  const posteId = (db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id

  // Fixture 1: merge-test candidature, populated per-test
  db.prepare(`INSERT INTO candidates (id, name, role, email, created_by, expires_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(
    'cand-merge', 'Merge Test', 'Dev', 'merge@example.com', 'test',
    new Date(Date.now() + 365 * 86400000).toISOString(),
  )
  db.prepare(`INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal)
              VALUES (?, ?, ?, 'postule', 'site')`).run('cdt-merge', 'cand-merge', posteId)

  // Fixture 2: rescore-test candidature, pre-seeded with ai_suggestions
  db.prepare(`INSERT INTO candidates (id, name, role, email, created_by, expires_at, ai_suggestions)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'cand-rescore', 'Rescore Test', 'Dev', 'rescore@example.com', 'test',
    new Date(Date.now() + 365 * 86400000).toISOString(),
    JSON.stringify({ java: 5 }),
  )
  db.prepare(`INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal)
              VALUES (?, ?, ?, 'postule', 'site')`).run('cdt-rescore', 'cand-rescore', posteId)
})

afterAll(async () => {
  try { await getDb().close() } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadEffectiveRatings — merge order', () => {
  it('merges ai + role_aware + manual with "later wins per-skill"', async () => {
    const db = getDb()
    db.prepare('UPDATE candidates SET ratings = ?, ai_suggestions = ? WHERE id = ?')
      .run(JSON.stringify({ python: 4 }), JSON.stringify({ java: 3, python: 2, kubernetes: 1 }), 'cand-merge')
    db.prepare('UPDATE candidatures SET role_aware_suggestions = ? WHERE id = ?')
      .run(JSON.stringify({ java: 4, typescript: 3 }), 'cdt-merge')

    const { ratings, availableSources } = await loadEffectiveRatings('cdt-merge')
    expect(ratings).toEqual({
      java: 4,            // role_aware overrides ai
      python: 4,          // manual overrides ai
      kubernetes: 1,      // ai baseline preserved — this is the whole bug
      typescript: 3,      // role_aware introduces
    })
    expect(availableSources).toEqual({ ai: true, roleAware: true, manual: true })
  })

  it('returns empty when every source is empty JSON', async () => {
    const db = getDb()
    db.prepare('UPDATE candidates SET ratings = ?, ai_suggestions = ? WHERE id = ?')
      .run('{}', '{}', 'cand-merge')
    db.prepare('UPDATE candidatures SET role_aware_suggestions = NULL WHERE id = ?').run('cdt-merge')
    const { ratings, availableSources } = await loadEffectiveRatings('cdt-merge')
    expect(ratings).toEqual({})
    expect(availableSources).toEqual({ ai: false, roleAware: false, manual: false })
  })

  it('returns empty ratings for an unknown candidatureId (does not throw)', async () => {
    const { ratings, availableSources } = await loadEffectiveRatings('does-not-exist')
    expect(ratings).toEqual({})
    expect(availableSources.ai).toBe(false)
  })
})

describe('rescoreCandidature — DB side effects', () => {
  it('writes computed scores onto the candidature row', async () => {
    const result = await rescoreCandidature('cdt-rescore')
    expect(result.candidatureId).toBe('cdt-rescore')
    const after = getDb().prepare('SELECT taux_compatibilite_poste FROM candidatures WHERE id = ?').get('cdt-rescore') as { taux_compatibilite_poste: number | null }
    expect(typeof after.taux_compatibilite_poste).toBe('number')
  })

  it('throws on unknown candidatureId', async () => {
    await expect(rescoreCandidature('nope')).rejects.toThrow(/not found/)
  })
})

describe('posteId-not-roleId regression (codex P0 #1)', () => {
  it('two postes sharing a role get DIFFERENT scores when they have different requirements', async () => {
    // Codex's specific attack: before the signature fix,
    // calculatePosteCompatibility took posteRoleId and internally did
    // "SELECT id FROM postes WHERE role_id = ? LIMIT 1" — so two postes
    // on the same role would BOTH score against the first poste's
    // requirements. This test makes that bug impossible to re-introduce.
    const db = getDb()

    // Find an existing role with at least one poste
    const anyPoste = db.prepare('SELECT id, role_id FROM postes LIMIT 1').get() as { id: string; role_id: string }
    const roleId = anyPoste.role_id

    // Find two postes on the same role; if only one exists, create a twin
    let siblings = db.prepare('SELECT id FROM postes WHERE role_id = ? LIMIT 2').all(roleId) as { id: string }[]
    if (siblings.length < 2) {
      db.prepare('INSERT INTO postes (id, titre, pole, role_id) VALUES (?, ?, ?, ?)')
        .run('twin-poste', 'Twin Poste', 'java_modernisation', roleId)
      siblings = db.prepare('SELECT id FROM postes WHERE role_id = ? LIMIT 2').all(roleId) as { id: string }[]
    }
    const [posteA, posteB] = siblings

    // Seed a catalog skill we can reference
    db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)').run('test-java', 'core-engineering', 'Test Java', 0)
    db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)').run('test-python', 'core-engineering', 'Test Python', 1)

    // Poste A wants Java L5 (requis). Poste B wants Python L5 (requis).
    // Candidate knows Java L5, Python L0.
    // Correct scoring: A → ~100%, B → 0%.
    // Old bug: B would score against A's requirements → ~100%.
    db.prepare('DELETE FROM poste_skill_requirements WHERE poste_id IN (?, ?)').run(posteA.id, posteB.id)
    db.prepare('INSERT INTO poste_skill_requirements (poste_id, skill_id, target_level, importance) VALUES (?, ?, ?, ?)').run(posteA.id, 'test-java', 5, 'requis')
    db.prepare('INSERT INTO poste_skill_requirements (poste_id, skill_id, target_level, importance) VALUES (?, ?, ?, ?)').run(posteB.id, 'test-python', 5, 'requis')

    const ratings = { 'test-java': 5, 'test-python': 0 }
    const scoreA = await calculatePosteCompatibility(ratings, posteA.id)
    const scoreB = await calculatePosteCompatibility(ratings, posteB.id)

    expect(scoreA).toBeGreaterThanOrEqual(90)
    expect(scoreB).toBeLessThanOrEqual(10)
    expect(scoreA).not.toBe(scoreB)  // the whole point of the fix
  })
})

describe('rescorePoste — batch update', () => {
  it('returns one result per candidature on the poste', async () => {
    const posteId = (getDb().prepare('SELECT id FROM postes LIMIT 1').get() as { id: string }).id
    const results = await rescorePoste(posteId)
    expect(results.length).toBeGreaterThanOrEqual(2)  // cdt-merge + cdt-rescore
    for (const r of results) {
      expect(r.source).toBe('rescore')
    }
  })

  it('returns empty array for a poste with no candidatures', async () => {
    const db = getDb()
    const row = db.prepare(`
      SELECT p.id FROM postes p
      LEFT JOIN candidatures c ON c.poste_id = p.id
      GROUP BY p.id
      HAVING COUNT(c.id) = 0
      LIMIT 1
    `).get() as { id: string } | undefined
    if (!row) return
    const results = await rescorePoste(row.id)
    expect(results).toEqual([])
  })
})

describe('team baseline scoring', () => {
  it('ignores under-threshold draft team ratings for EQUIPE scoring', async () => {
    const db = getDb()
    db.prepare('DELETE FROM evaluations').run()
    db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)').run('draft-baseline-cat', 'Draft Baseline', '*', 999)
    for (let i = 1; i <= TEAM_DRAFT_MIN_RATED_SKILLS; i++) {
      db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)').run(`draft-baseline-skill-${i}`, 'draft-baseline-cat', `Draft baseline skill ${i}`, i)
    }
    db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run('draft-baseline-role', 'Draft Baseline Role', 'test')
    db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run('draft-baseline-role', 'draft-baseline-cat')
    db.prepare(`
      INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories, submitted_at)
      VALUES (?, ?, '{}', '[]', '[]', NULL)
      ON CONFLICT (slug) DO UPDATE SET ratings = EXCLUDED.ratings, submitted_at = NULL
    `).run('draft-team-member', JSON.stringify({ 'draft-baseline-skill-1': 5 }))

    const score = await calculateEquipeCompatibility({ 'draft-baseline-skill-1': 1 }, 'draft-baseline-role')
    expect(score).toBe(0)
  })

  it('uses draft team ratings once the completeness threshold is met', async () => {
    const db = getDb()
    db.prepare('DELETE FROM evaluations').run()
    const ratings = Object.fromEntries(
      Array.from({ length: TEAM_DRAFT_MIN_RATED_SKILLS }, (_, i) => [`draft-baseline-skill-${i + 1}`, 5]),
    )
    const candidateRatings = Object.fromEntries(
      Array.from({ length: TEAM_DRAFT_MIN_RATED_SKILLS }, (_, i) => [`draft-baseline-skill-${i + 1}`, 1]),
    )
    db.prepare(`
      INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories, submitted_at)
      VALUES (?, ?, '{}', '[]', '[]', NULL)
      ON CONFLICT (slug) DO UPDATE SET ratings = EXCLUDED.ratings, submitted_at = NULL
    `).run('complete-draft-team-member', JSON.stringify(ratings))

    const score = await calculateEquipeCompatibility(candidateRatings, 'draft-baseline-role')
    expect(score).toBe(16)
  })

  it('ignores empty team ratings for EQUIPE scoring', async () => {
    const db = getDb()
    db.prepare('DELETE FROM evaluations').run()
    db.prepare(`
      INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories, submitted_at)
      VALUES (?, '{}', '{}', '[]', '[]', NULL)
      ON CONFLICT (slug) DO UPDATE SET ratings = EXCLUDED.ratings, submitted_at = NULL
    `).run('empty-draft-team-member')

    const score = await calculateEquipeCompatibility({ 'draft-baseline-skill-1': 1 }, 'draft-baseline-role')
    expect(score).toBe(0)
  })
})

describe('recalculateAllCandidatureScores', () => {
  it('rescores every candidature and reports per-row failures without throwing', async () => {
    const result = await recalculateAllCandidatureScores('test:all')
    expect(result.reason).toBe('test:all')
    expect(result.total).toBeGreaterThanOrEqual(2)
    expect(result.scored).toBe(result.total)
    expect(result.failed).toEqual([])
  })
})

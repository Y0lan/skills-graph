import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'funnel-test-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const dbModule = await import('../lib/db.js')
const { initDatabase, getDb, DB_PATH } = dbModule
const { buildFunnel, buildFunnelFlow } = await import('../lib/funnel-analysis.js')

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
    'core-engineering', 'backend-integration', 'frontend-ui', 'soft-skills-delivery',
    'platform-engineering', 'observability-reliability', 'security-compliance',
    'qa-test-engineering', 'analyse-fonctionnelle', 'domain-knowledge',
    'project-management-pmo', 'change-management-training', 'architecture-governance',
    'design-ux', 'legacy-ibmi-adelia', 'ai-engineering', 'management-leadership',
    'data-engineering-governance',
  ]
  for (let i = 0; i < cats.length; i++) insert.run(cats[i], cats[i], '', i)
  db.close()
}

beforeAll(() => {
  preSeedCategories()
  initDatabase()
})

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* noop */ }
})

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM candidature_events').run()
  db.prepare('DELETE FROM candidatures').run()
  db.prepare('DELETE FROM candidates').run()
  db.prepare('DELETE FROM postes').run()
  db.prepare('DELETE FROM roles').run()
})

function seedRolePoste(opts: { roleId?: string; posteId?: string; pole?: string } = {}): string {
  const roleId = opts.roleId ?? 'r1'
  const posteId = opts.posteId ?? 'p1'
  const pole = opts.pole ?? 'java_modernisation'
  const db = getDb()
  db.prepare(`INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, 'test')`).run(roleId, roleId)
  db.prepare(`INSERT OR IGNORE INTO postes (id, role_id, titre, pole, created_at) VALUES (?, ?, ?, ?, datetime('now'))`)
    .run(posteId, roleId, posteId, pole)
  return posteId
}

function seedCandidature(opts: { id: string; posteId: string; statut: string; createdAt?: string }): void {
  const db = getDb()
  const candidateId = `cand-${opts.id}`
  db.prepare(`INSERT INTO candidates (id, name, role, role_id, email, created_by) VALUES (?, ?, 'r1', 'r1', ?, 'test')`)
    .run(candidateId, `Candidate ${opts.id}`, `${opts.id}@test.com`)
  if (opts.createdAt) {
    db.prepare(`INSERT INTO candidatures (id, candidate_id, poste_id, statut, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(opts.id, candidateId, opts.posteId, opts.statut, opts.createdAt)
  } else {
    db.prepare(`INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)`)
      .run(opts.id, candidateId, opts.posteId, opts.statut)
  }
}

function addEvent(candId: string, from: string, to: string): void {
  getDb().prepare(`INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, created_by) VALUES (?, 'status_change', ?, ?, 'test')`)
    .run(candId, from, to)
}

describe('buildFunnel', () => {
  it('returns empty result when no candidatures exist', () => {
    const data = buildFunnel({})
    expect(data.totals).toEqual({ all: 0, hired: 0, refused: 0, in_progress: 0 })
    expect(data.links).toEqual([])
    // All nodes still listed for stable UI rendering
    expect(data.nodes.map(n => n.id)).toContain('postule')
    expect(data.nodes.every(n => n.count === 0)).toBe(true)
  })

  it('counts every candidature in postule baseline even with no events', () => {
    const posteId = seedRolePoste()
    seedCandidature({ id: 'c1', posteId, statut: 'postule' })
    seedCandidature({ id: 'c2', posteId, statut: 'postule' })

    const data = buildFunnel({})
    expect(data.totals.all).toBe(2)
    expect(data.totals.in_progress).toBe(2)
    expect(data.nodes.find(n => n.id === 'postule')?.count).toBe(2)
    expect(data.links).toEqual([])
  })

  it('aggregates a single candidature through three transitions', () => {
    const posteId = seedRolePoste()
    seedCandidature({ id: 'c1', posteId, statut: 'entretien_1' })
    addEvent('c1', 'postule', 'preselectionne')
    addEvent('c1', 'preselectionne', 'skill_radar_envoye')
    addEvent('c1', 'skill_radar_envoye', 'entretien_1')

    const data = buildFunnel({})
    expect(data.links).toHaveLength(3)
    expect(data.links).toContainEqual(expect.objectContaining({ source: 'postule', target: 'preselectionne', value: 1 }))
    expect(data.links).toContainEqual(expect.objectContaining({ source: 'preselectionne', target: 'skill_radar_envoye', value: 1 }))
    expect(data.links).toContainEqual(expect.objectContaining({ source: 'skill_radar_envoye', target: 'entretien_1', value: 1 }))
  })

  it('sums values when multiple candidatures share the same transition', () => {
    const posteId = seedRolePoste()
    for (let i = 1; i <= 5; i++) {
      seedCandidature({ id: `c${i}`, posteId, statut: 'preselectionne' })
      addEvent(`c${i}`, 'postule', 'preselectionne')
    }
    const data = buildFunnel({})
    const link = data.links.find(l => l.source === 'postule' && l.target === 'preselectionne')
    expect(link?.value).toBe(5)
  })

  it('counts hired and refused as terminal in totals', () => {
    const posteId = seedRolePoste()
    seedCandidature({ id: 'h1', posteId, statut: 'embauche' })
    seedCandidature({ id: 'r1', posteId, statut: 'refuse' })
    seedCandidature({ id: 'r2', posteId, statut: 'refuse' })
    seedCandidature({ id: 'p1', posteId, statut: 'entretien_1' })

    const data = buildFunnel({})
    expect(data.totals).toEqual({ all: 4, hired: 1, refused: 2, in_progress: 1 })
  })

  it('filters out other poles', () => {
    const javaId = seedRolePoste({ posteId: 'p-java', pole: 'java_modernisation' })
    const legacyId = seedRolePoste({ roleId: 'r2', posteId: 'p-legacy', pole: 'legacy' })
    seedCandidature({ id: 'c-java', posteId: javaId, statut: 'postule' })
    seedCandidature({ id: 'c-legacy', posteId: legacyId, statut: 'postule' })

    const javaOnly = buildFunnel({ pole: 'java_modernisation' })
    expect(javaOnly.totals.all).toBe(1)

    const all = buildFunnel({ pole: 'all' })
    expect(all.totals.all).toBe(2)
  })

  it('filters by days window using created_at', () => {
    const posteId = seedRolePoste()
    seedCandidature({ id: 'recent', posteId, statut: 'postule' })
    // Old candidature, 100 days old
    seedCandidature({ id: 'old', posteId, statut: 'postule', createdAt: "datetime('now', '-100 days')" })
    // The createdAt parameter took a string literal — re-do with explicit datetime expression
    getDb().prepare("UPDATE candidatures SET created_at = datetime('now', '-100 days') WHERE id = 'old'").run()

    const last30 = buildFunnel({ days: 30 })
    expect(last30.totals.all).toBe(1)

    const last200 = buildFunnel({ days: 200 })
    expect(last200.totals.all).toBe(2)
  })

  it('skips self-loop transitions (statut_from == statut_to)', () => {
    const posteId = seedRolePoste()
    seedCandidature({ id: 'c1', posteId, statut: 'preselectionne' })
    addEvent('c1', 'preselectionne', 'preselectionne') // pathological no-op
    addEvent('c1', 'postule', 'preselectionne')
    const data = buildFunnel({})
    expect(data.links).toHaveLength(1)
    expect(data.links[0]).toMatchObject({ source: 'postule', target: 'preselectionne', value: 1 })
  })

  it('counts a candidature touching a node only once even with re-entry', () => {
    const posteId = seedRolePoste()
    seedCandidature({ id: 'c1', posteId, statut: 'entretien_1' })
    addEvent('c1', 'postule', 'preselectionne')
    addEvent('c1', 'preselectionne', 'entretien_1')
    addEvent('c1', 'entretien_1', 'preselectionne') // bounced back
    addEvent('c1', 'preselectionne', 'entretien_1') // and forward again

    const data = buildFunnel({})
    // Node counts use COUNT DISTINCT — this candidature touched preselectionne twice but counts once.
    expect(data.nodes.find(n => n.id === 'preselectionne')?.count).toBe(1)
    // Link postule->preselectionne value = 1 (one candidate did this once).
    expect(data.links.find(l => l.source === 'postule' && l.target === 'preselectionne')?.value).toBe(1)
  })

  it('returns labels from STATUT_LABELS for known statuses', () => {
    const data = buildFunnel({})
    const postule = data.nodes.find(n => n.id === 'postule')
    expect(postule?.label).toBeTruthy()
    expect(postule?.label).not.toBe('postule') // i.e. it was translated
  })
})

describe('buildFunnelFlow', () => {
  it('returns the candidates that traversed a specific link with their time-in-source', () => {
    const posteId = seedRolePoste()
    // Two candidates went postule → preselectionne, one stayed in postule.
    seedCandidature({ id: 'c1', posteId, statut: 'preselectionne' })
    seedCandidature({ id: 'c2', posteId, statut: 'preselectionne' })
    seedCandidature({ id: 'c3', posteId, statut: 'postule' })
    addEvent('c1', 'postule', 'preselectionne')
    addEvent('c2', 'postule', 'preselectionne')

    const flow = buildFunnelFlow({ source: 'postule', target: 'preselectionne' })
    expect(flow.total).toBe(2)
    expect(flow.candidates.map(c => c.candidature_id).sort()).toEqual(['c1', 'c2'])
    expect(flow.source_label).toBeTruthy()
    expect(flow.target_label).toBeTruthy()
    // Each candidate should carry a real (>= 0) day count.
    for (const c of flow.candidates) {
      expect(c.days_in_source).toBeGreaterThanOrEqual(0)
      expect(['ok', 'warn', 'over']).toContain(c.sla)
    }
  })

  it('returns empty when nobody walked the requested link', () => {
    const posteId = seedRolePoste()
    seedCandidature({ id: 'c1', posteId, statut: 'preselectionne' })
    addEvent('c1', 'postule', 'preselectionne')

    const flow = buildFunnelFlow({ source: 'postule', target: 'embauche' })
    expect(flow.total).toBe(0)
    expect(flow.candidates).toEqual([])
  })

  it('respects pole and days filters', () => {
    const javaId = seedRolePoste({ posteId: 'p-java', pole: 'java_modernisation' })
    const legacyId = seedRolePoste({ roleId: 'r2', posteId: 'p-legacy', pole: 'legacy' })
    seedCandidature({ id: 'c-java', posteId: javaId, statut: 'preselectionne' })
    seedCandidature({ id: 'c-legacy', posteId: legacyId, statut: 'preselectionne' })
    addEvent('c-java', 'postule', 'preselectionne')
    addEvent('c-legacy', 'postule', 'preselectionne')

    const javaOnly = buildFunnelFlow({ source: 'postule', target: 'preselectionne', pole: 'java_modernisation' })
    expect(javaOnly.candidates.map(c => c.candidature_id)).toEqual(['c-java'])
  })

  it('flags candidates above P90 as over-SLA', () => {
    const posteId = seedRolePoste()
    // Seed many fast transitions + one slow one. P90 threshold should fire.
    for (let i = 0; i < 9; i++) {
      seedCandidature({ id: `fast-${i}`, posteId, statut: 'preselectionne' })
      // candidature.created_at = now; event also "now" → ~0 days in source
      addEvent(`fast-${i}`, 'postule', 'preselectionne')
    }
    seedCandidature({ id: 'slow', posteId, statut: 'preselectionne', createdAt: "datetime('now', '-30 days')" })
    getDb().prepare("UPDATE candidatures SET created_at = datetime('now', '-30 days') WHERE id = 'slow'").run()
    addEvent('slow', 'postule', 'preselectionne')

    const flow = buildFunnelFlow({ source: 'postule', target: 'preselectionne' })
    const slow = flow.candidates.find(c => c.candidature_id === 'slow')
    expect(slow?.sla).toBe('over')
    expect(slow?.days_in_source).toBeGreaterThan(20)
  })
})

// Reference DB_PATH so the import isn't unused (vitest tree-shake tolerance)
void DB_PATH

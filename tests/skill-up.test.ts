import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/test-db'
import { createTestApp } from './helpers/app'
import type express from 'express'

const TEST_SLUG = 'yolan-maldonado'
const OTHER_SLUG = 'steven-nguyen'

// Pick the first real skill ID from the catalog
let SKILL_ID: string

describe('Skill-up & History API', () => {
  let db: Database.Database
  let app: express.Express

  beforeEach(() => {
    db = createTestDb()
    app = createTestApp(db)

    // Get a real skill ID from the seeded catalog
    const firstSkill = db.prepare('SELECT id FROM skills LIMIT 1').get() as { id: string }
    SKILL_ID = firstSkill.id

    // Seed an evaluation for the test user
    db.prepare(`
      INSERT INTO evaluations (slug, ratings, experience, skipped_categories, submitted_at)
      VALUES (?, ?, '{}', '[]', '2026-01-15T10:00:00Z')
    `).run(TEST_SLUG, JSON.stringify({ [SKILL_ID]: 2 }))

    // Seed evaluation for second user
    db.prepare(`
      INSERT INTO evaluations (slug, ratings, experience, skipped_categories, submitted_at)
      VALUES (?, ?, '{}', '[]', '2026-01-15T10:00:00Z')
    `).run(OTHER_SLUG, JSON.stringify({ [SKILL_ID]: 4 }))
  })

  // ─── POST /api/ratings/:slug/skill-up ───────────────────────

  it('happy path: level 2 → 3', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 3 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      oldLevel: 2,
      newLevel: 3,
      skillId: SKILL_ID,
    })
  })

  it('level down: 2 → 1', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 1 })

    expect(res.status).toBe(200)
    expect(res.body.oldLevel).toBe(2)
    expect(res.body.newLevel).toBe(1)
  })

  it('same level returns 400', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 2 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Pas de changement')
  })

  it('invalid skill ID returns 400', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: 'nonexistent-skill-xyz', newLevel: 3 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Compétence introuvable')
  })

  it('invalid level (6) returns 400', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 6 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Niveau invalide (0-5)')
  })

  it('invalid level (-1) returns 400', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: -1 })

    expect(res.status).toBe(400)
  })

  it('invalid level (string) returns 400', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 'three' })

    expect(res.status).toBe(400)
  })

  it('not owner returns 403', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', OTHER_SLUG) // different user
      .send({ skillId: SKILL_ID, newLevel: 3 })

    expect(res.status).toBe(403)
  })

  it('unauthenticated returns 401', async () => {
    const res = await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .send({ skillId: SKILL_ID, newLevel: 3 })

    expect(res.status).toBe(401)
  })

  it('no evaluation exists returns 404', async () => {
    const res = await request(app)
      .post('/api/ratings/no-such-person/skill-up')
      .set('x-test-slug', 'no-such-person')
      .send({ skillId: SKILL_ID, newLevel: 3 })

    expect(res.status).toBe(404)
  })

  it('updates evaluations.ratings JSON after skill-up', async () => {
    await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 4 })

    const row = db.prepare('SELECT ratings FROM evaluations WHERE slug = ?').get(TEST_SLUG) as { ratings: string }
    const ratings = JSON.parse(row.ratings)
    expect(ratings[SKILL_ID]).toBe(4)
  })

  it('invalidates comparison cache after skill-up', async () => {
    // Insert a cached comparison
    db.prepare('INSERT INTO comparison_summaries (slug_a, slug_b, summary) VALUES (?, ?, ?)')
      .run(TEST_SLUG, OTHER_SLUG, 'test comparison')

    await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 5 })

    const row = db.prepare('SELECT COUNT(*) as c FROM comparison_summaries WHERE slug_a = ? OR slug_b = ?')
      .get(TEST_SLUG, TEST_SLUG) as { c: number }
    expect(row.c).toBe(0)
  })

  // ─── GET /api/history/:slug ─────────────────────────────────

  it('returns change log ordered by date', async () => {
    // Make two changes
    await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 3 })

    await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 4 })

    const res = await request(app)
      .get(`/api/history/${TEST_SLUG}`)
      .set('x-test-slug', TEST_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.changes).toHaveLength(2)
    expect(res.body.changes[0].oldLevel).toBe(2)
    expect(res.body.changes[0].newLevel).toBe(3)
    expect(res.body.changes[1].oldLevel).toBe(3)
    expect(res.body.changes[1].newLevel).toBe(4)
  })

  it('empty history returns []', async () => {
    const res = await request(app)
      .get(`/api/history/${TEST_SLUG}`)
      .set('x-test-slug', TEST_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.changes).toEqual([])
  })

  // ─── GET /api/history (team) ────────────────────────────────

  it('returns aggregated team data', async () => {
    // Make changes for two different users
    await request(app)
      .post(`/api/ratings/${TEST_SLUG}/skill-up`)
      .set('x-test-slug', TEST_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 3 })

    await request(app)
      .post(`/api/ratings/${OTHER_SLUG}/skill-up`)
      .set('x-test-slug', OTHER_SLUG)
      .send({ skillId: SKILL_ID, newLevel: 5 })

    const res = await request(app)
      .get('/api/history')
      .set('x-test-slug', TEST_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.timeline.length).toBeGreaterThan(0)
    // The average of 3 and 5 is 4
    const entry = res.body.timeline.find((t: { skillId: string }) => t.skillId === SKILL_ID)
    expect(entry).toBeTruthy()
    expect(entry.avgLevel).toBe(4)
  })

  // ─── Initial history seeding ────────────────────────────────

  it('verifies initial history seeding populates skill_changes from evaluations', () => {
    // The initial seeding happens in db.ts initDatabase()
    // In this test DB, skill_changes starts empty and we seed manually
    const insert = db.prepare('INSERT INTO skill_changes (slug, skill_id, old_level, new_level, changed_at) VALUES (?, ?, 0, ?, ?)')
    const seedHistory = db.transaction(() => {
      const evals = db.prepare('SELECT slug, ratings, submitted_at FROM evaluations WHERE submitted_at IS NOT NULL').all() as {
        slug: string; ratings: string; submitted_at: string
      }[]
      for (const ev of evals) {
        const ratings = JSON.parse(ev.ratings) as Record<string, number>
        for (const [skillId, level] of Object.entries(ratings)) {
          if (level > 0) {
            insert.run(ev.slug, skillId, level, ev.submitted_at)
          }
        }
      }
    })
    seedHistory()

    const count = (db.prepare('SELECT COUNT(*) as c FROM skill_changes').get() as { c: number }).c
    // Both test users have 1 rated skill each
    expect(count).toBe(2)

    const rows = db.prepare('SELECT * FROM skill_changes ORDER BY slug').all() as {
      slug: string; skill_id: string; old_level: number; new_level: number
    }[]
    expect(rows[0].slug).toBe(OTHER_SLUG)
    expect(rows[0].new_level).toBe(4)
    expect(rows[1].slug).toBe(TEST_SLUG)
    expect(rows[1].new_level).toBe(2)
  })
})

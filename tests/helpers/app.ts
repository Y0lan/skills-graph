import express from 'express'
import type { Request, Response, NextFunction } from 'express'

interface TestStatement {
  get<T = unknown>(...params: unknown[]): T | undefined
  all<T = unknown>(...params: unknown[]): T[]
  run(...params: unknown[]): unknown
}

interface TestDatabase {
  prepare(sql: string): TestStatement
}

interface TestUser {
  id: string
  email: string
  name: string
  slug: string | null
}

/**
 * Build an Express app with test-specific auth middleware.
 * Auth is controlled via `x-test-slug` header (slug of the logged-in user).
 */
export function createTestApp(db: TestDatabase) {
  const app = express()
  app.use(express.json())

  // Test auth middleware: reads slug from x-test-slug header
  const testAuth: express.RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const slug = req.headers['x-test-slug'] as string | undefined
    if (!slug) {
      res.status(401).json({ error: 'Non authentifie' })
      return
    }
    ;(req as Request & { user: TestUser }).user = {
      id: `test-user-${slug}`,
      email: `${slug}@test.com`,
      name: slug,
      slug,
    }
    next()
  }

  const testOwnership: express.RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user: TestUser }).user
    if (!user?.slug || user.slug !== req.params.slug) {
      res.status(403).json({ error: 'Acces refuse' })
      return
    }
    next()
  }

  // Override getDb and catalog to use test DB
  // We need to set up the routes inline since we can't easily swap the DB module
  const { ratingsRoutes } = buildRatingsRoutes(db, testAuth, testOwnership)
  const { historyRoutes } = buildHistoryRoutes(db)

  app.use('/api', testAuth) // Global auth gate for tests
  app.use('/api/ratings', ratingsRoutes)
  app.use('/api/history', historyRoutes)

  return app
}

function buildRatingsRoutes(
  db: TestDatabase,
  _auth: express.RequestHandler,
  ownership: express.RequestHandler,
) {
  const router = express.Router()

  // Skill catalog lookup (from test DB)
  function getSkillById(id: string): boolean {
    const row = db.prepare('SELECT id FROM skills WHERE id = ?').get(id) as { id: string } | undefined
    return !!row
  }

  function getEvaluation(slug: string) {
    const row = db.prepare('SELECT * FROM evaluations WHERE slug = ?').get(slug) as {
      slug: string; ratings: string; experience: string
      skipped_categories: string; submitted_at: string | null; profile_summary: string | null
    } | undefined
    if (!row) return null
    return {
      ratings: JSON.parse(row.ratings) as Record<string, number>,
      experience: JSON.parse(row.experience),
      skippedCategories: JSON.parse(row.skipped_categories),
      submittedAt: row.submitted_at,
      profileSummary: row.profile_summary,
    }
  }

  // POST /:slug/skill-up
  router.post('/:slug/skill-up', ownership, (req, res) => {
    const slug = req.params.slug as string
    const { skillId, newLevel } = req.body

    if (!skillId || typeof skillId !== 'string') {
      res.status(400).json({ error: 'skillId requis' })
      return
    }
    if (!getSkillById(skillId)) {
      res.status(400).json({ error: 'Compétence introuvable' })
      return
    }
    if (!Number.isInteger(newLevel) || newLevel < 0 || newLevel > 5) {
      res.status(400).json({ error: 'Niveau invalide (0-5)' })
      return
    }

    const memberData = getEvaluation(slug)
    if (!memberData) {
      res.status(404).json({ error: 'Évaluation introuvable' })
      return
    }

    const oldLevel = memberData.ratings[skillId] ?? 0
    if (newLevel === oldLevel) {
      res.status(400).json({ error: 'Pas de changement' })
      return
    }

    db.prepare('INSERT INTO skill_changes (slug, skill_id, old_level, new_level) VALUES (?, ?, ?, ?)')
      .run(slug, skillId, oldLevel, newLevel)

    const updatedRatings = { ...memberData.ratings, [skillId]: newLevel }
    db.prepare('UPDATE evaluations SET ratings = ? WHERE slug = ?')
      .run(JSON.stringify(updatedRatings), slug)

    try {
      db.prepare('DELETE FROM comparison_summaries WHERE slug_a = ? OR slug_b = ?').run(slug, slug)
    } catch { /* */ }

    res.json({ ok: true, oldLevel, newLevel, skillId })
  })

  return { ratingsRoutes: router }
}

function buildHistoryRoutes(db: TestDatabase) {
  const router = express.Router()

  router.get('/:slug', (req, res) => {
    const slug = req.params.slug as string
    const rows = db.prepare(
      'SELECT skill_id, old_level, new_level, changed_at FROM skill_changes WHERE slug = ? ORDER BY changed_at ASC'
    ).all(slug) as { skill_id: string; old_level: number; new_level: number; changed_at: string }[]

    res.json({
      changes: rows.map(r => ({
        skillId: r.skill_id,
        oldLevel: r.old_level,
        newLevel: r.new_level,
        changedAt: r.changed_at,
      })),
    })
  })

  router.get('/', (_req, res) => {
    const rows = db.prepare(`
      SELECT skill_id, date(changed_at) as date, ROUND(AVG(new_level), 2) as avg_level
      FROM skill_changes
      GROUP BY skill_id, date(changed_at)
      ORDER BY date ASC
    `).all() as { skill_id: string; date: string; avg_level: number }[]

    res.json({
      timeline: rows.map(r => ({
        date: r.date,
        skillId: r.skill_id,
        avgLevel: r.avg_level,
      })),
    })
  })

  return { historyRoutes: router }
}

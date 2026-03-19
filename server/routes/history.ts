import { Router } from 'express'
import { getDb } from '../lib/db.js'

export const historyRouter = Router()

// GET /:slug — skill change history for a member
historyRouter.get('/:slug', (req, res) => {
  const slug = req.params.slug as string
  const db = getDb()

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

// GET / — aggregated team progression data for timeline charts
historyRouter.get('/', (_req, res) => {
  const db = getDb()

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

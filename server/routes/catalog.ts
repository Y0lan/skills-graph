import { Router } from 'express'
import { getSkillCategories, getRatingScale, getCalibrationPrompts } from '../lib/catalog.js'
import { getDb } from '../lib/db.js'

export const catalogRouter = Router()

catalogRouter.get('/', (req, res) => {
  const categories = getSkillCategories()
  const ratingScale = getRatingScale()
  const calibrationPrompts = getCalibrationPrompts()

  const pole = req.query.pole as string | undefined
  let poleCategoryIds: Set<string> | null = null
  if (pole) {
    const rows = getDb()
      .prepare('SELECT category_id FROM pole_categories WHERE pole = ?')
      .all(pole) as { category_id: string }[]
    poleCategoryIds = new Set(rows.map(r => r.category_id))
  }

  const body = {
    categories: categories.map((cat) => ({
      id: cat.id,
      label: cat.label,
      emoji: cat.emoji,
      skills: cat.skills,
      calibrationPrompt: calibrationPrompts[cat.id] ?? null,
      ...(poleCategoryIds != null && { isPoleCategory: poleCategoryIds.has(cat.id) }),
    })),
    ratingScale,
    ...(poleCategoryIds != null && { poleCategoryIds: [...poleCategoryIds] }),
  }

  res.json(body)
})

catalogRouter.get('/pole-categories/:pole', (req, res) => {
  const { pole } = req.params
  const validPoles = ['legacy', 'java_modernisation', 'fonctionnel']
  if (!validPoles.includes(pole)) {
    return res.status(400).json({ error: 'Pôle invalide' })
  }
  const rows = getDb()
    .prepare('SELECT category_id FROM pole_categories WHERE pole = ?')
    .all(pole) as { category_id: string }[]
  res.json(rows.map(r => r.category_id))
})

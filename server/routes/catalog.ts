import { Router } from 'express'
import { getSkillCategories, getRatingScale, getCalibrationPrompts } from '../lib/catalog.js'

export const catalogRouter = Router()

catalogRouter.get('/', (_req, res) => {
  const categories = getSkillCategories()
  const ratingScale = getRatingScale()
  const calibrationPrompts = getCalibrationPrompts()

  const body = {
    categories: categories.map((cat) => ({
      id: cat.id,
      label: cat.label,
      emoji: cat.emoji,
      skills: cat.skills,
      calibrationPrompt: calibrationPrompts[cat.id] ?? null,
    })),
    ratingScale,
  }

  res.json(body)
})

import { Router } from 'express'
import { computeMemberAggregate, computeTeamAggregate } from '../lib/aggregates.js'

export const aggregatesRouter = Router()

// GET / — team aggregate
aggregatesRouter.get('/', (_req, res) => {
  const result = computeTeamAggregate()
  res.json(result)
})

// GET /:slug — single member aggregate
aggregatesRouter.get('/:slug', (req, res) => {
  const { slug } = req.params
  const result = computeMemberAggregate(slug)

  if (!result) {
    res.status(404).json({ error: 'Membre introuvable' })
    return
  }

  res.json(result)
})

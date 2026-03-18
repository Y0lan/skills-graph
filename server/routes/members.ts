import { Router } from 'express'
import { teamMembers } from '../data/team-roster.js'

export const membersRouter = Router()

// GET / — team roster
membersRouter.get('/', (_req, res) => {
  res.json(teamMembers)
})

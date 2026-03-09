import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, '..', 'data', 'ratings.json')

// Hardcoded roster slugs — must match src/data/team-roster.ts
const VALID_SLUGS = new Set([
  'yolan-maldonado',
  'alexandre-thomas',
  'alan-huitel',
  'pierre-mathieu-barras',
  'andy-malo',
  'steven-nguyen',
  'matthieu-alcime',
  'martin-vallet',
  'nicole-nguon',
  'bethlehem-mengistu',
  'pierre-rossato',
])

function readData(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeData(data: Record<string, unknown>): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export const ratingsRouter = Router()

// GET / — all ratings
ratingsRouter.get('/', (_req, res) => {
  const data = readData()
  res.json(data)
})

// GET /:slug — single member
ratingsRouter.get('/:slug', (req, res) => {
  const { slug } = req.params

  if (!VALID_SLUGS.has(slug)) {
    res.status(404).json({ error: 'Member not found' })
    return
  }

  const data = readData()
  const memberData = data[slug] as Record<string, unknown> | undefined

  if (!memberData) {
    res.json({
      ratings: {},
      experience: {},
      skippedCategories: [],
      submittedAt: null,
    })
    return
  }

  res.json(memberData)
})

// PUT /:slug — upsert ratings
ratingsRouter.put('/:slug', (req, res) => {
  const { slug } = req.params

  if (!VALID_SLUGS.has(slug)) {
    res.status(404).json({ error: 'Member not found' })
    return
  }

  const { ratings, experience, skippedCategories } = req.body

  // Validate ratings
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
    res.status(400).json({ error: 'Invalid ratings: must be an object' })
    return
  }

  for (const [, value] of Object.entries(ratings)) {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 5) {
      res.status(400).json({ error: 'Invalid ratings: values must be integers 0-5' })
      return
    }
  }

  // Validate experience (optional)
  const expObj = experience ?? {}
  if (typeof expObj !== 'object' || Array.isArray(expObj)) {
    res.status(400).json({ error: 'Invalid experience: must be an object' })
    return
  }

  for (const [, value] of Object.entries(expObj)) {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 4) {
      res.status(400).json({ error: 'Invalid experience: values must be integers 0-4' })
      return
    }
  }

  // Validate skippedCategories (optional)
  const skipped = skippedCategories ?? []
  if (!Array.isArray(skipped)) {
    res.status(400).json({ error: 'Invalid skippedCategories: must be an array' })
    return
  }

  const memberData = {
    ratings,
    experience: expObj,
    skippedCategories: skipped,
    submittedAt: new Date().toISOString(),
  }

  const data = readData()
  data[slug] = memberData
  writeData(data)

  res.json(memberData)
})

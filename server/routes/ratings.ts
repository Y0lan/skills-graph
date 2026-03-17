import { Router } from 'express'
import { teamMembers } from '../../src/data/team-roster.js'
import { getAllEvaluations, getEvaluation, upsertEvaluation, submitEvaluation, deleteEvaluation, getDb } from '../lib/db.js'
import { computeMemberAggregate } from '../lib/aggregates.js'
import { generateProfileSummary } from '../lib/summary.js'
import { requireAuth, requireOwnership } from '../middleware/require-auth.js'

const VALID_SLUGS = new Set(teamMembers.map(m => m.slug))

export const ratingsRouter = Router()

// GET / — all ratings (public)
ratingsRouter.get('/', (_req, res) => {
  res.json(getAllEvaluations())
})

// GET /:slug — single member (public)
ratingsRouter.get('/:slug', (req, res) => {
  const slug = req.params.slug as string

  if (!VALID_SLUGS.has(slug)) {
    res.status(404).json({ error: 'Membre introuvable' })
    return
  }

  const memberData = getEvaluation(slug)

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

// PUT /:slug — upsert ratings (auth + ownership required)
ratingsRouter.put('/:slug', requireAuth, requireOwnership, (req, res) => {
  const slug = req.params.slug as string

  if (!VALID_SLUGS.has(slug)) {
    res.status(404).json({ error: 'Membre introuvable' })
    return
  }

  const { ratings, experience, skippedCategories } = req.body

  // Validate ratings
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
    res.status(400).json({ error: 'Évaluations invalides : doit être un objet' })
    return
  }

  for (const [, value] of Object.entries(ratings)) {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 5) {
      res.status(400).json({ error: 'Évaluations invalides : les valeurs doivent être des entiers entre 0 et 5' })
      return
    }
  }

  // Validate experience (optional)
  const expObj = experience ?? {}
  if (typeof expObj !== 'object' || Array.isArray(expObj)) {
    res.status(400).json({ error: 'Expérience invalide : doit être un objet' })
    return
  }

  for (const [, value] of Object.entries(expObj)) {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 4) {
      res.status(400).json({ error: 'Expérience invalide : les valeurs doivent être des entiers entre 0 et 4' })
      return
    }
  }

  // Validate skippedCategories (optional)
  const skipped = skippedCategories ?? []
  if (!Array.isArray(skipped)) {
    res.status(400).json({ error: 'Catégories ignorées invalides : doit être un tableau' })
    return
  }

  const memberData = upsertEvaluation(slug, ratings, expObj, skipped)

  res.json(memberData)
})

// DELETE /:slug — reset evaluation (auth + ownership required)
ratingsRouter.delete('/:slug', requireAuth, requireOwnership, (req, res) => {
  const slug = req.params.slug as string

  if (!VALID_SLUGS.has(slug)) {
    res.status(404).json({ error: 'Membre introuvable' })
    return
  }

  deleteEvaluation(slug)
  res.json({ ok: true })
})

// POST /:slug/submit — finalize evaluation (auth + ownership required)
ratingsRouter.post('/:slug/submit', requireAuth, requireOwnership, async (req, res) => {
  const slug = req.params.slug as string

  if (!VALID_SLUGS.has(slug)) {
    res.status(404).json({ error: 'Membre introuvable' })
    return
  }

  const memberData = getEvaluation(slug)

  if (!memberData || Object.keys(memberData.ratings).length === 0) {
    res.status(400).json({ error: 'Aucune évaluation à soumettre' })
    return
  }

  submitEvaluation(slug)

  // Generate LLM summary (≤10s, returns null on failure)
  try {
    const aggregate = computeMemberAggregate(slug)
    if (aggregate) {
      const summary = await generateProfileSummary(
        aggregate.memberName,
        aggregate.role,
        aggregate.categories.map(c => ({
          label: c.categoryLabel,
          avgRank: c.avgRank,
          targetRank: c.targetRank,
          gap: c.gap,
        })),
      )
      if (summary) {
        getDb().prepare('UPDATE evaluations SET profile_summary = ? WHERE slug = ?').run(summary, slug)
      }
    }
  } catch (err) {
    console.error('[SUMMARY] Generation failed during submit:', err)
  }

  // Re-read after potential summary write so response includes profileSummary
  res.json(getEvaluation(slug))
})

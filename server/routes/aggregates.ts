import { Router } from 'express'
import { computeMemberAggregate, computeTeamAggregate } from '../lib/aggregates.js'
import { generateComparisonSummary } from '../lib/summary.js'
import { getDb } from '../lib/db.js'
import { requireAuth } from '../middleware/require-auth.js'

export const aggregatesRouter = Router()

// GET / — team aggregate (optional ?pole=xxx for pole-filtered view)
aggregatesRouter.get('/', (req, res) => {
  const pole = req.query.pole as string | undefined
  const result = computeTeamAggregate(pole)
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

  const categoryAverages = Object.fromEntries(result.categories.map((c) => [c.categoryId, c.avgRank]))
  const ratedCategoryIds = Object.entries(categoryAverages)
    .filter(([, avg]) => (avg as number) > 0)
    .map(([catId]) => catId)

  res.json({ ...result, ratedCategoryIds })
})

// POST /compare — AI comparison of two members
aggregatesRouter.post('/compare', requireAuth, async (req, res) => {
  const { slugA, slugB } = req.body
  if (!slugA || !slugB || typeof slugA !== 'string' || typeof slugB !== 'string' || slugA === slugB) {
    res.status(400).json({ error: 'Deux slugs différents requis' })
    return
  }

  // Normalize order so A-vs-B = B-vs-A
  const [normA, normB] = slugA < slugB ? [slugA, slugB] : [slugB, slugA]

  try {
    // Check cache
    const cached = getDb()
      .prepare('SELECT summary FROM comparison_summaries WHERE slug_a = ? AND slug_b = ?')
      .get(normA, normB) as { summary: string } | undefined

    if (cached) {
      res.json({ summary: cached.summary })
      return
    }

    const aggA = computeMemberAggregate(normA)
    const aggB = computeMemberAggregate(normB)

    if (!aggA || !aggB) {
      res.status(404).json({ error: 'Membre introuvable' })
      return
    }

    const toCats = (agg: typeof aggA) => agg!.categories.map(c => ({
      label: c.categoryLabel, avgRank: c.avgRank, targetRank: c.targetRank, gap: c.gap,
    }))

    const summary = await generateComparisonSummary(
      aggA.memberName, aggA.role, toCats(aggA),
      aggB.memberName, aggB.role, toCats(aggB),
    )

    if (summary) {
      getDb().prepare(
        'INSERT OR REPLACE INTO comparison_summaries (slug_a, slug_b, summary) VALUES (?, ?, ?)'
      ).run(normA, normB, summary)
    }

    res.json({ summary: summary ?? null })
  } catch (err) {
    console.error('[COMPARISON] Failed:', err)
    res.status(500).json({ summary: null, error: 'Génération échouée' })
  }
})

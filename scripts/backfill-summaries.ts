import { initDatabase, getAllEvaluations, getDb } from '../server/lib/db.js'
import { computeMemberAggregate } from '../server/lib/aggregates.js'
import { generateProfileSummary } from '../server/lib/summary.js'

initDatabase()
const all = getAllEvaluations()
const db = getDb()

for (const [slug, eval_] of Object.entries(all)) {
  if (!eval_.submittedAt) continue
  if (eval_.profileSummary) {
    console.log(`[SKIP] ${slug} — already has summary`)
    continue
  }

  const agg = computeMemberAggregate(slug)
  if (!agg) continue

  const summary = await generateProfileSummary(
    agg.memberName,
    agg.role,
    agg.categories.map(c => ({
      label: c.categoryLabel,
      avgRank: c.avgRank,
      targetRank: c.targetRank,
      gap: c.gap,
    })),
  )

  if (summary) {
    db.prepare('UPDATE evaluations SET profile_summary = ? WHERE slug = ?').run(summary, slug)
    console.log(`[OK] ${slug}`)
  } else {
    console.log(`[FAIL] ${slug}`)
  }
}

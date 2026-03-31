import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './db.js'
import { computeTeamAggregate } from './aggregates.js'
import { getSkillCategories } from './catalog.js'
import type { CandidateRow } from './types.js'

export async function generateCandidateAnalysis(candidateId: string): Promise<string> {
  const db = getDb()
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId) as CandidateRow | undefined
  if (!candidate) throw new Error('Candidat introuvable')
  if (!candidate.submitted_at) throw new Error('Le candidat n\'a pas encore soumis son évaluation')

  // Return cached report if it exists
  if (candidate.ai_report) return candidate.ai_report

  const ratings: Record<string, number> = JSON.parse(candidate.ratings)
  const teamAggregate = computeTeamAggregate()
  const categories = getSkillCategories()

  // Build category-level summaries for the candidate
  const candidateByCategory = categories.map(cat => {
    const skills = cat.skills.map(s => ({
      label: s.label,
      score: ratings[s.id] ?? 0,
    })).filter(s => s.score > 0)
    const avg = skills.length > 0 ? skills.reduce((a, b) => a + b.score, 0) / skills.length : 0
    return {
      category: cat.label,
      average: Math.round(avg * 10) / 10,
      skills,
    }
  }).filter(c => c.skills.length > 0)

  // Build team average by category
  const teamByCategory = categories.map(cat => {
    const members = teamAggregate.members || []
    const avgs = members.map(m => m.categoryAverages?.[cat.id] ?? 0).filter(v => v > 0)
    return {
      category: cat.label,
      average: avgs.length > 0 ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : 0,
      memberCount: avgs.length,
    }
  })

  // Sanitize inputs for prompt injection protection
  const safeName = candidate.name.replace(/[<>&]/g, '').slice(0, 100)
  const safeRole = candidate.role.replace(/[<>&]/g, '').slice(0, 100)

  const prompt = `Tu es un expert en recrutement et gestion d'équipe technique. Analyse ce candidat par rapport à l'équipe existante.

IMPORTANT : Ceci est une évaluation initiale basée sur l'auto-évaluation du candidat. Les scores ne sont PAS calibrés contre les standards de l'équipe — ils doivent être validés en entretien.

ÉCHELLE : 0 = Inconnu, 1 = Notions, 2 = Guidé, 3 = Autonome, 4 = Avancé, 5 = Expert

ÉQUIPE (${teamAggregate.members?.length ?? 0} membres, moyennes par catégorie) :
${teamByCategory.map(c => `- ${c.category}: ${c.average}/5 (${c.memberCount} membres)`).join('\n')}

CANDIDAT : <candidate_name>${safeName}</candidate_name>, poste visé : <candidate_role>${safeRole}</candidate_role>
${candidateByCategory.map(c => `- ${c.category}: ${c.average}/5 (${c.skills.map(s => `${s.label}: ${s.score}`).join(', ')})`).join('\n')}

Génère un rapport structuré :

1. **Compétences comblées** — Quels gaps de l'équipe ce candidat comble-t-il ? Cite les compétences spécifiques avec les niveaux.

2. **Compétences toujours manquantes** — Même avec ce candidat, quels gaps restent ?

3. **Rôles/profils manquants** — Au-delà de ce candidat, quels profils manquent à l'équipe ? Utilise ton bon sens : regarde les catégories faibles, les compétences où personne ne dépasse L2, les single points of failure.

4. **Complémentarité** — Comment ce candidat s'intègre-t-il ? Est-il un doublon d'un profil existant ou apporte-t-il quelque chose de nouveau ?

5. **Verdict** — Évaluation initiale : Match fort / Match partiel / Match faible. Justifie en 2 phrases. Rappelle que ces résultats sont basés sur l'auto-évaluation et doivent être confirmés en entretien.`

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const report = message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  // Cache the report
  db.prepare('UPDATE candidates SET ai_report = ? WHERE id = ?').run(report, candidateId)

  console.log(`[AI] Generated candidate analysis for ${safeName} (${candidateId})`)

  return report
}

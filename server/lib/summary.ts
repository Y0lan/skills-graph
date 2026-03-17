import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `Tu es un coach technique bienveillant spécialisé dans le développement des compétences.

Règles :
- Exactement 2-3 phrases en un seul paragraphe fluide
- Ton professionnel, bienveillant et motivant
- Commence par les forces, puis mentionne les axes de progression
- Ne répète pas les scores numériques — le tableau les affiche déjà
- Pas de bullet points, pas de titres, pas d'émoji
- Maximum 150 mots
- Écris en français`

export async function generateProfileSummary(
  memberName: string,
  role: string,
  categories: { label: string; avgRank: number; targetRank: number; gap: number }[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log('[SUMMARY] No ANTHROPIC_API_KEY — skipping')
    return null
  }

  const client = new Anthropic({ apiKey, timeout: 10_000 })

  const strengths = categories.filter(c => c.avgRank > 0).sort((a, b) => b.avgRank - a.avgRank).slice(0, 3)
  const gaps = categories.filter(c => c.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3)

  const userPrompt = `Profil de compétences de ${memberName} (${role}) :

Points forts (score moyen sur 5) :
${strengths.map(s => `- ${s.label} : ${s.avgRank.toFixed(1)}/5`).join('\n')}

Axes d'amélioration (écart vs cible) :
${gaps.length > 0 ? gaps.map(g => `- ${g.label} : ${g.avgRank.toFixed(1)}/5 (cible : ${g.targetRank})`).join('\n') : '- Aucun écart significatif'}`

  try {
    const startMs = Date.now()
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : null
    console.log(`[SUMMARY] Generated for ${memberName} in ${Date.now() - startMs}ms`)
    return text || null
  } catch (err) {
    console.error('[SUMMARY] LLM generation failed:', err)
    return null
  }
}

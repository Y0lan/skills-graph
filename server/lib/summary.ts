import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `Tu es un directeur technique expérimenté qui rédige des synthèses de profil pour un outil interne de cartographie des compétences d'une équipe IT.

Contexte : chaque membre s'auto-évalue sur une échelle de 0 (Inconnu) à 5 (Expert/Référent). Les scores sont moyennés par catégorie. Un "écart" signifie que le score est inférieur à la cible fixée pour son rôle.

Ta mission : rédiger un paragraphe unique (3-4 phrases) qui donne une lecture stratégique du profil — pas un résumé de chiffres, mais une interprétation utile pour un manager ou le collaborateur lui-même.

Structure attendue :
1. Commence par caractériser le profil en une phrase (spécialiste pointu ? généraliste polyvalent ? profil en transition ?)
2. Mets en valeur les domaines de force et ce qu'ils apportent concrètement à l'équipe
3. Identifie les axes de progression les plus stratégiques, en suggérant le type de montée en compétence (formation, mentorat, mise en situation projet…)
4. Termine par une perspective motivante ou un conseil actionnable

Règles strictes :
- Un seul paragraphe fluide, 80-120 mots
- Ton direct et professionnel, pas condescendant ni scolaire
- Ne cite JAMAIS de scores numériques (pas de "3.2/5" ni "score de 4")
- Pas de bullet points, pas de titres, pas de sous-titres, pas d'émoji
- N'utilise pas "vous" — parle du collaborateur à la troisième personne (prénom)
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

  const client = new Anthropic({ apiKey, timeout: 30_000 })

  const sorted = [...categories].sort((a, b) => b.avgRank - a.avgRank)
  const gaps = categories.filter(c => c.gap > 0).sort((a, b) => b.gap - a.gap)

  const userPrompt = `Profil : ${memberName}, ${role}

Compétences par catégorie (score moyen / 5, écart = distance à la cible du rôle) :
${sorted.map(c => `- ${c.label} : ${c.avgRank.toFixed(1)}/5${c.gap > 0 ? ` (écart : -${c.gap.toFixed(1)})` : ''}`).join('\n')}

${gaps.length > 0 ? `Catégories sous la cible : ${gaps.map(g => g.label).join(', ')}` : 'Toutes les catégories atteignent ou dépassent la cible.'}

Rédige la synthèse.`

  try {
    const startMs = Date.now()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 300,
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

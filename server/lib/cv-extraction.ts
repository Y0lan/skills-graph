import { extractText } from 'unpdf'
import Anthropic from '@anthropic-ai/sdk'
import type { SkillCategory } from '../../src/data/skill-catalog.js'
import { filterValidRatings } from './validation.js'

/**
 * Extract raw text from a PDF buffer using unpdf.
 */
export async function extractCvText(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer)
  const { text } = await extractText(data)
  return text
}

/**
 * Use Claude tool_use to extract skill ratings from CV text,
 * matched against the full skill catalog.
 * Returns a map of skill IDs to ratings (0-5), or null if extraction fails.
 */
export async function extractSkillsFromCv(
  cvText: string,
  catalog: SkillCategory[],
): Promise<Record<string, number> | null> {
  if (cvText.length < 50) return null

  const catalogDescription = catalog.map(cat => {
    const skills = cat.skills.map(s => {
      const levels = s.descriptors
        .filter(d => d.level === 0 || d.level === 2 || d.level === 4)
        .map(d => `L${d.level}: ${d.description}`)
        .join(' | ')
      return `  - ${s.id} (${s.label}): ${levels}`
    }).join('\n')
    return `${cat.emoji} ${cat.label}:\n${skills}`
  }).join('\n\n')

  const prompt = `Tu es un expert en recrutement technique. Analyse le CV ci-dessous et extrais les compétences identifiables en te basant sur le référentiel de compétences fourni.

RÈGLES :
- Sois conservateur : en cas de doute, attribue L2 ou L3.
- Ne suggère un rating QUE pour les compétences clairement identifiables dans le CV.
- Si une compétence n'apparaît pas dans le CV, ne l'inclus PAS.
- Base-toi sur l'expérience décrite, les projets, les certifications et les technologies mentionnées.

RÉFÉRENTIEL DE COMPÉTENCES (niveaux 0, 2 et 4 pour référence) :
${catalogDescription}

CV DU CANDIDAT :
<cv_document>
${cvText}
</cv_document>

Utilise l'outil submit_skill_ratings pour soumettre tes suggestions de ratings.`

  const tools: Anthropic.Messages.Tool[] = [{
    name: 'submit_skill_ratings',
    description: 'Submit the extracted skill ratings from the CV',
    input_schema: {
      type: 'object' as const,
      properties: {
        suggestions: {
          type: 'object',
          description: 'Map of skill IDs to suggested rating levels (0-5)',
          additionalProperties: { type: 'number', minimum: 0, maximum: 5 },
        },
      },
      required: ['suggestions'],
    },
  }]

  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 4096,
      tools,
      tool_choice: { type: 'tool', name: 'submit_skill_ratings' },
      messages: [{ role: 'user', content: prompt }],
    })

    const toolBlock = message.content.find(b => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') return null

    const input = toolBlock.input as { suggestions?: Record<string, unknown> }
    if (!input.suggestions) return null

    const valid = filterValidRatings(input.suggestions)
    if (Object.keys(valid).length === 0) return null

    return valid
  } catch (err) {
    console.error('[CV extraction] Claude call failed:', err)
    return null
  }
}

import { extractText } from 'unpdf'
import Anthropic from '@anthropic-ai/sdk'

export interface AboroProfile {
  traits: {
    leadership: { ascendant: number; conviction: number; sociabilite: number; diplomatie: number }
    prise_en_compte: { implication: number; ouverture: number; critique: number; consultation: number }
    creativite: { taches_variees: number; abstraction: number; inventivite: number; changement: number }
    rigueur: { methode: number; details: number; perseverance: number; initiative: number }
    equilibre: { detente: number; positivite: number; controle: number; stabilite: number }
  }
  talent_cloud: Record<string, string>
  talents: string[]
  axes_developpement: string[]
}

/**
 * Extract text from an Aboro/SWIPE PDF.
 */
export async function extractAboroText(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer)
  const result = await extractText(data)
  return Array.isArray(result.text) ? result.text.join('\n') : result.text
}

/**
 * Extract structured behavioral profile from Aboro/SWIPE PDF text using Claude.
 * Single API call with tool_use — the PDF text is already well-structured.
 */
export async function extractAboroProfile(pdfText: string): Promise<AboroProfile> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    temperature: 0,
    system: `Tu es un expert en analyse de profils comportementaux. Tu extrais les données structurées d'un rapport Âboro/SWIPE (AssessFirst).

Le rapport contient :
1. **20 traits comportementaux** notés de 1 à 10, répartis en 5 axes :
   - Leadership/Influence : ascendant, conviction, sociabilite, diplomatie
   - Prise en compte des autres : implication, ouverture, critique, consultation
   - Créativité/Adaptabilité : taches_variees, abstraction, inventivite, changement
   - Rigueur dans le travail : methode, details, perseverance, initiative
   - Équilibre personnel : detente, positivite, controle, stabilite

2. **Talent Cloud** : 15 compétences avec un niveau parmi : distinctif, avere, mobilisable, a_developper, non_developpe

3. **Talents** : liste de points forts qualitatifs
4. **Axes de développement** : liste de points à améliorer

Extrais TOUTES les données présentes. Si un score n'est pas trouvé, utilise 5 (valeur médiane).`,
    messages: [{
      role: 'user',
      content: `Voici le rapport Âboro/SWIPE à analyser :

<aboro_report>
${pdfText}
</aboro_report>

Extrais le profil comportemental structuré.`,
    }],
    tools: [{
      name: 'submit_aboro_profile',
      description: 'Submit the extracted behavioral profile from the Aboro/SWIPE report',
      input_schema: {
        type: 'object' as const,
        properties: {
          traits: {
            type: 'object' as const,
            description: 'The 20 behavioral traits scored 1-10, grouped by 5 axes',
            properties: {
              leadership: {
                type: 'object' as const,
                properties: {
                  ascendant: { type: 'number' as const, description: 'Prend l\'ascendant sur les autres (1-10)' },
                  conviction: { type: 'number' as const, description: 'Cherche à convaincre les autres (1-10)' },
                  sociabilite: { type: 'number' as const, description: 'Va spontanément vers les autres (1-10)' },
                  diplomatie: { type: 'number' as const, description: 'Fait preuve de diplomatie (1-10)' },
                },
                required: ['ascendant', 'conviction', 'sociabilite', 'diplomatie'],
              },
              prise_en_compte: {
                type: 'object' as const,
                properties: {
                  implication: { type: 'number' as const, description: 'S\'implique affectivement (1-10)' },
                  ouverture: { type: 'number' as const, description: 'S\'ouvre aux idées des autres (1-10)' },
                  critique: { type: 'number' as const, description: 'Accepte les critiques émises (1-10)' },
                  consultation: { type: 'number' as const, description: 'Consulte avant de décider (1-10)' },
                },
                required: ['implication', 'ouverture', 'critique', 'consultation'],
              },
              creativite: {
                type: 'object' as const,
                properties: {
                  taches_variees: { type: 'number' as const, description: 'Est attiré par les tâches variées (1-10)' },
                  abstraction: { type: 'number' as const, description: 'S\'intéresse aux choses abstraites (1-10)' },
                  inventivite: { type: 'number' as const, description: 'Fait preuve d\'inventivité (1-10)' },
                  changement: { type: 'number' as const, description: 'S\'adapte aux changements (1-10)' },
                },
                required: ['taches_variees', 'abstraction', 'inventivite', 'changement'],
              },
              rigueur: {
                type: 'object' as const,
                properties: {
                  methode: { type: 'number' as const, description: 'S\'organise avec méthode (1-10)' },
                  details: { type: 'number' as const, description: 'S\'attache aux détails (1-10)' },
                  perseverance: { type: 'number' as const, description: 'Persévère face aux obstacles (1-10)' },
                  initiative: { type: 'number' as const, description: 'Va au-delà des tâches prescrites (1-10)' },
                },
                required: ['methode', 'details', 'perseverance', 'initiative'],
              },
              equilibre: {
                type: 'object' as const,
                properties: {
                  detente: { type: 'number' as const, description: 'Se montre détendu (1-10)' },
                  positivite: { type: 'number' as const, description: 'S\'attache aux aspects positifs (1-10)' },
                  controle: { type: 'number' as const, description: 'Contrôle ses émotions (1-10)' },
                  stabilite: { type: 'number' as const, description: 'Recherche la stabilité (1-10)' },
                },
                required: ['detente', 'positivite', 'controle', 'stabilite'],
              },
            },
            required: ['leadership', 'prise_en_compte', 'creativite', 'rigueur', 'equilibre'],
          },
          talent_cloud: {
            type: 'object' as const,
            description: 'Talent Cloud: 15 competencies with their level. Keys are competency names in French, values are one of: distinctif, avere, mobilisable, a_developper, non_developpe',
            additionalProperties: { type: 'string' as const },
          },
          talents: {
            type: 'array' as const,
            description: 'List of key talents/strengths from the profile synthesis',
            items: { type: 'string' as const },
          },
          axes_developpement: {
            type: 'array' as const,
            description: 'List of development areas from the profile synthesis',
            items: { type: 'string' as const },
          },
        },
        required: ['traits', 'talent_cloud', 'talents', 'axes_developpement'],
      },
    }],
    tool_choice: { type: 'tool' as const, name: 'submit_aboro_profile' },
  })

  // Extract tool use result
  const toolUse = response.content.find(c => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use response for Aboro extraction')
  }

  const profile = toolUse.input as AboroProfile

  // Validate: all trait scores should be 1-10
  for (const axis of Object.values(profile.traits)) {
    for (const [key, val] of Object.entries(axis)) {
      const num = Number(val)
      if (isNaN(num) || num < 1 || num > 10) {
        (axis as Record<string, number>)[key] = 5 // fallback to median
      }
    }
  }

  return profile
}

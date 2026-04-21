import { extractText } from 'unpdf'
import mammoth from 'mammoth'
import Anthropic from '@anthropic-ai/sdk'
import type { SkillCategory } from '../../src/data/skill-catalog.js'
import { filterValidRatings } from './validation.js'
import { callAnthropicTool } from './anthropic-tool.js'

// Bump when the extraction prompt/schema changes meaningfully. Used in run
// records (cv_extraction_runs) so the history/diff UI can show WHY outputs
// differ between runs — prompt upgrades don't look like candidate changes.
export const PROMPT_VERSION = 2

export const EXTRACTION_MODEL = 'claude-sonnet-4-20250514'

/**
 * Context about the target poste, used to make extraction role-aware.
 * Phase 0 wires the type but does not use it (role-neutral baseline only).
 * Phase 3 adds the role-aware delta pass that consumes this.
 */
export interface PosteContext {
  posteId: string
  titre: string
  description: string | null
  requirements?: Array<{
    skillId: string
    targetLevel: number
    importance: 'requis' | 'apprecie'
  }>
}

/**
 * Per-category worked examples for CV extraction prompts.
 * Each example shows a CV excerpt and the expected skill ratings with reasoning.
 * Co-located here (not inline in the template) so they're easy to update
 * when categories or skills change.
 */
const CV_WORKED_EXAMPLES: Record<string, string> = {
  'core-engineering': `CV : "5 ans d'expérience Java, dont 2 ans en tant que tech lead Spring Boot. Scripts Bash pour le CI. Git flow avec rebase."
→ java: 4 (reasoning: "5 ans + tech lead = L4 Avancé")
→ bash-shell: 3 (reasoning: "scripts CI en production = L3 Autonome")
→ git-branching: 3 (reasoning: "git flow + rebase = L3 Autonome")`,

  'backend-integration': `CV : "Architecte API REST microservices, 3 ans Spring Boot, mise en place de RabbitMQ pour l'événementiel. DDD appliqué sur le domaine paiement."
→ spring-boot: 4 (reasoning: "3 ans + architecture microservices = L4")
→ api-design: 4 (reasoning: "architecte API REST = L4 Avancé")
→ messaging: 3 (reasoning: "mise en place RabbitMQ = L3 Autonome")
→ ddd: 3 (reasoning: "DDD appliqué sur un domaine = L3 Autonome")`,

  'frontend-ui': `CV : "Développeur Angular 2 ans, migration AngularJS vers Angular 14. Composants accessibles avec ARIA."
→ angular: 3 (reasoning: "2 ans + migration = L3 Autonome")
→ html-css-scss: 3 (reasoning: "composants accessibles implique maîtrise HTML/CSS = L3")
→ accessibility-design-system: 2 (reasoning: "ARIA mentionné mais pas de rôle de référent = L2 Guidé")`,

  'platform-engineering': `CV : "DevOps 4 ans, pipelines GitLab CI/CD, déploiement Kubernetes en production, Terraform pour l'infra AWS."
→ gitlab-ci: 4 (reasoning: "4 ans + pipelines CI/CD = L4 Avancé")
→ kubernetes: 3 (reasoning: "déploiement production = L3 Autonome")
→ terraform-opentofu: 3 (reasoning: "Terraform infra AWS = L3 Autonome")
→ docker-podman: 3 (reasoning: "implicite avec K8s = L3 Autonome")`,

  'observability-reliability': `CV : "Mise en place de la stack Prometheus + Grafana pour le monitoring. Définition des SLO avec l'équipe produit."
→ prometheus: 3 (reasoning: "mise en place de la stack = L3 Autonome")
→ grafana: 3 (reasoning: "mise en place Grafana = L3 Autonome")
→ slo-sla-alerting: 3 (reasoning: "définition des SLO = L3 Autonome")`,

  'security-compliance': `CV : "Intégration OAuth2/OIDC pour le SSO. Audit de sécurité des dépendances avec Snyk."
→ iam-authn: 3 (reasoning: "intégration SSO OAuth2/OIDC = L3 Autonome")
→ supply-chain: 2 (reasoning: "audit Snyk = utilisation guidée = L2")`,

  'architecture-governance': `CV : "Rédaction d'ADR pour les choix techniques. Modélisation C4 de l'architecture cible. Documentation technique avec Structurizr."
→ adrs: 3 (reasoning: "rédaction d'ADR = L3 Autonome")
→ c4-structurizr: 3 (reasoning: "modélisation C4 + Structurizr = L3 Autonome")
→ technical-documentation: 3 (reasoning: "documentation technique = L3 Autonome")`,

  'soft-skills-delivery': `CV : "Scrum Master certifié, animation des cérémonies agiles. Mentorat de 3 développeurs juniors."
→ agile-scrum: 4 (reasoning: "Scrum Master certifié + animation = L4 Avancé")
→ mentoring: 3 (reasoning: "mentorat de juniors = L3 Autonome")`,

  'domain-knowledge': `CV : "3 ans à la CAFAT, gestion du recouvrement social et traitement des travailleurs indépendants."
→ reglementation-sociale: 3 (reasoning: "3 ans CAFAT = L3 Autonome")
→ processus-recouvrement: 3 (reasoning: "gestion recouvrement = L3 Autonome")
→ travailleurs-independants: 3 (reasoning: "traitement TI = L3 Autonome")`,

  'ai-engineering': `CV : "Intégration de l'API Claude dans un outil interne. RAG avec Pinecone pour la base de connaissances."
→ llm-api-integration: 3 (reasoning: "intégration API Claude en production = L3 Autonome")
→ rag-knowledge-bases: 3 (reasoning: "RAG + Pinecone = L3 Autonome")
→ prompt-engineering: 2 (reasoning: "implicite mais pas de rôle de référent = L2 Guidé")`,

  'design-ux': `CV : "UX Designer 3 ans, recherche utilisateur, tests d'utilisabilité, wireframes Figma. Audit RGAA."
→ user-research: 3 (reasoning: "3 ans + recherche utilisateur = L3 Autonome")
→ ui-design-prototyping: 3 (reasoning: "wireframes Figma = L3 Autonome")
→ accessibility-rgaa: 2 (reasoning: "audit RGAA mentionné = L2 Guidé")`,

  'management-leadership': `CV : "Manager d'équipe de 8 personnes, pilotage multi-parties prenantes, plan de montée en compétences."
→ team-management: 4 (reasoning: "manager 8 personnes = L4 Avancé")
→ multi-stakeholder-piloting: 3 (reasoning: "pilotage multi-parties = L3 Autonome")
→ coaching-development: 3 (reasoning: "plan de montée en compétences = L3 Autonome")`,

  'analyse-fonctionnelle': `CV : "Analyste fonctionnel 5 ans, rédaction de spécifications fonctionnelles détaillées, modélisation BPMN des processus métier."
→ functional-specifications: 4 (reasoning: "5 ans + spécifications détaillées = L4 Avancé")
→ process-modeling: 3 (reasoning: "modélisation BPMN = L3 Autonome")
→ requirements-elicitation: 3 (reasoning: "implicite avec 5 ans d'analyse = L3 Autonome")`,

  'data-engineering-governance': `CV : "Data Engineer, pipelines ETL avec Talend, modélisation dimensionnelle, migration de données legacy."
→ etl-pipelines: 3 (reasoning: "pipelines ETL Talend = L3 Autonome")
→ data-modeling-conceptual: 3 (reasoning: "modélisation dimensionnelle = L3 Autonome")
→ data-migration-legacy: 3 (reasoning: "migration données legacy = L3 Autonome")`,

  'infrastructure-systems-network': `CV : "Admin système Linux 4 ans, VMware vSphere, sauvegarde Veeam, supervision Nagios."
→ linux-administration: 4 (reasoning: "4 ans admin Linux = L4 Avancé")
→ vmware-virtualization: 3 (reasoning: "VMware vSphere = L3 Autonome")
→ backup-disaster-recovery: 3 (reasoning: "sauvegarde Veeam = L3 Autonome")
→ monitoring-supervision: 3 (reasoning: "supervision Nagios = L3 Autonome")`,

  'project-management-pmo': `CV : "Chef de projet 6 ans, planification MS Project, suivi budgétaire, comités de pilotage mensuels."
→ planning-scheduling: 4 (reasoning: "6 ans + MS Project = L4 Avancé")
→ budget-financial-tracking: 3 (reasoning: "suivi budgétaire = L3 Autonome")
→ governance-reporting: 3 (reasoning: "comités de pilotage = L3 Autonome")`,

  'change-management-training': `CV : "Conduite du changement pour migration ERP, plan de communication, formation de 50 utilisateurs."
→ change-communication: 3 (reasoning: "plan de communication = L3 Autonome")
→ training-delivery: 3 (reasoning: "formation 50 utilisateurs = L3 Autonome")
→ impact-analysis: 3 (reasoning: "migration ERP implique analyse d'impact = L3 Autonome")`,

  'qa-test-engineering': `CV : "QA Lead, stratégie de tests, automatisation Selenium/Cypress, tests de performance JMeter."
→ test-strategy: 4 (reasoning: "QA Lead + stratégie = L4 Avancé")
→ test-automation-frameworks: 3 (reasoning: "Selenium/Cypress = L3 Autonome")
→ performance-load-testing: 3 (reasoning: "JMeter = L3 Autonome")`,
}

/**
 * Extract raw text from a CV file buffer (PDF or DOCX).
 * Detects format from magic bytes.
 */
export async function extractCvText(buffer: Buffer): Promise<string> {
  // DOCX files start with PK (zip) magic bytes
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  // Default: treat as PDF
  const data = new Uint8Array(buffer)
  const result = await extractText(data)
  return Array.isArray(result.text) ? result.text.join('\n') : result.text
}

export interface ExtractionResult {
  ratings: Record<string, number>
  reasoning: Record<string, string>
  questions: Record<string, string>
  failedCategories: string[]
}

interface CategoryExtraction {
  ratings: Record<string, number>
  reasoning: Record<string, string>
  questions: Record<string, string>
}

/**
 * Extract skills for a single category from CV text. Returns per-skill
 * rating + short reasoning (CV evidence) + a French verification question
 * a recruiter can ask in the interview to validate the rating.
 */
async function extractCategorySkills(
  cvText: string,
  category: SkillCategory,
  client: Anthropic,
): Promise<CategoryExtraction> {
  const skillDescriptions = category.skills.map(s => {
    const levels = s.descriptors
      .map(d => `  L${d.level}: ${d.description}`)
      .join('\n')
    return `- ${s.id} (${s.label}):\n${levels}`
  }).join('\n')

  const workedExample = CV_WORKED_EXAMPLES[category.id] || ''

  const systemPrompt = `Tu es un expert en recrutement technique. Tu évalues les compétences d'un candidat à partir de son CV, uniquement pour la catégorie "${category.label}".

RÈGLES :
- Note UNIQUEMENT les compétences clairement identifiables dans le CV
- Si une compétence n'apparaît pas, ne l'inclus PAS
- Sois conservateur : L2-L3 sauf preuve claire de L4-L5
- Justifie chaque note dans le champ "reasoning" en citant la phrase ou l'expérience précise du CV
- Pour chaque compétence notée, rédige dans "questions" UNE question de vérification (≤ 25 mots) que le recruteur posera au candidat. Cette question doit référencer un élément précis du CV, inviter le candidat à prouver son niveau, et être calibrée au niveau noté (L4+ → question d'architecture/conception, L2-L3 → question d'exécution)

ÉCHELLE :
0 = Inconnu — aucune mention dans le CV
1 = Notions — mentionné en passant, formation, ou "connaissances de base"
2 = Guidé — utilisé dans un contexte encadré, stage, ou projet académique
3 = Autonome — utilisé en production, mentionné dans l'expérience professionnelle (2+ ans)
4 = Avancé — rôle de lead/architecte sur cette technologie, conception de solutions
5 = Expert — formateur, conférencier, contributeur open source, ou référent reconnu

EXEMPLE :
${workedExample}

COMPÉTENCES À ÉVALUER (${category.label}) :
${skillDescriptions}`

  const userPrompt = `CV DU CANDIDAT :
<cv_document>
${cvText}
</cv_document>

Évalue les compétences de la catégorie "${category.label}" uniquement.`

  const empty: CategoryExtraction = { ratings: {}, reasoning: {}, questions: {} }

  const result = await callAnthropicTool<{
    suggestions?: Record<string, unknown>
    reasoning?: Record<string, unknown>
    questions?: Record<string, unknown>
  }>({
    client,
    model: EXTRACTION_MODEL,
    system: systemPrompt,
    user: userPrompt,
    tool: {
      name: 'submit_skill_ratings',
      description: 'Submit the extracted skill ratings, reasoning, and verification questions for this category',
      inputSchema: {
        type: 'object' as const,
        properties: {
          suggestions: {
            type: 'object',
            description: 'Map of skill IDs to suggested rating levels (0-5)',
            additionalProperties: { type: 'number', minimum: 0, maximum: 5 },
          },
          reasoning: {
            type: 'object',
            description: 'Map of skill IDs to one-line justification citing CV evidence',
            additionalProperties: { type: 'string' },
          },
          questions: {
            type: 'object',
            description: 'Map of skill IDs to one French verification question (≤ 25 words) referencing a specific CV element',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['suggestions', 'reasoning', 'questions'],
      },
    },
  })

  if (!result) return empty
  const input = result.input
  if (!input.suggestions) return empty

  // Keep only skills that belong to this category (prompt compliance guard)
  // AND have a numeric rating. Validation of 0-5 range happens in the caller.
  const categorySkillIds = new Set(category.skills.map(s => s.id))
  const ratings: Record<string, number> = {}
  for (const [key, value] of Object.entries(input.suggestions)) {
    if (typeof value === 'number' && categorySkillIds.has(key)) {
      ratings[key] = value
    }
  }
  const reasoning: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.reasoning ?? {})) {
    if (typeof value === 'string' && value.trim() && key in ratings) {
      reasoning[key] = value.trim()
    }
  }
  const questions: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.questions ?? {})) {
    if (typeof value === 'string' && value.trim() && key in ratings) {
      questions[key] = value.trim()
    }
  }
  return { ratings, reasoning, questions }
}

/**
 * Use Claude tool_use to extract skill ratings from CV text against the full
 * skill catalog. Splits into parallel per-category calls for consistency.
 *
 * Returns:
 *   - `ratings`: skill id → integer 0-5 (validated)
 *   - `reasoning`: skill id → CV-evidence justification
 *   - `questions`: skill id → French verification question for the recruiter
 *   - `failedCategories`: ids of categories whose LLM call rejected (partial)
 * Returns null when the CV is too short or extraction fails entirely.
 *
 * @param posteContext wired but unused in Phase 0 (role-neutral baseline).
 *   Phase 3 consumes this for the per-candidature delta pass.
 */
export async function extractSkillsFromCv(
  cvText: string,
  catalog: SkillCategory[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _posteContext: PosteContext | null = null,
): Promise<ExtractionResult | null> {
  if (cvText.length < 50) return null
  // _posteContext intentionally unused in Phase 0 (role-neutral baseline).
  // Phase 3 will read it and spawn the role-aware delta pass.

  const client = new Anthropic()

  const results = await Promise.allSettled(
    catalog.map(category => extractCategorySkills(cvText, category, client))
  )

  const fulfilled = results
    .filter((r): r is PromiseFulfilledResult<CategoryExtraction> => r.status === 'fulfilled')
    .map(r => r.value)

  const failedCategories = results
    .map((r, i) => r.status === 'rejected' ? catalog[i].id : null)
    .filter((id): id is string => id !== null)

  if (failedCategories.length > 0) {
    console.warn(`[CV extraction] Failed categories: ${failedCategories.join(', ')}`)
  }

  if (fulfilled.length === 0) return null

  const mergedRatings = Object.assign({}, ...fulfilled.map(f => f.ratings))
  const mergedReasoning = Object.assign({}, ...fulfilled.map(f => f.reasoning))
  const mergedQuestions = Object.assign({}, ...fulfilled.map(f => f.questions))
  const valid = filterValidRatings(mergedRatings)
  if (Object.keys(valid).length === 0) return null

  // Drop reasoning/questions for skills that didn't survive rating validation.
  const reasoning: Record<string, string> = {}
  const questions: Record<string, string> = {}
  for (const key of Object.keys(valid)) {
    if (mergedReasoning[key]) reasoning[key] = mergedReasoning[key]
    if (mergedQuestions[key]) questions[key] = mergedQuestions[key]
  }

  return { ratings: valid, reasoning, questions, failedCategories }
}

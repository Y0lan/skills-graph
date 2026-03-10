import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_PATH = path.join(__dirname, '..', '..', 'skill-catalog-full.json')

interface CatalogJson {
  ratingScale: Record<string, { label: string; description: string }>
  categories: {
    id: string
    label: string
    skills: {
      id: string
      label: string
      descriptors: Record<string, string>
    }[]
  }[]
}

// Calibration prompts — one per category (inline from deleted calibration-prompts.ts)
const calibrationPrompts: Record<string, string> = {
  'core-engineering':
    'You receive a merge request with 800 lines of Java and TypeScript. The code uses advanced generics, custom RxJS operators, and complex SQL with CTEs. You need to review it for correctness, performance, and maintainability, and provide actionable feedback within half a day. How confident are you in catching subtle issues across all these technologies?',
  'backend-integration':
    'You need to design a new microservice that consumes Kafka events from the DSE pipeline, applies CAFAT contribution calculation rules, and persists results in PostgreSQL via JPA. Consider error handling, idempotency, dead-letter strategies, and schema evolution. How confident are you in delivering this autonomously?',
  'frontend-ui':
    'A new SINAPSE screen requires a complex AG Grid table with server-side filtering, custom cell renderers, reactive form validation with RxJS, and full WCAG 2.1 AA accessibility. You must integrate it into the existing Angular module with NgRx state management. How confident are you in shipping this without senior guidance?',
  'platform-engineering':
    'The team needs a new GitLab CI pipeline that builds a multi-stage Docker image, deploys to RKE2 via Helm, provisions a CloudNativePG database with Terraform, and configures secrets from Vault. You own the entire chain from commit to production. How confident are you in setting this up end-to-end?',
  'observability-reliability':
    'A critical SINAPSE service handling employer declarations is experiencing intermittent 5xx errors under load. You need to correlate Prometheus metrics, Loki logs, and Tempo traces to identify the root cause, then define an SLO with burn-rate alerts to prevent recurrence. How confident are you in leading this investigation alone?',
  'security-compliance':
    'You must secure a new SINAPSE API: configure Keycloak OIDC with role-based access, set up Vault for database credential rotation, add Trivy scanning to CI, and perform a STRIDE threat model before the architecture review. How confident are you in handling all these security concerns without escalation?',
  'architecture-governance':
    'You are asked to write an ADR for decomposing a CAFAT legacy module into three bounded contexts, model the target state in Structurizr (C4) and ArchiMate, update the API governance catalog, and present the trade-offs to the architecture board. How confident are you in driving this end-to-end?',
  'soft-skills':
    'A production incident occurs during a deployment affecting employer declarations. You need to lead the incident call, coordinate with the infrastructure and business teams, communicate status to CAFAT stakeholders in non-technical terms, and write a blameless postmortem with actionable follow-ups. How confident are you in owning this process?',
  'domain-knowledge':
    'A new regulation changes contribution ceilings for independent workers and impacts RUAMM eligibility rules. You need to assess the impact across recouvrement, TI, and santé domains, update the business rules in SINAPSE, ensure the Portail Pro declarations reflect the changes, and validate against the legacy system during the transition period. How confident are you in analyzing this cross-domain impact autonomously?',
}

// Short labels for rating scale (not in JSON)
const shortLabels: Record<number, string> = {
  0: '?',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
}

// Level labels used in skill descriptors
const levelLabels: Record<number, string> = {
  0: 'Inconnu',
  1: 'Notions',
  2: 'Guidé',
  3: 'Autonome',
  4: 'Avancé',
  5: 'Expert',
}

export function seedCatalog(db: Database.Database): void {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8')
  const catalog: CatalogJson = JSON.parse(raw)

  const insertCategory = db.prepare(
    'INSERT OR REPLACE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)',
  )

  const insertCalibration = db.prepare(
    'INSERT OR REPLACE INTO calibration_prompts (category_id, text, tools) VALUES (?, ?, ?)',
  )

  const insertSkill = db.prepare(
    'INSERT OR REPLACE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)',
  )

  const insertDescriptor = db.prepare(
    'INSERT OR REPLACE INTO skill_descriptors (skill_id, level, label, description) VALUES (?, ?, ?, ?)',
  )

  const insertRating = db.prepare(
    'INSERT OR REPLACE INTO rating_scale (value, label, short_label, description) VALUES (?, ?, ?, ?)',
  )

  const seed = db.transaction(() => {
    // Rating scale
    for (const [valueStr, entry] of Object.entries(catalog.ratingScale)) {
      const value = parseInt(valueStr, 10)
      insertRating.run(value, entry.label, shortLabels[value] ?? valueStr, entry.description)
    }

    // Categories, skills, descriptors
    for (let catIdx = 0; catIdx < catalog.categories.length; catIdx++) {
      const cat = catalog.categories[catIdx]
      // Extract emoji from label (first character(s) before space)
      const emojiMatch = cat.label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)/u)
      const emoji = emojiMatch?.[0] ?? ''
      const cleanLabel = cat.label.replace(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u, '')

      insertCategory.run(cat.id, cleanLabel, emoji, catIdx)

      // Calibration prompt
      const promptText = calibrationPrompts[cat.id]
      if (promptText) {
        insertCalibration.run(cat.id, promptText, '[]')
      }

      // Skills
      for (let skillIdx = 0; skillIdx < cat.skills.length; skillIdx++) {
        const skill = cat.skills[skillIdx]
        insertSkill.run(skill.id, cat.id, skill.label, skillIdx)

        // Descriptors
        for (const [levelStr, description] of Object.entries(skill.descriptors)) {
          const level = parseInt(levelStr, 10)
          insertDescriptor.run(skill.id, level, levelLabels[level] ?? `Level ${level}`, description)
        }
      }
    }
  })

  seed()
  console.log(
    `Seeded catalog: ${catalog.categories.length} categories, ${catalog.categories.reduce((n, c) => n + c.skills.length, 0)} skills`,
  )
}

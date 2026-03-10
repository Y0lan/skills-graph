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
    'Vous recevez une merge request de 800 lignes de Java et TypeScript. Le code utilise des generics avancés, des opérateurs RxJS personnalisés et du SQL complexe avec des CTEs. Vous devez la relire pour vérifier la correction, la performance et la maintenabilité, puis fournir un retour actionnable en une demi-journée. À quel point êtes-vous confiant pour détecter les problèmes subtils dans toutes ces technologies ?',
  'backend-integration':
    'Vous devez concevoir un nouveau microservice qui consomme des événements Kafka du pipeline DSE, applique les règles de calcul des cotisations CAFAT et persiste les résultats dans PostgreSQL via JPA. Vous devez gérer les erreurs, l\'idempotence, les stratégies de dead-letter et l\'évolution des schémas. À quel point êtes-vous confiant pour livrer cela de manière autonome ?',
  'frontend-ui':
    'Un nouvel écran SINAPSE nécessite un tableau AG Grid complexe avec filtrage côté serveur, des renderers de cellules personnalisés, une validation de formulaire réactive avec RxJS et une accessibilité WCAG 2.1 AA complète. Vous devez l\'intégrer dans le module Angular existant avec la gestion d\'état NgRx. À quel point êtes-vous confiant pour livrer cela sans accompagnement senior ?',
  'platform-engineering':
    'L\'équipe a besoin d\'un nouveau pipeline GitLab CI qui construit une image Docker multi-stage, déploie sur RKE2 via Helm, provisionne une base CloudNativePG avec Terraform et configure les secrets depuis Vault. Vous êtes responsable de toute la chaîne, du commit à la production. À quel point êtes-vous confiant pour mettre cela en place de bout en bout ?',
  'observability-reliability':
    'Un service SINAPSE critique gérant les déclarations employeurs subit des erreurs 5xx intermittentes sous charge. Vous devez corréler les métriques Prometheus, les logs Loki et les traces Tempo pour identifier la cause racine, puis définir un SLO avec des alertes de burn-rate pour prévenir les récidives. À quel point êtes-vous confiant pour mener cette investigation seul ?',
  'security-compliance':
    'Vous devez sécuriser une nouvelle API SINAPSE : configurer Keycloak OIDC avec contrôle d\'accès par rôles, mettre en place Vault pour la rotation des identifiants de base de données, ajouter le scan Trivy au CI et réaliser une modélisation de menaces STRIDE avant la revue d\'architecture. À quel point êtes-vous confiant pour gérer tous ces aspects sécurité sans escalade ?',
  'architecture-governance':
    'On vous demande de rédiger un ADR pour décomposer un module legacy CAFAT en trois bounded contexts, modéliser l\'état cible dans Structurizr (C4) et ArchiMate, mettre à jour le catalogue de gouvernance API et présenter les compromis au comité d\'architecture. À quel point êtes-vous confiant pour piloter cela de bout en bout ?',
  'soft-skills':
    'Un incident de production survient lors d\'un déploiement affectant les déclarations employeurs. Vous devez diriger l\'appel d\'incident, coordonner avec les équipes infrastructure et métier, communiquer l\'état aux parties prenantes CAFAT en termes non techniques et rédiger un postmortem blameless avec des actions de suivi concrètes. À quel point êtes-vous confiant pour prendre en charge ce processus ?',
  'domain-knowledge':
    'Une nouvelle réglementation modifie les plafonds de cotisation des travailleurs indépendants et impacte les règles d\'éligibilité RUAMM. Vous devez évaluer l\'impact dans les domaines recouvrement, TI et santé, mettre à jour les règles métier dans SINAPSE, vous assurer que les déclarations du Portail Pro reflètent les changements et valider par rapport au système legacy pendant la période de transition. À quel point êtes-vous confiant pour analyser cet impact transversal de manière autonome ?',
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

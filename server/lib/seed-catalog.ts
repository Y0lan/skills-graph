import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'

const CATALOG_PATH = path.join(process.cwd(), 'skill-catalog-full.json')

interface CatalogJson {
  ratingScale: Record<string, { label: string; description: string }>
  categories: {
    id: string
    label: string
    scenario?: string
    skills: {
      id: string
      label: string
      descriptors: Record<string, string>
    }[]
  }[]
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

    // Migrate renamed skill IDs in existing evaluations
    const SKILL_RENAMES: Record<string, string> = {
      'sentry': 'error-tracking',
      'redis-dragonfly': 'redis',
      'iam-keycloak': 'iam-authn',
      'technical-writing': 'vulgarisation-pedagogie',
    }
    const CATEGORY_RENAMES: Record<string, string> = {
      'soft-skills': 'soft-skills-delivery',
    }
    const REMOVED_SKILLS = ['mfa-yubikey']

    const evalRows = db.prepare('SELECT slug, ratings, skipped_categories FROM evaluations').all() as {
      slug: string; ratings: string; skipped_categories: string
    }[]

    for (const row of evalRows) {
      const ratings: Record<string, number> = JSON.parse(row.ratings)
      let changed = false

      // Rename skill IDs
      for (const [oldId, newId] of Object.entries(SKILL_RENAMES)) {
        if (oldId in ratings) {
          ratings[newId] = ratings[oldId]
          delete ratings[oldId]
          changed = true
        }
      }

      // Remove deleted skills
      for (const id of REMOVED_SKILLS) {
        if (id in ratings) {
          delete ratings[id]
          changed = true
        }
      }

      // Rename category IDs in skipped_categories
      const skipped: string[] = JSON.parse(row.skipped_categories)
      const newSkipped = skipped.map((id) => CATEGORY_RENAMES[id] ?? id)
      const skippedChanged = JSON.stringify(skipped) !== JSON.stringify(newSkipped)

      if (changed || skippedChanged) {
        db.prepare('UPDATE evaluations SET ratings = ?, skipped_categories = ? WHERE slug = ?')
          .run(JSON.stringify(ratings), JSON.stringify(newSkipped), row.slug)
      }
    }

    // Rating scale
    for (const [valueStr, entry] of Object.entries(catalog.ratingScale)) {
      const value = parseInt(valueStr, 10)
      insertRating.run(value, entry.label, shortLabels[value] ?? valueStr, entry.description)
    }

    // Categories, skills, descriptors
    for (let catIdx = 0; catIdx < catalog.categories.length; catIdx++) {
      const cat = catalog.categories[catIdx]
      insertCategory.run(cat.id, cat.label, '', catIdx)

      // Calibration prompt (scenario from JSON)
      if (cat.scenario) {
        insertCalibration.run(cat.id, cat.scenario, '[]')
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

    // Clean up orphaned rows from skills/categories removed from the catalog
    const currentSkillIds = catalog.categories.flatMap(c => c.skills.map(s => s.id))
    const currentCatIds = catalog.categories.map(c => c.id)
    if (currentSkillIds.length > 0) {
      const skillPlaceholders = currentSkillIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM skill_descriptors WHERE skill_id NOT IN (${skillPlaceholders})`).run(...currentSkillIds)
      db.prepare(`DELETE FROM skills WHERE id NOT IN (${skillPlaceholders})`).run(...currentSkillIds)
    }
    if (currentCatIds.length > 0) {
      const catPlaceholders = currentCatIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM calibration_prompts WHERE category_id NOT IN (${catPlaceholders})`).run(...currentCatIds)
      db.prepare(`DELETE FROM categories WHERE id NOT IN (${catPlaceholders})`).run(...currentCatIds)
    }
  })

  seed()
  console.log(
    `Seeded catalog: ${catalog.categories.length} categories, ${catalog.categories.reduce((n, c) => n + c.skills.length, 0)} skills`,
  )
}

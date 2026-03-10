import { getDb } from './db.js'
import type { SkillCategory, Skill, LevelDescriptor } from '../../src/data/skill-catalog.js'
import type { RatingLevel } from '../../src/data/rating-scale.js'

export interface CalibrationPrompt {
  text: string
  tools: string[]
}

// ─── In-memory cache ──────────────────────────────────────────

let cachedCategories: SkillCategory[] | null = null
let cachedRatingScale: RatingLevel[] | null = null
let cachedCalibrationPrompts: Record<string, CalibrationPrompt> | null = null

export function invalidateCatalogCache(): void {
  cachedCategories = null
  cachedRatingScale = null
  cachedCalibrationPrompts = null
}

// ─── Categories + Skills ──────────────────────────────────────

export function getSkillCategories(): SkillCategory[] {
  if (cachedCategories) return cachedCategories

  const db = getDb()

  const catRows = db
    .prepare('SELECT id, label, emoji, sort_order FROM categories ORDER BY sort_order')
    .all() as { id: string; label: string; emoji: string; sort_order: number }[]

  const skillRows = db
    .prepare('SELECT id, category_id, label, sort_order FROM skills ORDER BY sort_order')
    .all() as { id: string; category_id: string; label: string; sort_order: number }[]

  const descRows = db
    .prepare('SELECT skill_id, level, label, description FROM skill_descriptors ORDER BY level')
    .all() as { skill_id: string; level: number; label: string; description: string }[]

  // Group descriptors by skill_id
  const descBySkill = new Map<string, LevelDescriptor[]>()
  for (const row of descRows) {
    const list = descBySkill.get(row.skill_id) ?? []
    list.push({ level: row.level, label: row.label, description: row.description })
    descBySkill.set(row.skill_id, list)
  }

  // Group skills by category_id
  const skillsByCat = new Map<string, Skill[]>()
  for (const row of skillRows) {
    const list = skillsByCat.get(row.category_id) ?? []
    list.push({
      id: row.id,
      label: row.label,
      categoryId: row.category_id,
      descriptors: descBySkill.get(row.id) ?? [],
    })
    skillsByCat.set(row.category_id, list)
  }

  cachedCategories = catRows.map((row) => ({
    id: row.id,
    label: row.label,
    emoji: row.emoji,
    skills: skillsByCat.get(row.id) ?? [],
  }))

  return cachedCategories
}

// ─── Rating scale ─────────────────────────────────────────────

export function getRatingScale(): RatingLevel[] {
  if (cachedRatingScale) return cachedRatingScale

  const db = getDb()
  const rows = db
    .prepare('SELECT value, label, short_label, description FROM rating_scale ORDER BY value')
    .all() as { value: number; label: string; short_label: string; description: string }[]

  cachedRatingScale = rows.map((r) => ({
    value: r.value,
    label: r.label,
    shortLabel: r.short_label,
    description: r.description,
  }))

  return cachedRatingScale
}

// ─── Calibration prompts ──────────────────────────────────────

export function getCalibrationPrompts(): Record<string, CalibrationPrompt> {
  if (cachedCalibrationPrompts) return cachedCalibrationPrompts

  const db = getDb()
  const rows = db
    .prepare('SELECT category_id, text, tools FROM calibration_prompts')
    .all() as { category_id: string; text: string; tools: string }[]

  cachedCalibrationPrompts = {}
  for (const row of rows) {
    cachedCalibrationPrompts[row.category_id] = {
      text: row.text,
      tools: JSON.parse(row.tools),
    }
  }

  return cachedCalibrationPrompts
}

// ─── Convenience helpers ──────────────────────────────────────

export function getAllSkills(): Skill[] {
  return getSkillCategories().flatMap((c) => c.skills)
}

export function getSkillById(id: string): Skill | undefined {
  return getAllSkills().find((s) => s.id === id)
}

export function getCategoryById(id: string): SkillCategory | undefined {
  return getSkillCategories().find((c) => c.id === id)
}

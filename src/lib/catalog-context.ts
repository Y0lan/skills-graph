import { createContext } from 'react'
import type { SkillCategory, Skill } from '@/data/skill-catalog'
import type { RatingLevel } from '@/data/rating-scale'

export interface CalibrationPrompt {
  text: string
  tools: string[]
}

export interface CatalogContextValue {
  categories: SkillCategory[]
  ratingScale: RatingLevel[]
  calibrationPrompts: Record<string, CalibrationPrompt>
  allSkills: Skill[]
  skillById: Map<string, Skill>
  categoryById: Map<string, SkillCategory>
  loading: boolean
}

export const defaultCatalogValue: CatalogContextValue = {
  categories: [],
  ratingScale: [],
  calibrationPrompts: {},
  allSkills: [],
  skillById: new Map(),
  categoryById: new Map(),
  loading: true,
}

export const CatalogContext = createContext<CatalogContextValue>(defaultCatalogValue)

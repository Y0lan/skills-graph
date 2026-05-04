import { describe, expect, it } from 'vitest'
import type { SkillCategory } from '../../src/data/skill-catalog.js'
import {
  buildOptionalCategoryGroups,
  countQuestions,
  filterCategoriesByIds,
  resolveRequiredCategoryIds,
} from '../lib/member-form-scope.js'

const categories: SkillCategory[] = [
  {
    id: 'core',
    label: 'Core',
    emoji: '',
    skills: [
      { id: 'java', label: 'Java', categoryId: 'core', descriptors: [] },
      { id: 'sql', label: 'SQL', categoryId: 'core', descriptors: [] },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    emoji: '',
    skills: [
      { id: 'etl', label: 'ETL', categoryId: 'data', descriptors: [] },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    emoji: '',
    skills: [
      { id: 'leadership', label: 'Leadership', categoryId: 'management', descriptors: [] },
    ],
  },
  {
    id: 'legacy',
    label: 'Legacy',
    emoji: '',
    skills: [
      { id: 'rpg', label: 'RPG', categoryId: 'legacy', descriptors: [] },
    ],
  },
]

const inputs = {
  allCategoryIds: categories.map((category) => category.id),
  targetCategoryIdsByRole: {
    'Ingénieur Data': ['core', 'data'],
    Directeur: ['management'],
  },
  poleCategoryIdsByPole: {
    java_modernisation: ['core'],
    legacy: ['legacy', 'core'],
  },
}

describe('member form scope', () => {
  it('uses role targets before the broader pole mapping', () => {
    const resolution = resolveRequiredCategoryIds(
      { role: 'Ingénieur Data', pole: 'java_modernisation' },
      inputs,
    )

    expect(resolution).toEqual({
      categoryIds: ['core', 'data'],
      source: 'role-targets',
    })
  })

  it('falls back to the member pole when no role target exists', () => {
    const resolution = resolveRequiredCategoryIds(
      { role: 'Role inconnu', pole: 'legacy' },
      inputs,
    )

    expect(resolution).toEqual({
      categoryIds: ['core', 'legacy'],
      source: 'pole',
    })
  })

  it('falls back to the full catalog only when neither role nor pole can scope the member', () => {
    const resolution = resolveRequiredCategoryIds(
      { role: 'Role inconnu', pole: null },
      inputs,
    )

    expect(resolution).toEqual({
      categoryIds: ['core', 'data', 'management', 'legacy'],
      source: 'catalog',
    })
  })

  it('keeps every non-required category available as optional exactly once', () => {
    const requiredCategoryIds = ['core']
    const groups = buildOptionalCategoryGroups(categories, requiredCategoryIds, inputs.poleCategoryIdsByPole)
    const optionalIds = groups.flatMap((group) => group.categories.map((category) => category.id))

    expect(optionalIds.sort()).toEqual(['data', 'legacy', 'management'])
    expect(new Set(optionalIds).size).toBe(optionalIds.length)
    expect(countQuestions(categories, optionalIds)).toBe(3)
  })

  it('filters progress categories without losing catalog order', () => {
    const scoped = filterCategoriesByIds(categories, ['legacy', 'core'])
    expect(scoped.map((category) => category.id)).toEqual(['core', 'legacy'])
  })
})

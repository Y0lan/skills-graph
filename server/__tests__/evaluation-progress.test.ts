import { describe, expect, it } from 'vitest'
import { computeEvaluationProgress } from '../lib/evaluation-progress.js'
import type { SkillCategory } from '../../src/data/skill-catalog.js'

const categories: SkillCategory[] = [
  {
    id: 'backend',
    label: 'Backend',
    emoji: '',
    skills: [
      { id: 'java', label: 'Java', categoryId: 'backend', descriptors: [] },
      { id: 'postgres', label: 'Postgres', categoryId: 'backend', descriptors: [] },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    emoji: '',
    skills: [
      { id: 'communication', label: 'Communication', categoryId: 'delivery', descriptors: [] },
    ],
  },
]

describe('evaluation progress', () => {
  it('marks a member with no answers as not started even if stale submitted_at exists elsewhere', () => {
    expect(computeEvaluationProgress({
      ratings: {},
      skippedCategories: [],
      declinedCategories: [],
    }, categories)).toMatchObject({
      status: 'none',
      answeredCount: 0,
      coveredCount: 0,
      totalCount: 3,
    })
  })

  it('marks partial answers as draft', () => {
    expect(computeEvaluationProgress({
      ratings: { java: 0 },
      skippedCategories: [],
      declinedCategories: [],
    }, categories)).toMatchObject({
      status: 'draft',
      answeredCount: 1,
      coveredCount: 1,
      totalCount: 3,
    })
  })

  it('marks all covered questions as submitted', () => {
    expect(computeEvaluationProgress({
      ratings: { java: 4, postgres: 3 },
      skippedCategories: ['delivery'],
      declinedCategories: [],
    }, categories)).toMatchObject({
      status: 'submitted',
      answeredCount: 2,
      coveredCount: 3,
      totalCount: 3,
    })
  })

  it('can mark a role-scoped evaluation complete while catalog-wide coverage stays partial', () => {
    const requiredCategories = categories.filter((category) => category.id === 'backend')
    const evaluation = {
      ratings: { java: 4, postgres: 3 },
      skippedCategories: [],
      declinedCategories: [],
    }

    expect(computeEvaluationProgress(evaluation, requiredCategories)).toMatchObject({
      status: 'submitted',
      answeredCount: 2,
      coveredCount: 2,
      totalCount: 2,
    })
    expect(computeEvaluationProgress(evaluation, categories)).toMatchObject({
      status: 'draft',
      answeredCount: 2,
      coveredCount: 2,
      totalCount: 3,
    })
  })
})

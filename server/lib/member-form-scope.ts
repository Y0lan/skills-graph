import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { SkillCategory } from '../../src/data/skill-catalog.js'
import type { TeamMember } from '../data/team-roster.js'
import { getSkillCategories } from './catalog.js'
import { getDb } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGETS_FILE = path.join(__dirname, '..', 'data', 'targets.json')

const POLE_LABELS: Record<string, string> = {
  legacy: 'Pôle Legacy (Adélia / IBMi)',
  java_modernisation: 'Pôle Java / Modernisation',
  fonctionnel: 'Pôle Fonctionnel',
  transverse: 'Compétences transverses',
}

const POLE_ORDER = ['legacy', 'java_modernisation', 'fonctionnel', 'transverse'] as const

export type RequiredCategorySource = 'role-targets' | 'pole' | 'catalog'

export interface MemberScopeInputs {
  allCategoryIds: string[]
  targetCategoryIdsByRole: Record<string, string[]>
  poleCategoryIdsByPole: Record<string, string[]>
}

export interface RequiredCategoryResolution {
  categoryIds: string[]
  source: RequiredCategorySource
}

export interface CategoryGroup {
  pole: string
  label: string
  categories: SkillCategory[]
}

export interface MemberFormScope {
  member: TeamMember
  requiredCategoryIds: string[]
  optionalGroups: CategoryGroup[]
  source: RequiredCategorySource
  requiredCategoryCount: number
  optionalCategoryCount: number
  catalogCategoryCount: number
  requiredQuestionCount: number
  optionalQuestionCount: number
  catalogQuestionCount: number
  requiredCategories: SkillCategory[]
}

let cachedTargetCategoryIdsByRole: Record<string, string[]> | null = null

function readTargetCategoryIdsByRole(): Record<string, string[]> {
  if (cachedTargetCategoryIdsByRole) return cachedTargetCategoryIdsByRole
  try {
    const raw = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8')) as Record<string, Record<string, number>>
    cachedTargetCategoryIdsByRole = Object.fromEntries(
      Object.entries(raw).map(([role, categories]) => [role, Object.keys(categories)]),
    )
  } catch {
    cachedTargetCategoryIdsByRole = {}
  }
  return cachedTargetCategoryIdsByRole
}

function normalizeCategoryIds(ids: string[], orderedKnownIds: string[]): string[] {
  const wanted = new Set(ids)
  return orderedKnownIds.filter((id) => wanted.has(id))
}

export function resolveRequiredCategoryIds(
  member: Pick<TeamMember, 'role' | 'pole'>,
  inputs: MemberScopeInputs,
): RequiredCategoryResolution {
  const roleTargetIds = inputs.targetCategoryIdsByRole[member.role] ?? []
  const roleCategoryIds = normalizeCategoryIds(roleTargetIds, inputs.allCategoryIds)
  if (roleCategoryIds.length > 0) {
    return { categoryIds: roleCategoryIds, source: 'role-targets' }
  }

  const poleIds = member.pole ? inputs.poleCategoryIdsByPole[member.pole] ?? [] : []
  const poleCategoryIds = normalizeCategoryIds(poleIds, inputs.allCategoryIds)
  if (poleCategoryIds.length > 0) {
    return { categoryIds: poleCategoryIds, source: 'pole' }
  }

  return { categoryIds: [...inputs.allCategoryIds], source: 'catalog' }
}

export function countQuestions(categories: SkillCategory[], categoryIds: string[]): number {
  const wanted = new Set(categoryIds)
  return categories.reduce((sum, category) => {
    return wanted.has(category.id) ? sum + category.skills.length : sum
  }, 0)
}

export function filterCategoriesByIds(categories: SkillCategory[], categoryIds: string[]): SkillCategory[] {
  const wanted = new Set(categoryIds)
  return categories.filter((category) => wanted.has(category.id))
}

function primaryPoleForCategory(categoryId: string, poleCategoryIdsByPole: Record<string, string[]>): string {
  for (const pole of POLE_ORDER) {
    if (pole !== 'transverse' && (poleCategoryIdsByPole[pole] ?? []).includes(categoryId)) {
      return pole
    }
  }
  return 'transverse'
}

export function buildOptionalCategoryGroups(
  categories: SkillCategory[],
  requiredCategoryIds: string[],
  poleCategoryIdsByPole: Record<string, string[]>,
): CategoryGroup[] {
  const required = new Set(requiredCategoryIds)
  const groups = new Map<string, SkillCategory[]>()

  for (const category of categories) {
    if (required.has(category.id)) continue
    const pole = primaryPoleForCategory(category.id, poleCategoryIdsByPole)
    const list = groups.get(pole) ?? []
    list.push(category)
    groups.set(pole, list)
  }

  return POLE_ORDER
    .map((pole) => ({
      pole,
      label: POLE_LABELS[pole] ?? pole,
      categories: groups.get(pole) ?? [],
    }))
    .filter((group) => group.categories.length > 0)
}

export async function getPoleCategoryIdsByPole(): Promise<Record<string, string[]>> {
  const rows = await getDb()
    .prepare('SELECT pole, category_id FROM pole_categories ORDER BY pole, category_id')
    .all() as { pole: string; category_id: string }[]

  const result: Record<string, string[]> = {}
  for (const row of rows) {
    const list = result[row.pole] ?? []
    list.push(row.category_id)
    result[row.pole] = list
  }
  return result
}

export function buildMemberFormScope(
  member: TeamMember,
  categories: SkillCategory[],
  inputs: MemberScopeInputs,
): MemberFormScope {
  const required = resolveRequiredCategoryIds(member, {
    allCategoryIds: inputs.allCategoryIds,
    targetCategoryIdsByRole: inputs.targetCategoryIdsByRole,
    poleCategoryIdsByPole: inputs.poleCategoryIdsByPole,
  })
  const optionalGroups = buildOptionalCategoryGroups(categories, required.categoryIds, inputs.poleCategoryIdsByPole)
  const optionalCategoryIds = optionalGroups.flatMap((group) => group.categories.map((category) => category.id))

  return {
    member,
    requiredCategoryIds: required.categoryIds,
    optionalGroups,
    source: required.source,
    requiredCategoryCount: required.categoryIds.length,
    optionalCategoryCount: optionalCategoryIds.length,
    catalogCategoryCount: categories.length,
    requiredQuestionCount: countQuestions(categories, required.categoryIds),
    optionalQuestionCount: countQuestions(categories, optionalCategoryIds),
    catalogQuestionCount: countQuestions(categories, inputs.allCategoryIds),
    requiredCategories: filterCategoriesByIds(categories, required.categoryIds),
  }
}

async function loadScopeInputs(categories: SkillCategory[]): Promise<MemberScopeInputs> {
  return {
    allCategoryIds: categories.map((category) => category.id),
    targetCategoryIdsByRole: readTargetCategoryIdsByRole(),
    poleCategoryIdsByPole: await getPoleCategoryIdsByPole(),
  }
}

export async function resolveMemberFormScope(member: TeamMember): Promise<MemberFormScope> {
  const categories = getSkillCategories()
  return buildMemberFormScope(member, categories, await loadScopeInputs(categories))
}

export async function resolveMemberFormScopes(members: TeamMember[]): Promise<Map<string, MemberFormScope>> {
  const categories = getSkillCategories()
  const inputs = await loadScopeInputs(categories)
  return new Map(members.map((member) => [member.slug, buildMemberFormScope(member, categories, inputs)]))
}

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSkillCategories } from './catalog.js'
import { teamMembers } from '../../src/data/team-roster.js'
import { getAllEvaluations } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGETS_FILE = path.join(__dirname, '..', 'data', 'targets.json')

function readTargets(): Record<string, Record<string, number>> {
  try {
    return JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8'))
  } catch { return {} }
}

// ─── Category average for a single member ────────────────────
// Excludes values <= 0 (N/A or not rated)
function memberCategoryAvg(
  categoryId: string,
  ratings: Record<string, number>,
): { avg: number; ratedCount: number; totalCount: number } {
  const skillCategories = getSkillCategories()
  const cat = skillCategories.find((c) => c.id === categoryId)
  if (!cat) return { avg: 0, ratedCount: 0, totalCount: 0 }

  const values: number[] = []
  for (const skill of cat.skills) {
    const val = ratings[skill.id]
    if (val !== undefined && val > 0) {
      values.push(val)
    }
  }
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  return { avg, ratedCount: values.length, totalCount: cat.skills.length }
}

// ─── Response interfaces matching src/lib/types.ts ───────────

interface CategoryAggregateResponse {
  categoryId: string
  categoryLabel: string
  avgRank: number
  teamAvgRank: number
  targetRank: number
  gap: number
  ratedCount: number
  totalCount: number
}

interface GapResponse {
  categoryId: string
  categoryLabel: string
  gap: number
  avgRank: number
  targetRank: number
}

interface MemberAggregateResponse {
  memberId: string
  memberName: string
  role: string
  submittedAt: string | null
  hasRatings: boolean
  categories: CategoryAggregateResponse[]
  topGaps: GapResponse[]
  topStrengths: { categoryId: string; categoryLabel: string; avgRank: number }[]
  profileSummary: string | null
}

interface TeamCategoryAggregateResponse {
  categoryId: string
  categoryLabel: string
  teamAvgRank: number
  minRank: number
  maxRank: number
  skillAverages: Record<string, number>
}

interface TeamMemberAggregateResponse {
  slug: string
  name: string
  role: string
  team: string
  submittedAt: string | null
  categoryAverages: Record<string, number>
  skillRatings: Record<string, number>
  topGaps: { categoryId: string; gap: number }[]
  topStrengths: { categoryId: string; avg: number }[]
}

interface TeamAggregateResponse {
  teamSize: number
  submittedCount: number
  categoryTargets: Record<string, number>
  categories: TeamCategoryAggregateResponse[]
  members: TeamMemberAggregateResponse[]
}

// ─── Compute member aggregate ────────────────────────────────

export function computeMemberAggregate(slug: string): MemberAggregateResponse | null {
  const member = teamMembers.find((m) => m.slug === slug)
  if (!member) return null

  const skillCategories = getSkillCategories()
  const allRatings = getAllEvaluations()
  const targets = readTargets()
  const memberData = allRatings[slug]

  const hasRatings = !!memberData && Object.keys(memberData.ratings).length > 0

  // Get submitted members for team average calculation
  const submittedEntries = Object.entries(allRatings).filter(
    ([, data]) => data.submittedAt !== null,
  )

  const memberRatings = memberData?.ratings ?? {}
  const roleTargets = targets[member.role] ?? {}

  const categories: CategoryAggregateResponse[] = skillCategories.map((cat) => {
    const { avg: avgRank, ratedCount, totalCount } = memberCategoryAvg(cat.id, memberRatings)

    // Team average: mean of all submitted members' category averages
    const teamAvgs = submittedEntries
      .map(([, data]) => memberCategoryAvg(cat.id, data.ratings).avg)
      .filter((v) => v > 0)
    const teamAvgRank =
      teamAvgs.length > 0
        ? teamAvgs.reduce((a, b) => a + b, 0) / teamAvgs.length
        : 0

    const targetRank = roleTargets[cat.id] ?? 0
    const gap = targetRank - avgRank // positive = below target

    return {
      categoryId: cat.id,
      categoryLabel: cat.label,
      avgRank: Math.round(avgRank * 100) / 100,
      teamAvgRank: Math.round(teamAvgRank * 100) / 100,
      targetRank,
      gap: Math.round(gap * 100) / 100,
      ratedCount,
      totalCount,
    }
  })

  // Top 3 gaps sorted descending (largest gap first)
  const topGaps: GapResponse[] = [...categories]
    .filter((c) => c.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map((c) => ({
      categoryId: c.categoryId,
      categoryLabel: c.categoryLabel,
      gap: c.gap,
      avgRank: c.avgRank,
      targetRank: c.targetRank,
    }))

  // Top 3 strengths sorted descending (highest avg first)
  const topStrengths = [...categories]
    .filter((c) => c.avgRank > 0)
    .sort((a, b) => b.avgRank - a.avgRank)
    .slice(0, 3)
    .map((c) => ({ categoryId: c.categoryId, categoryLabel: c.categoryLabel, avgRank: c.avgRank }))

  return {
    memberId: member.slug,
    memberName: member.name,
    role: member.role,
    submittedAt: memberData?.submittedAt ?? null,
    hasRatings,
    categories,
    topGaps,
    topStrengths,
    profileSummary: memberData?.profileSummary ?? null,
  }
}

// ─── Compute team aggregate ──────────────────────────────────

export function computeTeamAggregate(): TeamAggregateResponse {
  const skillCategories = getSkillCategories()
  const allRatings = getAllEvaluations()
  const targets = readTargets()

  const submittedEntries = Object.entries(allRatings).filter(
    ([, data]) => data.submittedAt !== null,
  )

  const submittedCount = submittedEntries.length

  // Team-level category stats
  const categories: TeamCategoryAggregateResponse[] = skillCategories.map((cat) => {
    const avgs = submittedEntries
      .map(([, data]) => memberCategoryAvg(cat.id, data.ratings).avg)
      .filter((v) => v > 0)

    const teamAvgRank =
      avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0
    const minRank = avgs.length > 0 ? Math.min(...avgs) : 0
    const maxRank = avgs.length > 0 ? Math.max(...avgs) : 0

    // Per-skill team averages
    const skillAverages: Record<string, number> = {}
    for (const skill of cat.skills) {
      const vals = submittedEntries
        .map(([, data]) => data.ratings[skill.id])
        .filter((v) => v !== undefined && v > 0)
      skillAverages[skill.id] =
        vals.length > 0
          ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
          : 0
    }

    return {
      categoryId: cat.id,
      categoryLabel: cat.label,
      teamAvgRank: Math.round(teamAvgRank * 100) / 100,
      minRank: Math.round(minRank * 100) / 100,
      maxRank: Math.round(maxRank * 100) / 100,
      skillAverages,
    }
  })

  // Per-member summaries
  const members: TeamMemberAggregateResponse[] = teamMembers.map((member) => {
    const memberData = allRatings[member.slug]
    const memberRatings = memberData?.ratings ?? {}
    const roleTargets = targets[member.role] ?? {}

    const categoryAverages: Record<string, number> = {}
    for (const cat of skillCategories) {
      categoryAverages[cat.id] =
        Math.round(memberCategoryAvg(cat.id, memberRatings).avg * 100) / 100
    }

    // Compute gaps for this member
    const topGaps = skillCategories
      .map((cat) => {
        const avgRank = memberCategoryAvg(cat.id, memberRatings).avg
        const targetRank = roleTargets[cat.id] ?? 0
        const gap = targetRank - avgRank
        return {
          categoryId: cat.id,
          gap: Math.round(gap * 100) / 100,
        }
      })
      .filter((g) => g.gap > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3)

    // Per-skill ratings (all skills, for radar overlays)
    const skillRatings: Record<string, number> = {}
    for (const cat of skillCategories) {
      for (const skill of cat.skills) {
        const val = memberRatings[skill.id]
        if (val !== undefined && val >= 0) {
          skillRatings[skill.id] = val
        }
      }
    }

    // Top 3 strongest categories (highest avg, only rated)
    const topStrengths = skillCategories
      .map((cat) => ({
        categoryId: cat.id,
        avg: Math.round(memberCategoryAvg(cat.id, memberRatings).avg * 100) / 100,
      }))
      .filter((s) => s.avg > 0)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3)

    return {
      slug: member.slug,
      name: member.name,
      role: member.role,
      team: member.team,
      submittedAt: memberData?.submittedAt ?? null,
      categoryAverages,
      skillRatings,
      topGaps,
      topStrengths,
    }
  })

  // Weighted team target per category: average of each submitted member's role target
  const categoryTargets: Record<string, number> = {}
  for (const cat of skillCategories) {
    const targetValues = submittedEntries
      .map(([slug]) => {
        const member = teamMembers.find((m) => m.slug === slug)
        if (!member) return null
        const roleTarget = targets[member.role]
        return roleTarget?.[cat.id] ?? 0
      })
      .filter((v): v is number => v !== null)

    categoryTargets[cat.id] =
      targetValues.length > 0
        ? Math.round((targetValues.reduce((a, b) => a + b, 0) / targetValues.length) * 100) / 100
        : 0
  }

  return {
    teamSize: teamMembers.length,
    submittedCount,
    categoryTargets,
    categories,
    members,
  }
}

// Shared TypeScript types for API responses (contracts/api.md)

export interface CategoryResponse {
  id: string
  label: string
  emoji: string
  order: number
  skills: SkillResponse[]
}

export interface SkillResponse {
  id: string
  label: string
  categoryId: string
  descriptors: LevelDescriptorResponse[]
}

export interface LevelDescriptorResponse {
  level: number
  label: string
  description: string
}

export interface MemberResponse {
  slug: string
  name: string
  role: string
  team: string
}

export interface RatingResponse {
  ratings: Record<string, number>
  experience: Record<string, number>
  skippedCategories: string[]
  submittedAt: string | null
}

export interface MemberAggregateResponse {
  memberId: string
  memberName: string
  role: string
  submittedAt: string | null
  categories: CategoryAggregateResponse[]
  topGaps: GapResponse[]
}

export interface CategoryAggregateResponse {
  categoryId: string
  categoryLabel: string
  avgRank: number
  teamAvgRank: number
  targetRank: number
  gap: number
  ratedCount: number
  totalCount: number
}

export interface GapResponse {
  categoryId: string
  categoryLabel: string
  gap: number
  avgRank: number
  targetRank: number
}

export interface TeamAggregateResponse {
  teamSize: number
  submittedCount: number
  categoryTargets: Record<string, number>
  categories: TeamCategoryAggregateResponse[]
  members: TeamMemberAggregateResponse[]
}

export interface TeamCategoryAggregateResponse {
  categoryId: string
  categoryLabel: string
  teamAvgRank: number
  minRank: number
  maxRank: number
  skillAverages: Record<string, number>
}

export interface TeamMemberAggregateResponse {
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

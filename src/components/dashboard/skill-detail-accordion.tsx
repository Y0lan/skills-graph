import { useState, useCallback, useMemo } from 'react'
import { ChevronRight, Sparkles, TrendingUp } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useCatalog } from '@/hooks/use-catalog'
import { useSkillHistory } from '@/hooks/use-skill-history'
import { shortLabel, cn, strengthColor } from '@/lib/utils'
import type { CategoryAggregateResponse, TeamMemberAggregateResponse, TeamCategoryAggregateResponse, SkillChange } from '@/lib/types'
import MemberAvatar from '@/components/member-avatar'
import LevelUpDialog from '@/components/dashboard/level-up-dialog'
import { SkillSparkline, SkillProgressionChart, CategorySparkline } from '@/components/dashboard/progression-chart'

interface ComparedMember {
  slug: string
  name: string
  skillRatings: Record<string, number>
}

interface SkillDetailAccordionProps {
  memberId: string
  categories: CategoryAggregateResponse[]
  teamMembers: TeamMemberAggregateResponse[]
  teamCategories: TeamCategoryAggregateResponse[]
  comparedMember?: ComparedMember | null
  isOwnProfile?: boolean
  onOpenChat?: (prefill: string) => void
}

export default function SkillDetailAccordion({
  memberId, categories, teamMembers, teamCategories,
  comparedMember, isOwnProfile, onOpenChat,
}: SkillDetailAccordionProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [skillPulse, setSkillPulse] = useState<string | null>(null)
  const { categoryById } = useCatalog()
  const { changes, refetch } = useSkillHistory(memberId)

  // Track local rating overrides from skill-up (before server re-fetch)
  const [localOverrides, setLocalOverrides] = useState<Record<string, number>>({})

  const memberData = teamMembers.find(m => m.slug === memberId)

  const toggle = (catId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  const handleSkillUp = useCallback((skillId: string, _oldLevel: number, newLevel: number) => {
    setLocalOverrides(prev => ({ ...prev, [skillId]: newLevel }))
    setSkillPulse(skillId)
    setTimeout(() => setSkillPulse(null), 1500)
    refetch()
  }, [refetch])

  const getRating = (skillId: string): number => {
    if (skillId in localOverrides) return localOverrides[skillId]
    return memberData?.skillRatings[skillId] ?? 0
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Détail par catégorie
      </h3>
      <div className="space-y-1">
        {categories.map(cat => {
          const isOpen = expanded.has(cat.categoryId)
          const catalogCat = categoryById.get(cat.categoryId)
          const teamCat = teamCategories.find(tc => tc.categoryId === cat.categoryId)
          const skills = catalogCat?.skills ?? []
          const skillIds = skills.map(s => s.id)

          const ratedSkills = skills.filter(s => getRating(s.id) > 0)
          const unratedSkills = skills.filter(s => getRating(s.id) === 0)

          return (
            <div key={cat.categoryId} className="rounded-md border">
              <button
                onClick={() => toggle(cat.categoryId)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-90')} />
                  {catalogCat?.emoji && <span>{catalogCat.emoji}</span>}
                  {shortLabel(cat.categoryLabel)}
                </span>
                <span className="flex items-center gap-2">
                  {/* Feature #10: Category sparkline */}
                  <CategorySparkline changes={changes} skillIds={skillIds} />
                  <span className={cn('text-sm font-semibold tabular-nums', strengthColor(cat.avgRank))}>
                    {cat.avgRank.toFixed(1)}/5
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t px-3 pb-3 pt-2 space-y-4">
                  {ratedSkills.map(skill => {
                    const rating = getRating(skill.id)
                    const teamAvg = teamCat?.skillAverages[skill.id]
                    return (
                      <SkillRow
                        key={skill.id}
                        skillId={skill.id}
                        label={skill.label}
                        rating={rating}
                        teamAvg={teamAvg}
                        descriptors={skill.descriptors}
                        teamMembers={teamMembers}
                        comparedMember={comparedMember}
                        isOwnProfile={isOwnProfile}
                        memberId={memberId}
                        changes={changes}
                        pulse={skillPulse === skill.id}
                        onSkillUp={handleSkillUp}
                        onOpenChat={onOpenChat}
                      />
                    )
                  })}

                  {unratedSkills.length > 0 && (
                    <div className="space-y-2 opacity-50">
                      {unratedSkills.map(skill => {
                        const teamAvg = teamCat?.skillAverages[skill.id]
                        return (
                          <div key={skill.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{skill.label}</span>
                            <span className="text-xs text-muted-foreground">
                              Non évalué
                              {teamAvg !== undefined && (
                                <span className="ml-2">(équipe: {teamAvg.toFixed(1)})</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {skills.length === 0 && (
                    <p className="text-sm text-muted-foreground">Aucune compétence dans cette catégorie.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── SkillRow sub-components (non-exported) ─── */

interface SkillRowProps {
  skillId: string
  label: string
  rating: number
  teamAvg?: number
  descriptors: { level: number; label: string; description: string }[]
  teamMembers: TeamMemberAggregateResponse[]
  comparedMember?: ComparedMember | null
  isOwnProfile?: boolean
  memberId: string
  changes: SkillChange[]
  pulse: boolean
  onSkillUp: (skillId: string, oldLevel: number, newLevel: number) => void
  onOpenChat?: (prefill: string) => void
}

function SkillRow({
  skillId, label, rating, teamAvg, descriptors, teamMembers,
  comparedMember, isOwnProfile, memberId, changes, pulse,
  onSkillUp, onOpenChat,
}: SkillRowProps) {
  const [showChart, setShowChart] = useState(false)

  return (
    <div className={cn(
      'group/skill rounded-md transition-colors',
      pulse && rating > (changes.find(c => c.skillId === skillId)?.oldLevel ?? rating)
        ? 'bg-emerald-500/10 animate-pulse'
        : pulse ? 'bg-sky-500/10' : '',
    )}>
      <SkillRowHeader
        skillId={skillId}
        label={label}
        rating={rating}
        teamAvg={teamAvg}
        comparedMember={comparedMember}
        isOwnProfile={isOwnProfile}
        memberId={memberId}
        changes={changes}
        descriptors={descriptors}
        onSkillUp={onSkillUp}
      />
      <SkillRowLevelBar
        rating={rating}
        comparedMember={comparedMember}
        skillId={skillId}
        descriptors={descriptors}
      />
      <SkillRowSparkline
        changes={changes}
        skillId={skillId}
        label={label}
        showChart={showChart}
        onToggleChart={() => setShowChart(!showChart)}
      />
      <SkillRowDescriptors
        descriptors={descriptors}
        rating={rating}
        comparedMember={comparedMember}
        teamMembers={teamMembers}
        memberId={memberId}
        isOwnProfile={isOwnProfile}
        skillId={skillId}
      />
      {/* Action bar (own profile only) — AI buttons */}
      {isOwnProfile && (
        <div className="flex flex-wrap items-center gap-2 mt-2 ml-1">
          {onOpenChat && (
            <button
              onClick={() => onOpenChat(
                `Comment progresser en ${label} ? (actuellement ${rating}/5)`
              )}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              Conseil IA
            </button>
          )}
          {comparedMember != null && (comparedMember.skillRatings[skillId] ?? 0) > rating && onOpenChat && (
            <button
              onClick={() => onOpenChat(
                `Comment atteindre le niveau de ${comparedMember.name.split(' ')[0]} en ${label} ? (moi: ${rating}/5, ${comparedMember.name.split(' ')[0]}: ${comparedMember.skillRatings[skillId]}/5)`
              )}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/5 px-3 py-1 text-xs font-medium text-sky-500 hover:bg-sky-500/10 transition-colors"
            >
              Atteindre le niveau de {comparedMember.name.split(' ')[0]} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Feature #6/#7: Header with skill name (date tooltip), rating, and hover pill */
function SkillRowHeader({
  skillId, label, rating, teamAvg, comparedMember, isOwnProfile,
  memberId, changes, descriptors, onSkillUp,
}: {
  skillId: string
  label: string
  rating: number
  teamAvg?: number
  comparedMember?: ComparedMember | null
  isOwnProfile?: boolean
  memberId: string
  changes: SkillChange[]
  descriptors: { level: number; label: string; description: string }[]
  onSkillUp: (skillId: string, oldLevel: number, newLevel: number) => void
}) {
  const hasComparison = comparedMember != null
  const comparedRating = comparedMember?.skillRatings[skillId] ?? 0

  const contextLabel = hasComparison
    ? `(${comparedMember!.name.split(' ')[0]}: ${comparedRating}/5)`
    : teamAvg !== undefined
      ? `(équipe: ${teamAvg.toFixed(1)})`
      : ''

  // Feature #8: Date tooltip data
  const skillChanges = useMemo(
    () => changes.filter(c => c.skillId === skillId),
    [changes, skillId],
  )
  const firstChange = skillChanges.length > 0 ? skillChanges[0] : null
  const lastChange = skillChanges.length > 1 ? skillChanges[skillChanges.length - 1] : null
  const dateTooltip = firstChange
    ? lastChange
      ? `Validé le ${firstChange.changedAt.split('T')[0]}\nDernière mise à jour le ${lastChange.changedAt.split('T')[0]}`
      : `Validé le ${firstChange.changedAt.split('T')[0]}`
    : 'Non évalué'

  return (
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2 min-w-0">
        {/* Feature #8: Date tooltip on skill name */}
        <Tooltip>
          <TooltipTrigger render={<span className="text-sm font-medium truncate" />}>
            {label}
          </TooltipTrigger>
          <TooltipContent side="top" className="whitespace-pre-line text-xs">
            {dateTooltip}
          </TooltipContent>
        </Tooltip>

        {/* Feature #6/#7: Hover pill "J'ai progressé!" */}
        {isOwnProfile && (
          <LevelUpDialog
            skillId={skillId}
            skillName={label}
            currentLevel={rating}
            descriptors={descriptors}
            slug={memberId}
            onSuccess={(oldLevel, newLevel) => onSkillUp(skillId, oldLevel, newLevel)}
            trigger={
              <button className={cn(
                'inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 transition-opacity',
                // Mobile: always visible. Desktop with hover: hidden until group hover
                'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/skill:opacity-100',
              )}>
                <TrendingUp className="h-3 w-3" />
                J'ai progressé !
              </button>
            }
          />
        )}
      </div>
      <span className="text-sm tabular-nums flex items-center gap-1 shrink-0">
        <span className={cn('font-semibold', strengthColor(rating))}>{rating}/5</span>
        {contextLabel && (
          <span className="text-muted-foreground text-xs">{contextLabel}</span>
        )}
      </span>
    </div>
  )
}

/** Level bar — 5 segments with tooltips */
function SkillRowLevelBar({
  rating, comparedMember, skillId, descriptors,
}: {
  rating: number
  comparedMember?: ComparedMember | null
  skillId: string
  descriptors: { level: number; label: string; description: string }[]
}) {
  const hasComparison = comparedMember != null
  const comparedRating = comparedMember?.skillRatings[skillId] ?? 0

  return (
    <div className="flex gap-0.5 mb-2">
      {Array.from({ length: 5 }, (_, i) => {
        const level = i + 1
        const descriptor = descriptors.find(d => d.level === level)
        const isMine = level <= rating
        const isTheirs = hasComparison && level <= comparedRating

        const segmentColor = isMine
          ? 'bg-emerald-500'
          : isTheirs
            ? 'bg-sky-500/30'
            : 'bg-muted-foreground/15'

        return (
          <Tooltip key={level}>
            <TooltipTrigger
              render={<div className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', segmentColor)} />}
            />
            <TooltipContent side="top">
              {descriptor
                ? `Niveau ${level} — ${descriptor.label}: ${descriptor.description}`
                : `Niveau ${level}`}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** Sparkline row + expandable progression chart */
function SkillRowSparkline({
  changes, skillId, label, showChart, onToggleChart,
}: {
  changes: SkillChange[]
  skillId: string
  label: string
  showChart: boolean
  onToggleChart: () => void
}) {
  const hasHistory = changes.filter(c => c.skillId === skillId).length >= 1

  return (
    <>
      {hasHistory && (
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={onToggleChart}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkillSparkline changes={changes} skillId={skillId} />
            <span>Voir progression</span>
          </button>
        </div>
      )}
      {showChart && (
        <SkillProgressionChart changes={changes} skillId={skillId} skillName={label} />
      )}
    </>
  )
}

/** Level descriptor cards with avatars and comparison labels */
function SkillRowDescriptors({
  descriptors, rating, comparedMember, teamMembers, memberId, isOwnProfile, skillId,
}: {
  descriptors: { level: number; label: string; description: string }[]
  rating: number
  comparedMember?: ComparedMember | null
  teamMembers: TeamMemberAggregateResponse[]
  memberId: string
  isOwnProfile?: boolean
  skillId: string
}) {
  const hasComparison = comparedMember != null
  const comparedRating = comparedMember?.skillRatings[skillId] ?? 0

  // Build avatar lookup: which members are at each level
  const membersByLevel = useMemo(() => {
    const map = new Map<number, TeamMemberAggregateResponse[]>()
    for (const m of teamMembers) {
      if (m.slug === memberId) continue
      const level = m.skillRatings[skillId]
      if (level !== undefined && level > 0) {
        const list = map.get(level) ?? []
        list.push(m)
        map.set(level, list)
      }
    }
    return map
  }, [teamMembers, memberId, skillId])

  if (descriptors.length === 0) return null

  return (
    <div className="space-y-1">
      {[...descriptors]
        .sort((a, b) => a.level - b.level)
        .map(d => {
          const myAcquired = d.level <= rating
          const theirAcquired = hasComparison ? d.level <= comparedRating : false

          // Comparison label
          let compLabel = ''
          if (hasComparison) {
            if (myAcquired && theirAcquired) compLabel = 'les 2'
            else if (myAcquired && !theirAcquired) {
              const profileOwner = teamMembers.find(m => m.slug === memberId)
              const profileFirstName = profileOwner?.name?.split(' ')[0] ?? ''
              compLabel = isOwnProfile ? 'moi' : profileFirstName
            }
            else if (!myAcquired && theirAcquired) compLabel = comparedMember!.name.split(' ')[0]
          }

          const cardClasses = myAcquired
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : (hasComparison && theirAcquired)
              ? 'bg-sky-500/5 border-sky-500/20'
              : 'bg-transparent border-transparent'

          const badgeClasses = myAcquired
            ? 'bg-emerald-500/20 text-emerald-500'
            : (hasComparison && theirAcquired)
              ? 'bg-sky-500/20 text-sky-500'
              : 'bg-muted text-muted-foreground'

          const compLabelColor = (myAcquired && theirAcquired)
            ? 'text-muted-foreground'
            : myAcquired
              ? 'text-emerald-500'
              : (hasComparison && theirAcquired)
                ? 'text-sky-500'
                : 'text-muted-foreground'

          const membersAtLevel = membersByLevel.get(d.level) ?? []

          return (
            <div key={d.level} className={cn(
              'flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-xs transition-all duration-300',
              cardClasses,
            )}>
              <span className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold shrink-0',
                badgeClasses,
              )}>
                {d.level}
              </span>
              <span className="flex-1 min-w-0">{d.description}</span>
              {compLabel && (
                <span className={cn('text-[10px] font-medium shrink-0', compLabelColor)}>
                  {compLabel}
                </span>
              )}
              {/* Feature #9: Avatar click → navigate to profile */}
              {membersAtLevel.length > 0 && (
                <div className="flex items-center shrink-0 -space-x-1">
                  {membersAtLevel.slice(0, 3).map(m => (
                    <MemberAvatar
                      key={m.slug}
                      slug={m.slug}
                      name={m.name}
                      role={m.role}
                      size={20}
                      className="border border-background"
                      href={`/dashboard/${m.slug}`}
                    />
                  ))}
                  {membersAtLevel.length > 3 && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div className="flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[9px] font-medium border border-background" style={{ width: 20, height: 20 }} />
                        }
                      >
                        +{membersAtLevel.length - 3}
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {membersAtLevel.slice(3).map(m => m.name).join(', ')}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}

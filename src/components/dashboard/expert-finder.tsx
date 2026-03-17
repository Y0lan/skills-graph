import { useState, useMemo, useRef } from 'react'
import { Check, X, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCatalog } from '@/hooks/use-catalog'
import { rankMembersBySkills, type ExpertResult } from '@/lib/expert-finder'
import type { TeamMemberAggregateResponse } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ExpertFinderProps {
  members: TeamMemberAggregateResponse[]
  initialCategoryId?: string | null
}

/** Return a Tailwind class for a skill score badge. */
function scoreColorClass(score: number | null): string {
  if (score === null) return 'bg-muted text-muted-foreground'
  if (score >= 4) return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
  if (score >= 3) return 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
  if (score >= 2) return 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
  if (score >= 1) return 'bg-red-500/20 text-red-600 dark:text-red-400'
  return 'bg-muted text-muted-foreground'
}

export default function ExpertFinder({ members, initialCategoryId }: ExpertFinderProps) {
  const { categories: skillCategories, skillById } = useCatalog()
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    initialCategoryId ?? null
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [prevHint, setPrevHint] = useState(initialCategoryId)

  // Sync activeCategoryId when initialCategoryId changes (from gap deep-link)
  if (initialCategoryId && initialCategoryId !== prevHint) {
    setPrevHint(initialCategoryId)
    setActiveCategoryId(initialCategoryId)
  }

  /** Resolve a skill id to its label from the catalog. */
  const skillLabel = (skillId: string): string => {
    return skillById.get(skillId)?.label ?? skillId
  }

  // Build the flat skill list sorted alphabetically with category metadata
  const allSkills = useMemo(() => {
    return skillCategories
      .flatMap((cat) =>
        cat.skills.map((skill) => ({
          id: skill.id,
          label: skill.label,
          categoryId: cat.id,
          categoryLabel: cat.label,
          categoryEmoji: '',
        })),
      )
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [skillCategories])

  // Filter skills by search query
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return allSkills
    const q = searchQuery.toLowerCase()
    return allSkills.filter(
      (s) => s.label.toLowerCase().includes(q) || s.categoryLabel.toLowerCase().includes(q),
    )
  }, [allSkills, searchQuery])

  // Skills for the active category in the browse navigation
  const activeCategorySkills = useMemo(() => {
    if (!activeCategoryId) return []
    const cat = skillCategories.find((c) => c.id === activeCategoryId)
    return cat?.skills ?? []
  }, [activeCategoryId, skillCategories])

  // Ranking results
  const results: ExpertResult[] = useMemo(
    () => rankMembersBySkills(members, selectedSkillIds),
    [members, selectedSkillIds],
  )

  const toggleSkill = (skillId: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId],
    )
  }

  const removeSkill = (skillId: string) => {
    setSelectedSkillIds((prev) => prev.filter((id) => id !== skillId))
  }

  const clearAll = () => {
    setSelectedSkillIds([])
  }

  // Check if any results have at least one match
  const hasResults = results.some((r) => r.matchCount > 0)

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Recherche d'experts
        </CardTitle>
        <CardDescription>
          Trouvez les membres de l'équipe les plus qualifiés pour des compétences spécifiques
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Search bar + dropdown skill picker */}
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Rechercher une compétence par nom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={(e) => {
                // Keep open if clicking inside the dropdown
                if (dropdownRef.current?.contains(e.relatedTarget as Node)) return
                setIsSearchFocused(false)
              }}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-ring/50 focus:border-ring focus:ring-3 focus:ring-ring/50"
            />
          </div>

          {/* Dropdown list */}
          {isSearchFocused && (
            <div
              ref={dropdownRef}
              className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg"
            >
              {filteredSkills.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Aucune compétence trouvée.
                </div>
              ) : (
                <ul className="py-1">
                  {filteredSkills.map((skill) => {
                    const isSelected = selectedSkillIds.includes(skill.id)
                    return (
                      <li key={skill.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            toggleSkill(skill.id)
                            searchRef.current?.focus()
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                            isSelected && 'bg-accent/50',
                          )}
                        >
                          <Check
                            className={cn(
                              'h-4 w-4 shrink-0',
                              isSelected ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="flex-1">{skill.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {skill.categoryLabel}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Category > Skill browse navigation */}
        <div className="space-y-2">
          {/* Category pills */}
          <div className="flex flex-wrap gap-1.5">
            {skillCategories.map((cat) => {
              const isActive = activeCategoryId === cat.id
              const selectedInCat = cat.skills.filter((s) => selectedSkillIds.includes(s.id)).length
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryId(isActive ? null : cat.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <span>{cat.label}</span>
                  {selectedInCat > 0 && (
                    <span className={cn(
                      'flex h-4 min-w-4 items-center justify-center rounded-full text-[10px] font-bold',
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-primary/15 text-primary',
                    )}>
                      {selectedInCat}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Skill chips for the active category */}
          {activeCategoryId && activeCategorySkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-border/50 bg-muted/30 p-2.5">
              {activeCategorySkills.map((skill) => {
                const isSelected = selectedSkillIds.includes(skill.id)
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => toggleSkill(skill.id)}
                    className={cn(
                      'flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-all',
                      isSelected
                        ? 'border-primary/40 bg-primary/10 text-primary dark:border-primary/30'
                        : 'border-border/60 bg-background text-foreground/70 hover:border-border hover:bg-accent',
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {skill.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected skill badges */}
        {selectedSkillIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedSkillIds.map((skillId) => (
              <Badge key={skillId} variant="secondary" className="gap-1 pr-1">
                {skillLabel(skillId)}
                <button
                  type="button"
                  onClick={() => removeSkill(skillId)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Retirer {skillLabel(skillId)}</span>
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-6 text-xs">
              Tout effacer
            </Button>
          </div>
        )}

        {/* Empty state: no skills selected */}
        {selectedSkillIds.length === 0 && !activeCategoryId && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              Sélectionnez des compétences pour trouver les experts de l'équipe
            </p>
          </div>
        )}

        {/* Empty state: skills selected but no members match */}
        {selectedSkillIds.length > 0 && !hasResults && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              Aucun membre n'a encore évalué ces compétences
            </p>
          </div>
        )}

        {/* Results table */}
        {selectedSkillIds.length > 0 && hasResults && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Membre</TableHead>
                  <TableHead>Compétences</TableHead>
                  <TableHead className="text-center">Moy.</TableHead>
                  <TableHead className="text-center">Couverture</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={result.slug}>
                    <TableCell className="text-center font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{result.name}</div>
                      {result.role && (
                        <div className="text-xs text-muted-foreground">{result.role}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSkillIds.map((skillId) => {
                          const score = result.skillScores[skillId]
                          return (
                            <span
                              key={skillId}
                              className={cn(
                                'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium',
                                scoreColorClass(score),
                              )}
                            >
                              {skillLabel(skillId)}: {score !== null ? score.toFixed(1) : '—'}
                            </span>
                          )
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums font-semibold">
                      {result.matchCount > 0 ? result.averageScore.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs">
                        {result.matchCount}/{result.totalSelected}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

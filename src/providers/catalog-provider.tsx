import { useState, useEffect, type ReactNode } from 'react'
import type { SkillCategory } from '@/data/skill-catalog'
import type { RatingLevel } from '@/data/rating-scale'
import {
  CatalogContext,
  defaultCatalogValue,
  type CatalogContextValue,
  type CalibrationPrompt,
} from '@/lib/catalog-context'

interface CatalogResponse {
  categories: (SkillCategory & { calibrationPrompt?: CalibrationPrompt | null })[]
  ratingScale: RatingLevel[]
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<CatalogContextValue>(defaultCatalogValue)

  useEffect(() => {
    fetch('/api/catalog')
      .then((res) => res.json())
      .then((data: CatalogResponse) => {
        const calibrationPrompts: Record<string, CalibrationPrompt> = {}
        const categories: SkillCategory[] = data.categories.map((cat) => {
          if (cat.calibrationPrompt) {
            calibrationPrompts[cat.id] = cat.calibrationPrompt
          }
          return {
            id: cat.id,
            label: cat.label,
            emoji: cat.emoji,
            skills: cat.skills,
          }
        })

        const allSkills = categories.flatMap((c) => c.skills)

        setValue({
          categories,
          ratingScale: data.ratingScale,
          calibrationPrompts,
          allSkills,
          skillById: new Map(allSkills.map((s) => [s.id, s])),
          categoryById: new Map(categories.map((c) => [c.id, c])),
          loading: false,
        })
      })
      .catch((err) => {
        console.error('Failed to load catalog:', err)
        setValue((prev) => ({ ...prev, loading: false }))
      })
  }, [])

  return <CatalogContext value={value}>{children}</CatalogContext>
}

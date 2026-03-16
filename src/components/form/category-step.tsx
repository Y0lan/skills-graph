import { useCallback } from 'react'
import type { SkillCategory } from '@/data/skill-catalog'
import { AlertTriangle } from 'lucide-react'
import CalibrationPrompt from './calibration-prompt'
import SkillRatingRow from './skill-rating-row'

interface CategoryStepProps {
  category: SkillCategory
  ratings: Record<string, number>
  isSkipped: boolean
  calibrationPrompt?: { text: string; tools?: string[] }
  validationMessage?: string
  unratedSkillIds?: string[]
  onRatingChange: (skillId: string, value: number) => void
}

export default function CategoryStep({
  category,
  ratings,
  isSkipped,
  calibrationPrompt,
  validationMessage,
  unratedSkillIds,
  onRatingChange,
}: CategoryStepProps) {
  const handleRatingChange = useCallback((skillId: string, value: number) => {
    onRatingChange(skillId, value)

    // Auto-scroll to next unrated skill after a short delay
    setTimeout(() => {
      const currentIdx = category.skills.findIndex((s) => s.id === skillId)
      const nextUnrated = category.skills.find(
        (s, i) => i > currentIdx && ratings[s.id] === undefined && s.id !== skillId,
      )
      if (nextUnrated) {
        const el = document.querySelector(`[data-skill="${nextUnrated.id}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 300)
  }, [onRatingChange, category.skills, ratings])
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {calibrationPrompt && (
        <CalibrationPrompt
          text={calibrationPrompt.text}
          categoryEmoji={category.emoji}
          categoryLabel={category.label}
          tools={calibrationPrompt.tools}
        />
      )}

      {validationMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-400" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {validationMessage}
        </div>
      )}

      {isSkipped ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Cette catégorie a été ignorée. Toutes les compétences sont exclues des métriques.
        </div>
      ) : (
        <div className="space-y-3">
          {category.skills.map((skill) => (
            <SkillRatingRow
              key={skill.id}
              skill={skill}
              value={ratings[skill.id]}
              onChange={(value) => handleRatingChange(skill.id, value)}
              showError={unratedSkillIds?.includes(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import type { SkillCategory } from '@/data/skill-catalog'
import { AlertTriangle } from 'lucide-react'
import CalibrationPrompt from './calibration-prompt'
import SkillRatingRow from './skill-rating-row'
import SkipCategoryButton from './skip-category-button'

interface CategoryStepProps {
  category: SkillCategory
  stepNumber: number
  ratings: Record<string, number>
  isSkipped: boolean
  calibrationPrompt?: { text: string; tools?: string[] }
  validationMessage?: string
  unratedSkillIds?: string[]
  onRatingChange: (skillId: string, value: number) => void
  onSkip: () => void
  onUnskip: () => void
  onNext?: () => void
}

export default function CategoryStep({
  category,
  stepNumber,
  ratings,
  isSkipped,
  calibrationPrompt,
  validationMessage,
  unratedSkillIds,
  onRatingChange,
  onSkip,
  onUnskip,
  onNext,
}: CategoryStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-xl font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{stepNumber}</span>
          {category.label}
        </h2>
        <SkipCategoryButton
          categoryLabel={category.label}
          isSkipped={isSkipped}
          onSkip={onSkip}
          onUnskip={onUnskip}
          onNext={onNext}
        />
      </div>

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
              onChange={(value) => onRatingChange(skill.id, value)}
              showError={unratedSkillIds?.includes(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

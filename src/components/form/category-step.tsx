import type { SkillCategory } from '@/data/skill-catalog'
import CalibrationPrompt from './calibration-prompt'
import SkillRatingRow from './skill-rating-row'
import SkipCategoryButton from './skip-category-button'

interface CategoryStepProps {
  category: SkillCategory
  stepNumber: number
  ratings: Record<string, number>
  isSkipped: boolean
  calibrationPrompt?: { text: string; tools?: string[] }
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
              value={ratings[skill.id] ?? 0}
              onChange={(value) => onRatingChange(skill.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

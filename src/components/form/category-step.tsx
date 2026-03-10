import type { SkillCategory } from '@/data/skill-catalog'
import CalibrationPrompt from './calibration-prompt'
import SkillRatingRow from './skill-rating-row'
import SkipCategoryButton from './skip-category-button'

interface CategoryStepProps {
  category: SkillCategory
  ratings: Record<string, number>
  isSkipped: boolean
  calibrationPrompt?: string
  onRatingChange: (skillId: string, value: number) => void
  onSkip: () => void
  onUnskip: () => void
}

export default function CategoryStep({
  category,
  ratings,
  isSkipped,
  calibrationPrompt,
  onRatingChange,
  onSkip,
  onUnskip,
}: CategoryStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {category.emoji} {category.label}
        </h2>
        <SkipCategoryButton
          categoryLabel={category.label}
          isSkipped={isSkipped}
          onSkip={onSkip}
          onUnskip={onUnskip}
        />
      </div>

      {calibrationPrompt && <CalibrationPrompt text={calibrationPrompt} />}

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

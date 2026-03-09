import type { SkillCategory } from '@/data/skill-catalog'
import { calibrationPrompts } from '@/data/calibration-prompts'
import CalibrationPrompt from './calibration-prompt'
import SkillRatingRow from './skill-rating-row'
import ExperienceSelector from './experience-selector'
import SkipCategoryButton from './skip-category-button'

interface CategoryStepProps {
  category: SkillCategory
  ratings: Record<string, number>
  experience: Record<string, number>
  isSkipped: boolean
  onRatingChange: (skillId: string, value: number) => void
  onExperienceChange: (skillId: string, value: number) => void
  onSkip: () => void
  onUnskip: () => void
}

export default function CategoryStep({
  category,
  ratings,
  experience,
  isSkipped,
  onRatingChange,
  onExperienceChange,
  onSkip,
  onUnskip,
}: CategoryStepProps) {
  const prompt = calibrationPrompts[category.id]

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

      {prompt && <CalibrationPrompt text={prompt} />}

      {isSkipped ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          This category has been skipped. All skills are excluded from metrics.
        </div>
      ) : (
        <div className="space-y-3">
          {category.skills.map((skill) => (
            <div key={skill.id} className="space-y-1">
              <SkillRatingRow
                skill={skill}
                value={ratings[skill.id] ?? 0}
                onChange={(value) => onRatingChange(skill.id, value)}
              />
              <div className="flex items-center gap-2 pl-3">
                <span className="text-xs text-muted-foreground">Experience:</span>
                <ExperienceSelector
                  value={experience[skill.id] ?? 0}
                  onChange={(value) => onExperienceChange(skill.id, value)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

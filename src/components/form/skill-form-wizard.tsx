import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { skillCategories } from '@/data/skill-catalog'
import RatingLegend from './rating-legend'
import ProgressBar from './progress-bar'
import CategoryStep from './category-step'
import { ChevronLeft, ChevronRight, Send } from 'lucide-react'

interface SkillFormWizardProps {
  initialRatings: Record<string, number>
  initialExperience: Record<string, number>
  initialSkippedCategories: string[]
  onSubmit: (data: {
    ratings: Record<string, number>
    experience: Record<string, number>
    skippedCategories: string[]
  }) => void
  submitting: boolean
}

export default function SkillFormWizard({
  initialRatings,
  initialExperience,
  initialSkippedCategories,
  onSubmit,
  submitting,
}: SkillFormWizardProps) {
  const [step, setStep] = useState(0)
  const [ratings, setRatings] = useState<Record<string, number>>({ ...initialRatings })
  const [experience, setExperience] = useState<Record<string, number>>({
    ...initialExperience,
  })
  const [skippedCategories, setSkippedCategories] = useState<Set<string>>(
    new Set(initialSkippedCategories),
  )

  const category = skillCategories[step]
  const isLastStep = step === skillCategories.length - 1
  const isSkipped = skippedCategories.has(category.id)

  const handleRatingChange = useCallback((skillId: string, value: number) => {
    setRatings((prev) => ({ ...prev, [skillId]: value }))
  }, [])

  const handleExperienceChange = useCallback((skillId: string, value: number) => {
    setExperience((prev) => ({ ...prev, [skillId]: value }))
  }, [])

  const handleSkip = useCallback(() => {
    setSkippedCategories((prev) => new Set(prev).add(category.id))
  }, [category.id])

  const handleUnskip = useCallback(() => {
    setSkippedCategories((prev) => {
      const next = new Set(prev)
      next.delete(category.id)
      return next
    })
  }, [category.id])

  const handleSubmit = () => {
    onSubmit({
      ratings,
      experience,
      skippedCategories: Array.from(skippedCategories),
    })
  }

  return (
    <div className="space-y-6">
      <ProgressBar
        currentStep={step}
        totalSteps={skillCategories.length}
        categoryLabel={category.label}
      />

      <RatingLegend />

      <CategoryStep
        key={category.id}
        category={category}
        ratings={ratings}
        experience={experience}
        isSkipped={isSkipped}
        onRatingChange={handleRatingChange}
        onExperienceChange={handleExperienceChange}
        onSkip={handleSkip}
        onUnskip={handleUnskip}
      />

      <div className="flex items-center justify-between border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        {isLastStep ? (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

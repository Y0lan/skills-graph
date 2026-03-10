import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useCatalog } from '@/hooks/use-catalog'
import { useSkillForm } from '@/hooks/use-skill-form'
import { useAutosave } from '@/hooks/use-autosave'
import type { SkillFormValues } from '@/lib/schemas'
import RatingLegend from './rating-legend'
import ProgressBar from './progress-bar'
import type { StepInfo } from './progress-bar'
import CategoryStep from './category-step'
import ReviewStep from './review-step'
import { ArrowLeft, ChevronLeft, ChevronRight, Send } from 'lucide-react'

interface SkillFormWizardProps {
  slug: string
  initialData: SkillFormValues
  onSubmit: (data: SkillFormValues) => Promise<void>
  submitting: boolean
}

export default function SkillFormWizard({
  slug,
  initialData,
  onSubmit,
  submitting,
}: SkillFormWizardProps) {
  const { categories: skillCategories, ratingScale, calibrationPrompts } = useCatalog()

  const TOTAL_CATEGORY_STEPS = skillCategories.length
  const REVIEW_STEP = TOTAL_CATEGORY_STEPS

  const { form, ratings, skippedCategories, setRating, toggleSkipCategory, isSkipped } =
    useSkillForm({ defaultValues: initialData })

  useAutosave({ control: form.control, slug })

  const [editingFromReview, setEditingFromReview] = useState(false)

  const [step, setStep] = useState(() => {
    // Resume at first incomplete step
    for (let i = 0; i < TOTAL_CATEGORY_STEPS; i++) {
      const cat = skillCategories[i]
      if (skippedCategories.includes(cat.id)) continue
      const allRated = cat.skills.every(
        (s) => initialData.ratings[s.id] !== undefined && initialData.ratings[s.id] >= 0,
      )
      if (!allRated) return i
    }
    return REVIEW_STEP
  })

  const isReviewStep = step === REVIEW_STEP
  const category = !isReviewStep ? skillCategories[step] : null

  // Build step info for progress bar
  const progressSteps: StepInfo[] = [
    ...skillCategories.map((cat) => {
      const ratedCount = cat.skills.filter(
        (s) => ratings[s.id] !== undefined && ratings[s.id] >= 0,
      ).length
      return {
        label: cat.label,
        emoji: cat.emoji,
        ratedCount,
        totalCount: cat.skills.length,
        isSkipped: isSkipped(cat.id),
      }
    }),
    {
      label: 'Récapitulatif',
      emoji: '✅',
      ratedCount: 0,
      totalCount: 0,
      isSkipped: false,
    },
  ]

  // Validate current step before advancing (T017)
  const validateCurrentStep = useCallback((): boolean => {
    if (isReviewStep) return true
    const cat = skillCategories[step]
    if (!cat || isSkipped(cat.id)) return true

    const unratedSkills = cat.skills.filter(
      (s) => ratings[s.id] === undefined || ratings[s.id] < 0,
    )

    if (unratedSkills.length > 0) {
      // Scroll to first unrated skill (T018)
      const firstUnrated = unratedSkills[0]
      const el = document.querySelector(`[data-skill="${firstUnrated.id}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return false
    }
    return true
  }, [step, ratings, isSkipped, isReviewStep, skillCategories])

  const handleNext = () => {
    if (!validateCurrentStep()) return
    setStep((s) => Math.min(s + 1, REVIEW_STEP))
  }

  const handlePrev = () => {
    setStep((s) => Math.max(s - 1, 0))
  }

  const handleGoToStep = (targetStep: number) => {
    if (targetStep >= 0 && targetStep <= REVIEW_STEP) {
      if (step === REVIEW_STEP && targetStep !== REVIEW_STEP) {
        setEditingFromReview(true)
      }
      setStep(targetStep)
    }
  }

  const handleBackToReview = () => {
    if (!validateCurrentStep()) return
    setEditingFromReview(false)
    setStep(REVIEW_STEP)
  }

  const handleSubmit = async () => {
    const values = form.getValues()
    await onSubmit(values)
  }

  return (
    <div className="space-y-6">
      <ProgressBar
        currentStep={step}
        steps={progressSteps}
        onStepClick={handleGoToStep}
      />

      <RatingLegend ratingScale={ratingScale} />

      {isReviewStep ? (
        <ReviewStep
          ratings={ratings}
          experience={form.getValues('experience')}
          skippedCategories={form.getValues('skippedCategories')}
          categories={skillCategories}
          ratingScale={ratingScale}
          onGoToStep={handleGoToStep}
        />
      ) : (
        category && (
          <CategoryStep
            key={category.id}
            category={category}
            ratings={ratings}
            isSkipped={isSkipped(category.id)}
            calibrationPrompt={calibrationPrompts[category.id]?.text}
            onRatingChange={setRating}
            onSkip={() => toggleSkipCategory(category.id)}
            onUnskip={() => toggleSkipCategory(category.id)}
          />
        )
      )}

      <div className="flex items-center justify-between border-t pt-4">
        {editingFromReview && !isReviewStep ? (
          <Button type="button" onClick={handleBackToReview} className="gap-2 mx-auto">
            <ArrowLeft className="h-4 w-4" />
            Retour au récapitulatif
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handlePrev}
              disabled={step === 0}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Retour
            </Button>

            {isReviewStep ? (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Envoi en cours...' : 'Soumettre l\u2019évaluation'}
              </Button>
            ) : (
              <Button type="button" onClick={handleNext} className="gap-2">
                Suivant
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

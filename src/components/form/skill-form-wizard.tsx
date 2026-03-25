import { useState, useCallback, useEffect, useMemo } from 'react'
import { useCatalog } from '@/hooks/use-catalog'
import { useSkillForm } from '@/hooks/use-skill-form'
import { useAutosave, type SaveStatus } from '@/hooks/use-autosave'
import type { SkillFormValues } from '@/lib/schemas'
import RatingLegend from './rating-legend'
import ProgressBar from './progress-bar'
import type { StepInfo } from './progress-bar'
import CategoryBar from './category-bar'
import CategoryStep from './category-step'
import ReviewStep from './review-step'

export interface WizardNavigation {
  step: number
  isFirstStep: boolean
  isReview: boolean
  editingFromReview: boolean
  submitting: boolean
  saveStatus: SaveStatus
  onPrev: () => void
  onNext: () => void
  onBackToReview: () => void
  onSubmit: () => void
}

interface SkillFormWizardProps {
  slug: string
  initialData: SkillFormValues
  onSubmit: (data: SkillFormValues) => Promise<void>
  submitting: boolean
  onNavigationChange?: (nav: WizardNavigation) => void
  autosaveEndpoint?: string
}

export default function SkillFormWizard({
  slug,
  initialData,
  onSubmit,
  submitting,
  onNavigationChange,
  autosaveEndpoint,
}: SkillFormWizardProps) {
  const { categories: skillCategories, ratingScale, calibrationPrompts } = useCatalog()

  const TOTAL_CATEGORY_STEPS = skillCategories.length
  const REVIEW_STEP = TOTAL_CATEGORY_STEPS

  const { form, ratings, skippedCategories, setRating, toggleSkipCategory, isSkipped } =
    useSkillForm({ defaultValues: initialData })

  const { saveStatus } = useAutosave({ control: form.control, slug, endpoint: autosaveEndpoint })

  const [editingFromReview, setEditingFromReview] = useState(false)
  const [unratedSkillIds, setUnratedSkillIds] = useState<string[]>([])
  const [validationMessage, setValidationMessage] = useState<string>()

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

  // Clear validation errors when ratings change or step changes
  useEffect(() => {
    setUnratedSkillIds([])
    setValidationMessage(undefined)
  }, [ratings, step])

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  // Compute highest reachable step for locking
  const highestReachableStep = useMemo(() => {
    for (let i = 0; i < TOTAL_CATEGORY_STEPS; i++) {
      const cat = skillCategories[i]
      if (isSkipped(cat.id)) continue
      const allRated = cat.skills.every((s) => ratings[s.id] !== undefined)
      if (!allRated) return i
    }
    return REVIEW_STEP
  }, [ratings, skillCategories, isSkipped, TOTAL_CATEGORY_STEPS, REVIEW_STEP])

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

  // Validate current step before advancing
  const validateCurrentStep = useCallback((): boolean => {
    if (isReviewStep) return true
    const cat = skillCategories[step]
    if (!cat || isSkipped(cat.id)) return true

    const unrated = cat.skills.filter((s) => ratings[s.id] === undefined)

    if (unrated.length > 0) {
      const ids = unrated.map((s) => s.id)
      setUnratedSkillIds(ids)
      setValidationMessage(
        `Vous avez oublié de répondre à ${unrated.length} question${unrated.length > 1 ? 's' : ''}`,
      )
      // Scroll to first unrated skill
      const el = document.querySelector(`[data-skill="${ids[0]}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    setUnratedSkillIds([])
    setValidationMessage(undefined)
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
    if (targetStep < 0 || targetStep > REVIEW_STEP) return
    // Allow backward navigation always
    // Allow forward navigation only up to highestReachableStep (unless editing from review)
    if (targetStep > step && !editingFromReview && targetStep > highestReachableStep) return
    if (step === REVIEW_STEP && targetStep !== REVIEW_STEP) {
      setEditingFromReview(true)
    }
    setStep(targetStep)
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

  useEffect(() => {
    onNavigationChange?.({
      step,
      isFirstStep: step === 0,
      isReview: isReviewStep,
      editingFromReview,
      submitting,
      saveStatus,
      onPrev: handlePrev,
      onNext: handleNext,
      onBackToReview: handleBackToReview,
      onSubmit: handleSubmit,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isReviewStep, editingFromReview, submitting, saveStatus, ratings, skippedCategories])

  return (
    <div className="space-y-6">
      <ProgressBar
        currentStep={step}
        steps={progressSteps}
        onStepClick={handleGoToStep}
        lockedFromStep={editingFromReview ? undefined : highestReachableStep + 1}
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
          <>
            <CategoryBar
              stepNumber={step + 1}
              categoryLabel={category.label}
              ratedCount={progressSteps[step].ratedCount}
              totalCount={category.skills.length}
              isSkipped={isSkipped(category.id)}
              allRated={category.skills.every((s) => ratings[s.id] !== undefined)}
              isFirstStep={step === 0}
              editingFromReview={editingFromReview}
              onPrev={handlePrev}
              onNext={handleNext}
              onBackToReview={handleBackToReview}
              skipButtonProps={{
                categoryLabel: category.label,
                isSkipped: isSkipped(category.id),
                onSkip: () => toggleSkipCategory(category.id),
                onUnskip: () => toggleSkipCategory(category.id),
                onNext: () => setStep((s) => Math.min(s + 1, REVIEW_STEP)),
              }}
            />
            <CategoryStep
              key={category.id}
              category={category}
              ratings={ratings}
              isSkipped={isSkipped(category.id)}
              calibrationPrompt={calibrationPrompts[category.id]}
              validationMessage={validationMessage}
              unratedSkillIds={unratedSkillIds}
              onRatingChange={setRating}
            />
          </>
        )
      )}

    </div>
  )
}

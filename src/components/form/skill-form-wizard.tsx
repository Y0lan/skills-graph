import { useState, useCallback, useEffect, useMemo } from 'react'
import { useCatalog } from '@/hooks/use-catalog'
import { useSkillForm } from '@/hooks/use-skill-form'
import { useAutosave, type SaveStatus } from '@/hooks/use-autosave'
import type { SkillFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import RatingLegend from './rating-legend'
import ProgressBar from './progress-bar'
import type { StepInfo } from './progress-bar'
import CategoryBar from './category-bar'
import CategoryStep from './category-step'
import ReviewStep from './review-step'
import DiscoveryStep from './discovery-step'

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

interface CategoryGroup {
  pole: string
  label: string
  categories: Array<{
    id: string
    label: string
    emoji: string
    skills: Array<{ id: string; label: string; descriptors: Array<{ level: number; label: string; description: string }> }>
  }>
}

interface SkillFormWizardProps {
  slug: string
  initialData: SkillFormValues
  onSubmit: (data: SkillFormValues) => Promise<void>
  submitting: boolean
  onNavigationChange?: (nav: WizardNavigation) => void
  autosaveEndpoint?: string
  aiSuggestions?: Record<string, number>
  roleCategories?: string[]
  nonPoleGroups?: CategoryGroup[]
}

export default function SkillFormWizard({
  slug,
  initialData,
  onSubmit,
  submitting,
  onNavigationChange,
  autosaveEndpoint,
  aiSuggestions,
  roleCategories,
  nonPoleGroups,
}: SkillFormWizardProps) {
  const { categories: skillCategories, ratingScale, calibrationPrompts } = useCatalog()

  const [showExtraCategories, setShowExtraCategories] = useState(false)

  const allOrderedCategories = useMemo(() => {
    if (!roleCategories || roleCategories.length === 0) return skillCategories
    const roleSet = new Set(roleCategories)
    const primary = skillCategories.filter(c => roleSet.has(c.id))
    const secondary = skillCategories.filter(c => !roleSet.has(c.id))
    return [...primary, ...secondary]
  }, [skillCategories, roleCategories])

  const extraCategoryCount = roleCategories
    ? allOrderedCategories.length - roleCategories.length
    : 0

  const orderedCategories = useMemo(() => {
    if (!roleCategories || roleCategories.length === 0 || showExtraCategories) return allOrderedCategories
    return allOrderedCategories.filter(c => roleCategories.includes(c.id))
  }, [allOrderedCategories, roleCategories, showExtraCategories])

  const isRoleCategory = useCallback((categoryId: string) => {
    return roleCategories?.includes(categoryId) ?? true
  }, [roleCategories])

  const TOTAL_CATEGORY_STEPS = orderedCategories.length
  const hasDiscovery = nonPoleGroups && nonPoleGroups.length > 0
  const DISCOVERY_STEP = hasDiscovery ? TOTAL_CATEGORY_STEPS : -1
  const REVIEW_STEP = hasDiscovery ? TOTAL_CATEGORY_STEPS + 1 : TOTAL_CATEGORY_STEPS

  const { form, ratings, skippedCategories, declinedCategories, setRating, toggleSkipCategory, isSkipped, setDeclinedCategories } =
    useSkillForm({ defaultValues: initialData })

  const [discoveryVisited, setDiscoveryVisited] = useState(false)

  const { saveStatus } = useAutosave({ control: form.control, slug, endpoint: autosaveEndpoint })

  const [editingFromReview, setEditingFromReview] = useState(false)
  const [unratedSkillIds, setUnratedSkillIds] = useState<string[]>([])
  const [validationMessage, setValidationMessage] = useState<string>()

  const [step, setStep] = useState(() => {
    // Resume at first incomplete step
    for (let i = 0; i < TOTAL_CATEGORY_STEPS; i++) {
      const cat = orderedCategories[i]
      if (skippedCategories.includes(cat.id)) continue
      const allRated = cat.skills.every(
        (s) => initialData.ratings[s.id] !== undefined && initialData.ratings[s.id] >= 0,
      )
      if (!allRated) return i
    }
    return REVIEW_STEP
  })

  const isReviewStep = step === REVIEW_STEP
  const isDiscoveryStep = hasDiscovery && step === DISCOVERY_STEP
  const category = !isReviewStep && !isDiscoveryStep ? orderedCategories[step] : null

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
      const cat = orderedCategories[i]
      if (isSkipped(cat.id)) continue
      const allRated = cat.skills.every((s) => ratings[s.id] !== undefined)
      if (!allRated) return i
    }
    return REVIEW_STEP
  }, [ratings, orderedCategories, isSkipped, TOTAL_CATEGORY_STEPS, REVIEW_STEP])

  // Build step info for progress bar
  const progressSteps: StepInfo[] = [
    ...orderedCategories.map((cat) => {
      const ratedCount = cat.skills.filter(
        (s) => ratings[s.id] !== undefined && ratings[s.id] >= 0,
      ).length
      const aiCount = aiSuggestions
        ? cat.skills.filter(s => aiSuggestions[s.id] !== undefined).length
        : 0
      return {
        label: cat.label,
        emoji: cat.emoji,
        ratedCount,
        totalCount: cat.skills.length,
        isSkipped: isSkipped(cat.id),
        aiCount,
        isRoleCategory: roleCategories ? isRoleCategory(cat.id) : undefined,
      }
    }),
    ...(hasDiscovery
      ? [
          {
            label: '+',
            ratedCount: 0,
            totalCount: 0,
            isSkipped: false,
          },
        ]
      : []),
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
    if (isReviewStep || isDiscoveryStep) return true
    const cat = orderedCategories[step]
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
  }, [step, ratings, isSkipped, isReviewStep, isDiscoveryStep, orderedCategories])

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
    if (hasDiscovery && !discoveryVisited) {
      setStep(DISCOVERY_STEP)
      return
    }
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
  }, [step, isReviewStep, editingFromReview, submitting, saveStatus, ratings, skippedCategories, declinedCategories, discoveryVisited])

  return (
    <div className="space-y-6">
      {aiSuggestions && Object.keys(aiSuggestions).length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-[#1B6179] dark:border-primary/30 dark:bg-primary/10 dark:text-primary">
          ✨ {Object.keys(aiSuggestions).length} compétences pré-remplies depuis votre CV. <strong>Vérifiez et ajustez</strong> les niveaux suggérés.
        </div>
      )}

      <ProgressBar
        currentStep={step}
        steps={progressSteps}
        onStepClick={handleGoToStep}
        lockedFromStep={editingFromReview ? undefined : highestReachableStep + 1}
      />

      <RatingLegend ratingScale={ratingScale} />

      {isReviewStep && !showExtraCategories && roleCategories && extraCategoryCount > 0 && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center">
          <p className="mb-2 text-sm text-muted-foreground">
            {extraCategoryCount} catégorie{extraCategoryCount > 1 ? 's' : ''} supplémentaire{extraCategoryCount > 1 ? 's' : ''} disponible{extraCategoryCount > 1 ? 's' : ''} hors de votre pôle
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExtraCategories(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Ajouter des catégories hors pôle
          </Button>
        </div>
      )}

      {isReviewStep ? (
        <ReviewStep
          ratings={ratings}
          experience={form.getValues('experience')}
          skippedCategories={form.getValues('skippedCategories')}
          categories={orderedCategories}
          ratingScale={ratingScale}
          onGoToStep={handleGoToStep}
        />
      ) : isDiscoveryStep && nonPoleGroups ? (
        <DiscoveryStep
          groups={nonPoleGroups}
          ratings={ratings}
          declinedCategories={declinedCategories}
          onRate={(skillId, value) => setRating(skillId, value)}
          onDecline={(catId) => setDeclinedCategories(prev => [...new Set([...prev, catId])])}
          onUndecline={(catId) => setDeclinedCategories(prev => prev.filter(id => id !== catId))}
          onContinue={() => { setDiscoveryVisited(true); setStep(REVIEW_STEP) }}
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
              isRoleCategory={roleCategories ? isRoleCategory(category.id) : undefined}
              onPrev={handlePrev}
              onNext={handleNext}
              onBackToReview={handleBackToReview}
              skipButtonProps={roleCategories && isRoleCategory(category.id) ? undefined : {
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

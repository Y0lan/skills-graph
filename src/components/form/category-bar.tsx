import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import SkipCategoryButton from './skip-category-button'

interface CategoryBarProps {
  stepNumber: number
  categoryLabel: string
  ratedCount: number
  totalCount: number
  isSkipped: boolean
  allRated: boolean
  isFirstStep: boolean
  editingFromReview: boolean
  isRoleCategory?: boolean
  onPrev: () => void
  onNext: () => void
  onBackToReview: () => void
  skipButtonProps?: {
    categoryLabel: string
    isSkipped: boolean
    onSkip: () => void
    onUnskip: () => void
    onNext: () => void
  }
}

export default function CategoryBar({
  stepNumber,
  categoryLabel,
  ratedCount,
  totalCount,
  isSkipped,
  allRated,
  isFirstStep,
  editingFromReview,
  isRoleCategory,
  onPrev,
  onNext,
  onBackToReview,
  skipButtonProps,
}: CategoryBarProps) {
  // React-recommended pattern: derive state from props during render
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevAllRated, setPrevAllRated] = useState(allRated)
  const [showGreenPulse, setShowGreenPulse] = useState(false)

  if (allRated !== prevAllRated) {
    setPrevAllRated(allRated)
    if (allRated) {
      setShowGreenPulse(true)
    }
  }

  const suivantClasses = [
    'gap-1.5 transition-colors duration-300',
    allRated && !isSkipped
      ? 'bg-green-600 hover:bg-green-700 text-white'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="sticky top-12 z-40 -mx-4 bg-background/95 px-4 pb-3 pt-3 backdrop-blur-sm sm:-mx-8 sm:px-8 border-b">
      <div className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2.5 text-lg font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {stepNumber}
          </span>
          {categoryLabel}
          {isRoleCategory !== undefined && (
            isRoleCategory
              ? <span className="ml-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">Requis</span>
              : <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Optionnel</span>
          )}
          {!isSkipped && (
            <span className="text-sm font-normal text-muted-foreground">
              ({ratedCount}/{totalCount})
            </span>
          )}
        </h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {editingFromReview ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onBackToReview}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Récapitulatif
              </Button>
            ) : !isFirstStep ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onPrev}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Retour
              </Button>
            ) : (
              <div />
            )}
          </div>
          {skipButtonProps && <SkipCategoryButton {...skipButtonProps} />}
          <div className="flex items-center">
            {!editingFromReview && (
              <span
                className={showGreenPulse ? 'animate-pulse [animation-iteration-count:2]' : ''}
                onAnimationEnd={() => setShowGreenPulse(false)}
              >
                <Button
                  size="sm"
                  onClick={onNext}
                  className={suivantClasses}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SkipForward, Undo2 } from 'lucide-react'

interface SkipCategoryButtonProps {
  categoryLabel: string
  isSkipped: boolean
  onSkip: () => void
  onUnskip: () => void
}

export default function SkipCategoryButton({
  categoryLabel,
  isSkipped,
  onSkip,
  onUnskip,
}: SkipCategoryButtonProps) {
  const [confirming, setConfirming] = useState(false)

  if (isSkipped) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onUnskip}
        className="gap-2"
      >
        <Undo2 className="h-4 w-4" />
        Annuler le saut — évaluer {categoryLabel}
      </Button>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Ignorer toutes les compétences de {categoryLabel} ?
        </span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            onSkip()
            setConfirming(false)
          }}
        >
          Oui, ignorer
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(false)}
        >
          Annuler
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setConfirming(true)}
      className="gap-2 text-muted-foreground"
    >
      <SkipForward className="h-4 w-4" />
      Ignorer cette catégorie
    </Button>
  )
}

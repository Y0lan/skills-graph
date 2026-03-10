import type { SkillCategory } from '@/data/skill-catalog'
import type { RatingLevel } from '@/data/rating-scale'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pencil } from 'lucide-react'

interface ReviewStepProps {
  ratings: Record<string, number>
  experience: Record<string, number>
  skippedCategories: string[]
  categories: SkillCategory[]
  ratingScale: RatingLevel[]
  onGoToStep: (step: number) => void
}

function getRatingLabelFromScale(value: number, ratingScale: RatingLevel[]): string {
  if (value < 0) return value === -2 ? 'Ignoré' : 'Non soumis'
  return ratingScale.find((r) => r.value === value)?.label ?? 'Inconnu'
}

export default function ReviewStep({
  ratings,
  skippedCategories,
  categories,
  ratingScale,
  onGoToStep,
}: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Récapitulatif & Confirmation</h2>
        <p className="text-sm text-muted-foreground">
          Vérifiez vos évaluations avant de soumettre. Cliquez sur « Modifier » pour revenir à une catégorie.
        </p>
      </div>

      {categories.map((cat, catIndex) => {
        const isSkipped = skippedCategories.includes(cat.id)
        const categoryRatings = cat.skills
          .map((skill) => ({
            skill,
            value: ratings[skill.id],
          }))
          .filter((r) => r.value !== undefined)

        const ratedCount = categoryRatings.filter((r) => r.value >= 0).length
        const avgScore =
          ratedCount > 0
            ? categoryRatings
                .filter((r) => r.value > 0)
                .reduce((sum, r) => sum + r.value, 0) /
              Math.max(
                1,
                categoryRatings.filter((r) => r.value > 0).length,
              )
            : 0

        return (
          <Card key={cat.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cat.emoji}</span>
                  <div>
                    <h3 className="font-semibold">{cat.label}</h3>
                    {isSkipped ? (
                      <Badge variant="outline" className="mt-1 text-xs">
                        Ignorée
                      </Badge>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {ratedCount}/{cat.skills.length} compétences évaluées
                        {avgScore > 0 && (
                          <span className="ml-2 font-medium text-foreground">
                            — Moyenne : {avgScore.toFixed(1)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onGoToStep(catIndex)}
                  className="gap-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </Button>
              </div>

              {!isSkipped && categoryRatings.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {categoryRatings.map(({ skill, value }) => (
                    <div
                      key={skill.id}
                      className="flex items-center justify-between rounded-md px-2 py-1 text-sm"
                    >
                      <span className="text-muted-foreground">{skill.label}</span>
                      <span className="font-medium">
                        {value >= 0 ? `${value} — ${getRatingLabelFromScale(value, ratingScale)}` : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

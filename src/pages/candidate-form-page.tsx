import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import SkillFormWizard from '@/components/form/skill-form-wizard'
import type { WizardNavigation } from '@/components/form/skill-form-wizard'
import type { SkillFormValues } from '@/lib/schemas'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, AlertTriangle, Clock, Send } from 'lucide-react'

interface CandidateFormData {
  id: string
  name: string
  role: string
  submitted: boolean
  aiSuggestions: Record<string, number> | null
  roleCategories: string[] | null
}

export default function CandidateFormPage() {
  const { id } = useParams<{ id: string }>()
  const [formData, setFormData] = useState<CandidateFormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [existingRatings, setExistingRatings] = useState<SkillFormValues | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [started, setStarted] = useState(false)
  const [wizardNav, setWizardNav] = useState<WizardNavigation | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/evaluate/${id}/form`)
      .then(async (res) => {
        if (res.status === 410) {
          setExpired(true)
          return
        }
        if (!res.ok) {
          setError('Lien invalide')
          return
        }
        const formInfo = await res.json()
        setFormData(formInfo)
        if (formInfo.submitted) {
          setSubmitted(true)
          return
        }
        const initialRatings = formInfo.aiSuggestions ?? {}
        setExistingRatings({ ratings: initialRatings, experience: {}, skippedCategories: [], declinedCategories: [] })
      })
      .catch(() => setError('Impossible de charger le formulaire'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSubmit = useCallback(async (data: SkillFormValues) => {
    if (!id) return
    setSubmitting(true)
    try {
      // Send final ratings with submit to prevent autosave race
      const res = await fetch(`/api/evaluate/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(body.error)
      }
      setSubmitted(true)
      toast.success('Évaluation soumise avec succès !')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la soumission')
    } finally {
      setSubmitting(false)
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Clock className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-2xl font-bold">Lien expiré</h1>
            <p className="mt-2 text-muted-foreground">
              Ce lien d'évaluation a expiré. Contactez votre recruteur pour obtenir un nouveau lien.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-2xl font-bold">Erreur</h1>
            <p className="mt-2 text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-bold">Merci !</h1>
            <p className="mt-2 text-muted-foreground">
              Vos réponses ont été enregistrées. L'équipe SINAPSE reviendra vers vous.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!formData || !existingRatings) return null

  // Welcome screen before starting
  if (!started) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-lg">
          <CardContent className="p-8">
            <h1 className="text-2xl font-bold">
              Bonjour {formData.name} 👋
            </h1>
            <p className="mt-3 text-muted-foreground">
              Vous êtes invité(e) à évaluer vos compétences pour le poste de{' '}
              <span className="font-medium text-foreground">{formData.role}</span> chez SINAPSE.
            </p>
            <div className="mt-4 rounded-lg border bg-muted/50 p-4 text-sm">
              <p className="font-medium">Comment ça marche :</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>• Évaluez vos compétences sur une échelle de 0 (inconnu) à 5 (expert)</li>
                <li>• Soyez honnête — il n'y a pas de mauvaise réponse</li>
                <li>• Vous pouvez passer les catégories qui ne correspondent pas à votre profil</li>
                <li>• Vos réponses sont sauvegardées automatiquement</li>
              </ul>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              En continuant, vous acceptez que vos réponses soient utilisées dans le cadre
              du processus de recrutement de SINAPSE.
            </p>
            <button
              onClick={() => setStarted(true)}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Commencer l'évaluation
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{formData.name}</h1>
            <p className="text-sm text-muted-foreground">Évaluation pour le poste de {formData.role}</p>
          </div>
          <div className="flex items-center gap-2">
            {wizardNav && wizardNav.saveStatus !== 'idle' && (
              <span className={`text-xs ${wizardNav.saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {wizardNav.saveStatus === 'saving' && 'Sauvegarde...'}
                {wizardNav.saveStatus === 'saved' && 'Sauvegardé ✓'}
                {wizardNav.saveStatus === 'error' && 'Erreur ⚠'}
              </span>
            )}
            {wizardNav?.isReview && (
              <Button
                size="sm"
                onClick={() => wizardNav.onSubmit()}
                disabled={submitting}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Envoi...' : 'Soumettre'}
              </Button>
            )}
          </div>
        </div>
        <SkillFormWizard
          slug={id!}
          initialData={existingRatings}
          onSubmit={handleSubmit}
          submitting={submitting}
          autosaveEndpoint={`/api/evaluate/${id}/ratings`}
          onNavigationChange={setWizardNav}
          aiSuggestions={formData.aiSuggestions ?? undefined}
          roleCategories={formData.roleCategories ?? undefined}
        />
      </div>
      <footer className="border-t bg-muted/30 mt-12">
        <div className="container mx-auto max-w-3xl px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>GIE SINAPSE — Skill Radar</span>
          <div className="flex items-center gap-3">
            <Link to="/mentions-legales" className="hover:text-foreground">Mentions légales</Link>
            <Link to="/confidentialite" className="hover:text-foreground">Confidentialité</Link>
            <a href="https://sinapse.nc" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">sinapse.nc</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

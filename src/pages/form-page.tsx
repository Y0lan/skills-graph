import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { findMember } from '@/data/team-roster'
import { useRatings } from '@/hooks/use-ratings'
import SkillFormWizard from '@/components/form/skill-form-wizard'
import type { WizardNavigation } from '@/components/form/skill-form-wizard'
import AppHeader from '@/components/app-header'
import ResetConfirmDialog from '@/components/reset-confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, LayoutDashboard, Loader2, RotateCcw, Send } from 'lucide-react'

export default function FormPage() {
  const { slug } = useParams<{ slug: string }>()
  const member = slug ? findMember(slug) : undefined
  const navigate = useNavigate()
  const { data, loading, error, fetchRatings, submitRatings, resetRatings } = useRatings()
  const [analyzing, setAnalyzing] = useState(false)
  const [ready, setReady] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [wizardNav, setWizardNav] = useState<WizardNavigation | null>(null)

  const handleNavigationChange = useCallback((nav: WizardNavigation) => {
    setWizardNav(nav)
  }, [])

  useEffect(() => {
    if (slug && member) {
      fetchRatings(slug).then(() => setReady(true))
    }
  }, [slug, member, fetchRatings])

  if (!member) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold">Membre introuvable</h1>
            <p className="mt-2 text-muted-foreground">
              Le lien suivi ne correspond à aucun membre de l'équipe.
            </p>
            <Link to="/dashboard" className="mt-4 inline-block text-primary underline">
              Aller au tableau de bord
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading && !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement de vos évaluations...</p>
      </div>
    )
  }

  if (error && !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-bold text-destructive">Erreur</h1>
            <p className="mt-2 text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (analyzing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <h1 className="text-2xl font-bold">Analyse des réponses en cours...</h1>
            <p className="text-center text-muted-foreground">
              Merci, {member.name}. Votre profil est en cours de génération.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleReset = async () => {
    setResetting(true)
    const ok = await resetRatings(slug!)
    setResetting(false)
    if (ok) {
      setResetDialogOpen(false)
      setResetKey((k) => k + 1)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        headerActions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              aria-label="Réinitialiser"
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Réinitialiser</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              nativeButton={false}
              render={<Link to={`/dashboard/${slug}`} />}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Mon profil</span>
            </Button>
          </>
        }
        headerNav={wizardNav?.isReview && (
          <div className="flex items-center gap-2">
            {!wizardNav.isFirstStep && (
              <Button
                variant="outline"
                size="sm"
                onClick={wizardNav.onPrev}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Retour</span>
              </Button>
            )}
            <Button
              size="sm"
              onClick={wizardNav.onSubmit}
              disabled={wizardNav.submitting}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" />
              {wizardNav.submitting ? 'Envoi...' : 'Soumettre'}
            </Button>
          </div>
        )}
      />
      <ResetConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        onConfirm={handleReset}
        loading={resetting}
      />
      <div className="mx-auto max-w-3xl p-4 pt-14 sm:p-8 sm:pt-14">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{member.name}</h1>
          <p className="text-muted-foreground">
            {member.role} — {member.team}
          </p>
          {data?.submittedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Dernière soumission : {new Date(data.submittedAt).toLocaleString('fr-FR')}
            </p>
          )}
        </div>

        <SkillFormWizard
          key={resetKey}
          slug={slug!}
          initialData={{
            ratings: data?.ratings ?? {},
            experience: data?.experience ?? {},
            skippedCategories: data?.skippedCategories ?? [],
          }}
          submitting={loading}
          onSubmit={async (payload) => {
            setAnalyzing(true)
            const result = await submitRatings(slug!, payload)
            if (result) navigate(`/dashboard/${slug}`)
            else setAnalyzing(false)
          }}
          onNavigationChange={handleNavigationChange}
        />
      </div>
    </div>
  )
}

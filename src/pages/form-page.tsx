import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { findMember } from '@/data/team-roster'
import { useRatings } from '@/hooks/use-ratings'
import SkillFormWizard from '@/components/form/skill-form-wizard'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'

export default function FormPage() {
  const { slug } = useParams<{ slug: string }>()
  const member = slug ? findMember(slug) : undefined
  const { data, loading, error, fetchRatings, submitRatings } = useRatings()
  const [submitted, setSubmitted] = useState(false)
  const [ready, setReady] = useState(false)

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
            <h1 className="text-2xl font-bold">Member not found</h1>
            <p className="mt-2 text-muted-foreground">
              The link you followed does not match any team member.
            </p>
            <a href="/dashboard" className="mt-4 inline-block text-primary underline">
              Go to Dashboard
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading && !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading your ratings...</p>
      </div>
    )
  }

  if (error && !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-bold text-destructive">Error</h1>
            <p className="mt-2 text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h1 className="text-2xl font-bold">Ratings submitted!</h1>
            <p className="text-center text-muted-foreground">
              Thank you, {member.name}. Your skill self-assessment has been saved.
              You can revisit this link anytime to update your ratings.
            </p>
            <div className="flex gap-3">
              <a
                href={`/dashboard/${slug}`}
                className="text-sm text-primary underline"
              >
                View your dashboard
              </a>
              <button
                onClick={() => setSubmitted(false)}
                className="text-sm text-muted-foreground underline"
              >
                Edit ratings
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{member.name}</h1>
          <p className="text-muted-foreground">
            {member.role} — {member.team}
          </p>
          {data?.submittedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last submitted: {new Date(data.submittedAt).toLocaleString()}
            </p>
          )}
        </div>

        <SkillFormWizard
          initialRatings={data?.ratings ?? {}}
          initialExperience={data?.experience ?? {}}
          initialSkippedCategories={data?.skippedCategories ?? []}
          submitting={loading}
          onSubmit={async (payload) => {
            const result = await submitRatings(slug!, payload)
            if (result) setSubmitted(true)
          }}
        />
      </div>
    </div>
  )
}

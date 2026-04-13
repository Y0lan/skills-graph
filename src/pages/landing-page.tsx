import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authClient } from '@/lib/auth-client'
import { LoginDialog } from '@/components/auth/login-dialog'
import ThemeToggle from '@/components/theme-toggle'
import { RadarBackground } from '@/components/ui/radar-background'

export default function LandingPage() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!isPending && session?.user) {
      navigate('/dashboard', { replace: true })
    }
  }, [isPending, session, navigate])

  // Don't block the landing page forever if session check stalls
  useEffect(() => {
    if (!isPending) return
    const timer = setTimeout(() => setTimedOut(true), 3000)
    return () => clearTimeout(timer)
  }, [isPending])

  if (isPending && !timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  if (session?.user) {
    return null
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* WebGL radar background */}
      <div className="absolute inset-0">
        <RadarBackground
          speed={0.6}
          scale={0.9}
          ringCount={6}
          spokeCount={8}
          color="rgba(34, 197, 94, 0.35)"
        />
      </div>

      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm pointer-events-none" />

      {/* Centered content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4">
        {/* Theme toggle — inside content div so it's in the same stacking context */}
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <img
          src="/assets/logo-sinapse.svg"
          alt="SINAPSE"
          className="h-24 w-auto drop-shadow-lg"
        />
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Radar des Compétences
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Évaluez et visualisez les compétences de votre équipe
          </p>
        </div>
        <LoginDialog redirectTo="/dashboard" />
      </div>
    </div>
  )
}

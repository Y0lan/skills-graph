import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { authClient } from '@/lib/auth-client'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data: session, isPending } = authClient.useSession()
  const { slug } = useParams()

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/dashboard" replace />
  }

  if (slug && session.user.slug !== slug) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold">Acces refuse</p>
        <p className="text-sm text-muted-foreground">
          Vous ne pouvez modifier que votre propre formulaire.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

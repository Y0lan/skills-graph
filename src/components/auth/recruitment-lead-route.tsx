import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { isRecruitmentLead } from '@/lib/recruitment-leads'

export function RecruitmentLeadRoute({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/" replace />
  }

  if (!isRecruitmentLead(session.user.slug)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-lg font-semibold">Accès réservé aux responsables recrutement</p>
          <p className="text-sm text-muted-foreground">
            Cette page est visible uniquement par Yolan Maldonado, Olivier Faivre et Guillaume Benoit.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

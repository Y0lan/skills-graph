import type { ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { LogOut, FileText, Users } from 'lucide-react'
import ThemeToggle from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { LoginDialog } from '@/components/auth/login-dialog'
import { authClient } from '@/lib/auth-client'
import { findMember } from '@/data/team-roster'
import { isRecruitmentLead } from '@/lib/recruitment-leads'

interface AppHeaderProps {
  headerActions?: ReactNode
  headerNav?: ReactNode
  hideSessionNav?: boolean
}

export default function AppHeader({ headerActions, headerNav, hideSessionNav }: AppHeaderProps) {
  const { data: session } = authClient.useSession()
  const navigate = useNavigate()

  const loggedInMember = session?.user.slug
    ? findMember(session.user.slug as string)
    : null

  async function handleSignOut() {
    try {
      await authClient.signOut()
    } catch {
      // signOut failed — navigate anyway to reset UI state
    }
    navigate('/')
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-2">
          <img src="/logo-sinapse-crop.png" alt="SINAPSE" className="h-6 w-auto" />
          {headerActions}
        </div>
        <div className="flex items-center gap-2">
          {headerNav}

          {session && isRecruitmentLead(session.user.slug as string) && (
            <>
              <Link to="/recruit/pipeline" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Recrutement</span>
              </Link>
            </>
          )}

          {session && (
            <>
              {!hideSessionNav && session.user.slug && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/form/${session.user.slug}`)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Mon formulaire
                </Button>
              )}
              {!hideSessionNav && (
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {loggedInMember
                    ? `${loggedInMember.name} — ${loggedInMember.role}`
                    : session.user.email}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
          <LoginDialog />

          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

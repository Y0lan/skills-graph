import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LogIn, CheckCircle, Circle, PenLine, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { teamMembers, slugToEmail } from '@/data/team-roster'
import type { TeamMember } from '@/data/team-roster'
import { StatusIcon } from '@/components/status-icon'
import { useTeamStatus } from '@/hooks/use-team-status'

const sortedMembers = [...teamMembers].sort((a, b) => a.name.localeCompare(b.name))

interface LoginDialogProps {
  redirectTo?: string
}

export function LoginDialog({ redirectTo }: LoginDialogProps = {}) {
  const { data: session } = authClient.useSession()
  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const { statusMap } = useTeamStatus(open)

  async function handleMagicLink() {
    if (!selected) return
    setError('')
    setLoading(true)
    try {
      const email = slugToEmail(selected.slug)
      const { error: authError } = await authClient.signIn.magicLink({
        email,
        callbackURL: redirectTo ?? `/form/${selected.slug}`,
      })
      if (authError) {
        setError('Erreur lors de l\'envoi du lien')
      } else {
        setMagicLinkSent(true)
        toast.success(`Lien de connexion envoyé à ${email}`)
      }
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setSelected(null)
      setError('')
      setLoading(false)
      setMagicLinkSent(false)
    }
  }

  // Hide trigger when logged in (but keep dialog mounted for customize flow)
  if (session && !open) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!session && (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <LogIn className="mr-2 h-4 w-4" />
          Se connecter
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Radar des Compétences</DialogTitle>
          <DialogDescription>
            {magicLinkSent
              ? `Un lien de connexion a été envoyé à ${slugToEmail(selected!.slug)}. Vérifiez votre boîte mail.`
              : 'Sélectionnez votre nom pour recevoir un lien de connexion par email.'}
          </DialogDescription>
        </DialogHeader>

        {magicLinkSent ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <Mail className="h-12 w-12 text-primary" />
            <p className="text-sm text-muted-foreground text-center">
              Cliquez sur le lien dans l'email pour vous connecter.<br />
              Le lien expire dans 10 minutes.
            </p>
            <Button variant="outline" size="sm" onClick={() => { setMagicLinkSent(false); handleMagicLink() }} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Renvoyer le lien
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="max-h-72 overflow-y-auto -mx-1 px-1">
              {sortedMembers.map((member) => {
                const status = statusMap.get(member.slug) ?? 'none'
                const isSelected = selected?.slug === member.slug
                return (
                  <button
                    key={member.slug}
                    type="button"
                    disabled={loading}
                    onClick={() => { setSelected(member); setError('') }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                      isSelected
                        ? 'bg-primary/10 ring-1 ring-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <StatusIcon status={status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {member.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.role}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span>Évaluation soumise</span>
              </div>
              <div className="flex items-center gap-2">
                <PenLine className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>Brouillon en cours</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                <span>Pas encore commencé</span>
              </div>
            </div>

            {selected && (
              <Button onClick={handleMagicLink} disabled={loading} className="w-full gap-2">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Recevoir un lien de connexion
              </Button>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


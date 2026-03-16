import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LogIn, CheckCircle, Circle, Mail, ExternalLink, PenLine, Clock, Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { teamMembers } from '@/data/team-roster'
import type { TeamMember } from '@/data/team-roster'

const sortedMembers = [...teamMembers].sort((a, b) => a.name.localeCompare(b.name))
const COOLDOWN_S = 5 * 60

type EvalStatus = 'none' | 'draft' | 'submitted'

export function LoginDialog() {
  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [statusMap, setStatusMap] = useState<Map<string, EvalStatus>>(new Map())
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  function startCooldown() {
    setCooldown(COOLDOWN_S)
    clearTimer()
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearTimer()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    fetch('/api/ratings', { signal: controller.signal })
      .then((r) => r.json())
      .then((data: Record<string, { ratings: Record<string, number>; submittedAt: string | null }>) => {
        const map = new Map<string, EvalStatus>()
        for (const [slug, eval_] of Object.entries(data)) {
          if (eval_.submittedAt) {
            map.set(slug, 'submitted')
          } else if (Object.keys(eval_.ratings).length > 0) {
            map.set(slug, 'draft')
          }
        }
        setStatusMap(map)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [open])

  async function handleSend() {
    if (!selected || cooldown > 0) return
    setError('')
    setLoading(true)

    try {
      const { error: authError } = await authClient.signIn.magicLink({
        email: selected.email,
        callbackURL: '/dashboard',
      })
      if (authError) {
        setError(authError.message ?? authError.statusText ?? "Erreur lors de l'envoi")
      } else {
        setSentTo(selected.email)
      }
      startCooldown()
    } catch {
      setError('Erreur de connexion au serveur')
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setSelected(null)
      setSentTo(null)
      setError('')
      setLoading(false)
    }
  }

  function formatCountdown(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <LogIn className="mr-2 h-4 w-4" />
        Se connecter
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Radar des Competences</DialogTitle>
          <DialogDescription>
            Identifiez-vous pour acceder a votre evaluation ou consulter le tableau de bord.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Envoi du lien de connexion...</p>
          </div>
        ) : sentTo ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <Mail className="h-12 w-12 text-primary" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">
                Un lien de connexion a ete envoye a <strong>{sentTo}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Cliquez sur le lien dans l'email pour vous connecter. Il expire dans 10 minutes.
              </p>
            </div>
            <a
              href="https://outlook.cloud.microsoft/mail/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                Ouvrir Outlook
              </Button>
            </a>
            {cooldown > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Prochain envoi possible dans {formatCountdown(cooldown)}
              </p>
            )}
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
                    disabled={loading || cooldown > 0}
                    onClick={() => setSelected(member)}
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
                        {member.email}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span>Evaluation soumise</span>
              </div>
              <div className="flex items-center gap-2">
                <PenLine className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>Brouillon en cours</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                <span>Pas encore commence</span>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {cooldown > 0 ? (
              <Button disabled>
                <Clock className="mr-2 h-4 w-4" />
                Reessayer dans {formatCountdown(cooldown)}
              </Button>
            ) : (
              <Button onClick={handleSend} disabled={!selected}>
                <Mail className="mr-2 h-4 w-4" />
                Envoyer le lien de connexion
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatusIcon({ status }: { status: EvalStatus }) {
  switch (status) {
    case 'submitted':
      return <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
    case 'draft':
      return <PenLine className="h-4 w-4 shrink-0 text-amber-500" />
    default:
      return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
  }
}

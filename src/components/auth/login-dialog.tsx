import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LogIn, CheckCircle, Circle, PenLine, Loader2, KeyRound } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { teamMembers } from '@/data/team-roster'
import type { TeamMember } from '@/data/team-roster'

const sortedMembers = [...teamMembers].sort((a, b) => a.name.localeCompare(b.name))

type EvalStatus = 'none' | 'draft' | 'submitted'
type View = 'select' | 'customize'

export function LoginDialog() {
  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('select')
  const [statusMap, setStatusMap] = useState<Map<string, EvalStatus>>(new Map())
  const pinRef = useRef<HTMLInputElement>(null)
  const newPinRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

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

  useEffect(() => {
    if (selected && pinRef.current) {
      pinRef.current.focus()
    }
  }, [selected])

  useEffect(() => {
    if (view === 'customize' && newPinRef.current) {
      newPinRef.current.focus()
    }
  }, [view])

  async function handleSignIn() {
    if (!selected || pin.length !== 6) return
    setError('')
    setLoading(true)

    try {
      const { data, error: authError } = await authClient.signIn.email({
        email: selected.email,
        password: pin,
      })
      if (authError) {
        if (authError.status === 429) {
          setError('Trop de tentatives — reessayez dans une minute')
        } else {
          setError('Code incorrect')
        }
      } else if (data && !data.user.pinCustomized) {
        setView('customize')
      } else {
        setOpen(false)
        navigate(`/form/${selected.slug}`)
      }
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  async function handleCustomizePin() {
    if (newPin.length !== 6 || confirmPin.length !== 6) return
    if (newPin !== confirmPin) {
      setError('Les codes ne correspondent pas')
      return
    }
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/customize-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: pin, newPassword: newPin }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.message || 'Erreur — veuillez vous reconnecter')
        return
      }
      setOpen(false)
      navigate(`/form/${selected!.slug}`)
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
      setPin('')
      setNewPin('')
      setConfirmPin('')
      setError('')
      setLoading(false)
      setView('select')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <LogIn className="mr-2 h-4 w-4" />
        Se connecter
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {view === 'select' ? (
          <>
            <DialogHeader>
              <DialogTitle>Radar des Competences</DialogTitle>
              <DialogDescription>
                Identifiez-vous pour acceder a votre evaluation ou consulter le tableau de bord.
              </DialogDescription>
            </DialogHeader>

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
                      onClick={() => { setSelected(member); setPin(''); setError('') }}
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

              {selected && (
                <div className="flex gap-2">
                  <input
                    ref={pinRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="Code a 6 chiffres"
                    value={pin}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                      setPin(v)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSignIn()
                    }}
                    disabled={loading}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm tracking-[0.3em] text-center shadow-xs transition-colors placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button onClick={handleSignIn} disabled={pin.length !== 6 || loading} className="shrink-0">
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Choisissez votre code personnel</DialogTitle>
              <DialogDescription>
                Ce code remplacera le code temporaire qui vous a ete communique.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <input
                ref={newPinRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="Nouveau code"
                value={newPin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setNewPin(v)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPin.length === 6) {
                    document.getElementById('confirm-pin-input')?.focus()
                  }
                }}
                disabled={loading}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm tracking-[0.3em] text-center shadow-xs transition-colors placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <input
                id="confirm-pin-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="Confirmer"
                value={confirmPin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setConfirmPin(v)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomizePin()
                }}
                disabled={loading}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm tracking-[0.3em] text-center shadow-xs transition-colors placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Button
                onClick={handleCustomizePin}
                disabled={newPin.length !== 6 || confirmPin.length !== 6 || loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Valider
              </Button>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </>
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

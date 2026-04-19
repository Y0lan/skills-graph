import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, AlertTriangle } from 'lucide-react'

export interface ScanDetailDialogProps {
  open: boolean
  onClose: () => void
  documentId: string
  filename: string
  onOverrideCreated?: () => void
}

interface ScanData {
  status: 'pending' | 'clean' | 'infected' | 'error' | 'skipped'
  scannedAt: string | null
  result: {
    safe: boolean
    scannedAt: string
    engines: string[]
    threats: string[]
  } | null
  override: {
    id: string
    verdict: 'safe' | 'quarantine'
    reason: string
    expires_at: string
    created_by: string
    created_at: string
  } | null
  effectiveVerdict: string
}

const STATUS_LABELS: Record<ScanData['status'], { label: string; tone: 'green' | 'red' | 'amber' | 'muted' }> = {
  pending: { label: 'Scan en cours', tone: 'muted' },
  clean: { label: 'Propre', tone: 'green' },
  infected: { label: 'Menace détectée', tone: 'red' },
  error: { label: 'Erreur de scan', tone: 'amber' },
  skipped: { label: 'Scan ignoré', tone: 'muted' },
}

const TONE_CLASSES = {
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  red: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  muted: 'bg-muted text-muted-foreground',
}

export default function ScanDetailDialog({ open, onClose, documentId, filename, onOverrideCreated }: ScanDetailDialogProps) {
  const [data, setData] = useState<ScanData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [overrideVerdict, setOverrideVerdict] = useState<'safe' | 'quarantine'>('safe')
  const [overrideReason, setOverrideReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setData(null)
    setError(null)
    setOverrideMode(false)
    setOverrideReason('')
    setLoading(true)
    fetch(`/api/recruitment/documents/${documentId}/scan`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<ScanData>
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [open, documentId])

  async function submitOverride(): Promise<void> {
    if (overrideReason.trim().length < 10) {
      toast.error('La raison doit faire au moins 10 caractères')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/recruitment/documents/${documentId}/scan/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ verdict: overrideVerdict, reason: overrideReason.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      toast.success('Override enregistré (expire dans 30 jours)')
      onOverrideCreated?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate">
            Scan antivirus
            <span className="text-xs font-normal text-muted-foreground truncate">{filename}</span>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {data && !overrideMode && (
          <div className="space-y-3">
            {/* Status banner */}
            <div className={`rounded-md p-3 flex items-center gap-3 ${TONE_CLASSES[STATUS_LABELS[data.status].tone]}`}>
              {data.status === 'clean' && <ShieldCheck className="h-5 w-5" />}
              {data.status === 'infected' && <ShieldAlert className="h-5 w-5" />}
              {(data.status === 'pending' || data.status === 'error' || data.status === 'skipped') && <ShieldQuestion className="h-5 w-5" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{STATUS_LABELS[data.status].label}</p>
                {data.scannedAt && (
                  <p className="text-[11px] opacity-80">Scanné le {new Date(data.scannedAt).toLocaleString('fr-FR')}</p>
                )}
              </div>
              {data.override && (
                <Badge variant="outline" className="text-[10px]">
                  Override actif: {data.override.verdict === 'safe' ? 'forcé safe' : 'forcé quarantine'}
                </Badge>
              )}
            </div>

            {/* Engines summary */}
            {data.result && data.result.engines.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Moteurs ({data.result.engines.length})</p>
                <div className="flex flex-wrap gap-1">
                  {data.result.engines.map(e => (
                    <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Threats list */}
            {data.result && data.result.threats.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">Détections ({data.result.threats.length})</p>
                <ul className="rounded-md border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 p-3 space-y-1 text-xs">
                  {data.result.threats.map((t, i) => (
                    <li key={i} className="font-mono break-words">{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Active override */}
            {data.override && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
                <p className="font-medium">Override actif jusqu’au {new Date(data.override.expires_at).toLocaleDateString('fr-FR')}</p>
                <p className="text-muted-foreground">Par {data.override.created_by} le {new Date(data.override.created_at).toLocaleDateString('fr-FR')}</p>
                <p className="italic">« {data.override.reason} »</p>
              </div>
            )}
          </div>
        )}

        {data && overrideMode && (
          <div className="space-y-3">
            <p className="text-sm">
              Créer un override pour ce document. Doit être justifié et expire dans 30 jours.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={overrideVerdict === 'safe' ? 'default' : 'outline'}
                onClick={() => setOverrideVerdict('safe')}
                className="gap-2"
              >
                <ShieldCheck className="h-4 w-4" /> Forcer safe
              </Button>
              <Button
                type="button"
                variant={overrideVerdict === 'quarantine' ? 'destructive' : 'outline'}
                onClick={() => setOverrideVerdict('quarantine')}
                className="gap-2"
              >
                <ShieldAlert className="h-4 w-4" /> Forcer quarantine
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="override-reason" className="text-xs">Raison (10 caractères min, audit-loggée)</Label>
              <Textarea
                id="override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="ex. Faux positif confirmé après analyse manuelle du PDF"
                rows={3}
                maxLength={500}
              />
              <p className="text-[10px] text-muted-foreground">{overrideReason.length}/500</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {data && !overrideMode && (
            <>
              <Button variant="outline" onClick={onClose}>Fermer</Button>
              <Button variant="outline" onClick={() => setOverrideMode(true)}>
                Créer un override
              </Button>
            </>
          )}
          {data && overrideMode && (
            <>
              <Button variant="outline" disabled={submitting} onClick={() => setOverrideMode(false)}>Retour</Button>
              <Button disabled={submitting || overrideReason.trim().length < 10} onClick={submitOverride}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Enregistrer l’override
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

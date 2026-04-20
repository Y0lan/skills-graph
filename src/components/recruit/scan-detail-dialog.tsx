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

interface ScanEngineResult {
  engine: string
  category: string
  result: string | null
}

type ScanEngineSummary =
  | { name: 'ClamAV'; available: false; reason: string }
  | { name: 'ClamAV'; available: true; clean: boolean; threats: string[] }
  | { name: 'VirusTotal'; available: false; reason: string }
  | {
      name: 'VirusTotal'
      available: true
      clean: boolean
      stats: { malicious: number; suspicious: number; undetected: number; harmless: number; failure?: number }
      totalEngines: number
      perEngine: ScanEngineResult[]
    }

interface ScanData {
  status: 'pending' | 'clean' | 'infected' | 'error' | 'skipped'
  scannedAt: string | null
  result: {
    safe: boolean
    scannedAt: string
    engines: string[]
    threats: string[]
    engineSummaries?: ScanEngineSummary[]
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

function EngineHeader({ engineName, tone, label }: { engineName: string; tone: 'green' | 'red' | 'amber' | 'muted'; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{engineName}</span>
        <Badge className={`text-[10px] ${TONE_CLASSES[tone]}`}>{label}</Badge>
      </div>
    </div>
  )
}

function EnginePanel({ summary }: { summary: ScanEngineSummary }) {
  const [showAll, setShowAll] = useState(false)

  if (!summary.available) {
    return (
      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
        <EngineHeader engineName={summary.name} tone="muted" label="Indisponible" />
        <p className="text-[11px] text-muted-foreground italic">
          {summary.reason}
        </p>
      </div>
    )
  }

  if (summary.name === 'ClamAV') {
    return (
      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
        <EngineHeader engineName={summary.name} tone={summary.clean ? 'green' : 'red'} label={summary.clean ? 'Propre' : `Infecté · ${summary.threats.length}`} />
        {!summary.clean && summary.threats.length > 0 && (
          <ul className="rounded border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 p-2 space-y-0.5 text-[11px] font-mono">
            {summary.threats.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        )}
        {summary.clean && (
          <p className="text-[11px] text-muted-foreground">Aucune signature détectée par le moteur local.</p>
        )}
      </div>
    )
  }

  // VirusTotal — show stats + per-engine grid
  const detections = summary.perEngine.filter(r => r.category === 'malicious' || r.category === 'suspicious')
  const visible = showAll ? summary.perEngine : detections.length > 0 ? detections : summary.perEngine.slice(0, 12)

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <EngineHeader
        engineName={summary.name}
        tone={summary.clean ? 'green' : 'red'}
        label={summary.clean
          ? `${summary.totalEngines} moteurs · 0 détection`
          : `${summary.totalEngines} moteurs · ${detections.length} détection${detections.length > 1 ? 's' : ''}`}
      />

      {/* Stats row */}
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <Badge variant="outline" className="text-emerald-600">Propre {summary.stats.harmless + summary.stats.undetected}</Badge>
        {summary.stats.malicious > 0 && <Badge variant="outline" className="text-rose-600">Malicieux {summary.stats.malicious}</Badge>}
        {summary.stats.suspicious > 0 && <Badge variant="outline" className="text-amber-600">Suspect {summary.stats.suspicious}</Badge>}
        {summary.stats.failure ? <Badge variant="outline" className="text-muted-foreground">Échec {summary.stats.failure}</Badge> : null}
      </div>

      {/* Per-engine grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-64 overflow-y-auto">
        {visible.map(r => {
          const tone = r.category === 'malicious' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
            : r.category === 'suspicious' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
            : r.category === 'undetected' || r.category === 'harmless' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground'
          return (
            <div key={r.engine} className={`text-[10px] rounded px-1.5 py-0.5 truncate ${tone}`} title={r.result ? `${r.engine}: ${r.result}` : r.engine}>
              {r.engine}{r.result ? `: ${r.result}` : ''}
            </div>
          )
        })}
      </div>

      {summary.perEngine.length > visible.length && (
        <Button variant="ghost" size="sm" className="h-6 text-[11px] w-full" onClick={() => setShowAll(s => !s)}>
          {showAll ? 'Masquer' : `Voir tous les ${summary.perEngine.length} moteurs`}
        </Button>
      )}
    </div>
  )
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

            {/* Per-engine summaries (ClamAV + VirusTotal panels) */}
            {data.result?.engineSummaries && data.result.engineSummaries.length > 0 ? (
              <div className="space-y-2">
                {data.result.engineSummaries.map((s, i) => <EnginePanel key={i} summary={s} />)}
              </div>
            ) : (
              // Legacy fallback for scan_result rows written before the per-engine refactor.
              <>
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
              </>
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
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <p className="font-medium">
                {overrideVerdict === 'safe'
                  ? 'Déclarer ce document comme faux positif'
                  : 'Marquer ce document comme suspect'}
              </p>
              <p className="text-xs text-muted-foreground">
                {overrideVerdict === 'safe'
                  ? 'Le verdict du scan reste « infected » dans l’historique, mais l’override l’affiche comme propre pendant 30 jours. Audit-loggué avec votre raison.'
                  : 'Le verdict du scan reste « clean » dans l’historique, mais l’override l’affiche comme suspect pendant 30 jours. À utiliser si vous avez un doute malgré le scan propre.'}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="override-reason" className="text-xs">Raison (10 caractères min, audit-loggée)</Label>
              <Textarea
                id="override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={overrideVerdict === 'safe'
                  ? 'ex. PDF analysé manuellement, ouvert dans un sandbox — pas de menace réelle.'
                  : 'ex. Format douteux, le candidat a été contacté pour un nouveau fichier.'}
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
              {/* Smart-default: clean files only get "Quarantine" (you don't need
                  to force-safe a clean one); infected files only get "Forcer safe"
                  (declare false positive). Pending/error/skipped get both. */}
              {data.status === 'clean' && (
                <Button
                  variant="outline"
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  onClick={() => { setOverrideVerdict('quarantine'); setOverrideMode(true) }}
                  title="Marquer ce document comme suspect malgré le scan propre"
                >
                  <ShieldAlert className="h-4 w-4 mr-1.5" />
                  Marquer comme suspect
                </Button>
              )}
              {data.status === 'infected' && (
                <Button
                  variant="outline"
                  className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  onClick={() => { setOverrideVerdict('safe'); setOverrideMode(true) }}
                  title="Déclarer un faux positif après vérification manuelle"
                >
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                  Déclarer faux positif
                </Button>
              )}
              {(data.status !== 'clean' && data.status !== 'infected') && (
                <Button
                  variant="outline"
                  onClick={() => setOverrideMode(true)}
                  title="Forcer un verdict manuellement"
                >
                  Forcer un verdict
                </Button>
              )}
            </>
          )}
          {data && overrideMode && (
            <>
              <Button variant="outline" disabled={submitting} onClick={() => setOverrideMode(false)}>Retour</Button>
              <Button disabled={submitting || overrideReason.trim().length < 10} onClick={submitOverride}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Enregistrer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

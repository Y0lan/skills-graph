import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/constants'
import { Loader2, FileText, History } from 'lucide-react'

interface ExtractionRunMeta {
  id: string
  kind: string
  runIndex: number
  posteId: string | null
  promptVersion: number
  model: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'success' | 'partial' | 'failed'
  inputTokens: number | null
  outputTokens: number | null
  hasPayload: boolean
  error: string | null
}

export interface CvExtractionHistoryDialogProps {
  open: boolean
  onClose: () => void
  candidateId: string
}

/**
 * Timeline of every cv_extraction_runs row for a candidate. Click a run to
 * see its full payload. Select two runs (checkbox) and click Compare to
 * see a typed diff.
 */
export default function CvExtractionHistoryDialog({ open, onClose, candidateId }: CvExtractionHistoryDialogProps) {
  const [runs, setRuns] = useState<ExtractionRunMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [activeRun, setActiveRun] = useState<string | null>(null)
  const [activePayload, setActivePayload] = useState<unknown | null>(null)
  const [payloadLoading, setPayloadLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [diff, setDiff] = useState<unknown | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/recruitment/candidates/${candidateId}/extraction-runs?limit=100`, { credentials: 'include' })
      .then(r => r.json())
      .then(body => setRuns(body.runs ?? []))
      .catch(() => toast.error('Impossible de charger l\'historique'))
      .finally(() => setLoading(false))
  }, [open, candidateId])

  const loadPayload = async (runId: string) => {
    setActiveRun(runId)
    setActivePayload(null)
    setPayloadLoading(true)
    try {
      const res = await fetch(`/api/recruitment/extraction-runs/${runId}/payload`, { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? `HTTP ${res.status}`)
        setActivePayload({ error: body.error, code: body.code })
        return
      }
      setActivePayload(body.payload)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setPayloadLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  const runCompare = async () => {
    if (selected.length !== 2) return
    try {
      const res = await fetch('/api/recruitment/extraction-runs/compare', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runIdA: selected[0], runIdB: selected[1] }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? 'Erreur comparaison')
        return
      }
      setDiff(body)
      setActiveRun(null)
      setActivePayload(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const statusTone = (s: ExtractionRunMeta['status']) => {
    switch (s) {
      case 'success': return 'bg-green-100 text-green-900 dark:bg-green-950/40 dark:text-green-200'
      case 'partial': return 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-200'
      case 'failed': return 'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200'
      default: return 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setActiveRun(null); setActivePayload(null); setDiff(null); setSelected([]); onClose() } }}>
      <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historique d&apos;extraction
            <span className="text-xs font-normal text-muted-foreground ml-2">
              {runs.length} run{runs.length > 1 ? 's' : ''}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex gap-3 overflow-hidden">
          {/* Timeline */}
          <div className="w-80 shrink-0 overflow-auto border-r pr-2">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Chargement…</div>
            ) : runs.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Aucune extraction pour l&apos;instant.</div>
            ) : (
              <ul className="space-y-1">
                {runs.map(r => (
                  <li key={r.id}>
                    <button
                      onClick={() => loadPayload(r.id)}
                      className={`w-full text-left rounded border p-2 hover:bg-muted/50 transition-colors ${activeRun === r.id ? 'bg-muted border-primary' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono">#{r.runIndex}</span>
                        <Badge className={`text-[10px] ${statusTone(r.status)}`}>{r.status}</Badge>
                      </div>
                      <div className="text-sm font-medium mt-0.5">{r.kind}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDateTime(r.startedAt)}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate" title={r.model}>
                        {r.model}{r.promptVersion ? ` · v${r.promptVersion}` : ''}
                      </div>
                      {r.inputTokens != null ? (
                        <div className="text-[11px] text-muted-foreground">
                          {r.inputTokens + (r.outputTokens ?? 0)} tokens
                        </div>
                      ) : null}
                      <label className="flex items-center gap-1.5 mt-1 text-[11px] cursor-pointer" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          disabled={!r.hasPayload}
                        />
                        Comparer
                      </label>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected.length === 2 ? (
              <Button onClick={runCompare} size="sm" className="w-full mt-2">Comparer les 2 runs</Button>
            ) : null}
          </div>

          {/* Right pane: payload or diff */}
          <div className="flex-1 overflow-auto">
            {diff ? (
              <div className="text-sm">
                <h3 className="font-medium mb-2">Différences</h3>
                <pre className="text-xs font-mono bg-muted p-3 rounded overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(diff, null, 2)}
                </pre>
                <Button variant="ghost" size="sm" onClick={() => setDiff(null)} className="mt-2">Retour</Button>
              </div>
            ) : activeRun ? (
              <div className="text-sm">
                <h3 className="font-medium mb-2 flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Payload du run</h3>
                {payloadLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Chargement…</div>
                ) : (
                  <pre className="text-xs font-mono bg-muted p-3 rounded overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(activePayload, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground p-4">
                Sélectionnez un run pour voir son contenu, ou cochez deux runs pour les comparer.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

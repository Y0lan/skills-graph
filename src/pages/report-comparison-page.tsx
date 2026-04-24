import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, Printer, AlertTriangle, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import { GapChip } from '@/components/gap-chip'
import type { GapSeverity } from '@/components/gap-chip'
import { STATUT_LABELS } from '@/lib/constants'

const MAX_OVERLAY = 4
const TARGET_RATING = 3

interface Gap {
  categoryId: string
  categoryLabel: string
  rating: number | null
  severity: GapSeverity
}

interface EnrichedCandidature {
  id: string
  candidateId: string
  posteId: string
  statut: string
  canal: string
  candidateName: string
  candidateEmail: string | null
  hasCv: boolean
  evaluationSubmitted: boolean
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
  tauxGlobal: number | null
  ratings: Record<string, number>
  createdAt: string
  rank: number
  gaps: Gap[]
}

interface ComparisonPayload {
  poste: { id: string; titre: string; roleId: string }
  roleCategories: string[]
  candidatures: EnrichedCandidature[]
}

interface CategoryInfo {
  id: string
  label: string
  skills: { id: string; label: string }[]
}

interface AboroProfile {
  talents: string[]
  axes_developpement: string[]
}

interface CandidateBundle {
  row: EnrichedCandidature
  aboro: AboroProfile | null
  radarData: RadarDataPoint[]
}

type PageState = 'loading' | 'error' | 'empty' | 'loaded'

type PendingAction = {
  candidatureId: string
  candidateName: string
  nextStatut: 'preselectionne' | 'refuse'
  currentStatut: string
} | null

const TERMINAL_STATUSES = new Set(['embauche', 'refuse', 'retire'])

function buildRadarData(
  ratings: Record<string, number>,
  categories: CategoryInfo[],
  roleCategoryIds: string[],
): RadarDataPoint[] {
  const relevantSet = new Set(roleCategoryIds)
  // If empty (stale role), fall back to full catalog so the page still renders.
  const activeCats = relevantSet.size === 0 ? categories : categories.filter(c => relevantSet.has(c.id))
  return activeCats.map(cat => {
    const skills = cat.skills.map(s => ratings[s.id] ?? 0)
    const rated = skills.filter(v => v > 0)
    return {
      label: cat.label.replace(/&/g, '\n&'),
      value: rated.length > 0 ? rated.reduce((a, b) => a + b, 0) / rated.length : 0,
      fullMark: 5,
    }
  })
}

export default function ReportComparisonPage() {
  const { posteId } = useParams<{ posteId: string }>()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<PageState>('loading')
  const [payload, setPayload] = useState<ComparisonPayload | null>(null)
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [aboroByCandidate, setAboroByCandidate] = useState<Record<string, AboroProfile | null>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [staleDismissed, setStaleDismissed] = useState(false)

  useEffect(() => {
    if (!posteId) return

    let cancelled = false

    const loadData = async () => {
      setState('loading')
      try {
        const [comparisonRes, catalogRes] = await Promise.all([
          fetch(`/api/recruitment/postes/${posteId}/comparison`, { credentials: 'include' }),
          fetch('/api/catalog'),
        ])

        if (!comparisonRes.ok) {
          if (!cancelled) setState('error')
          return
        }

        const data: ComparisonPayload = await comparisonRes.json()
        const catalog = catalogRes.ok ? await catalogRes.json() : { categories: [] }
        const cats: CategoryInfo[] = catalog.categories ?? []

        if (cancelled) return

        setPayload(data)
        setCategories(cats)

        // Initialize selection from URL `?candidatures=...` (first load only),
        // falling back to top-3. A stale/empty URL intersection surfaces a
        // toast so the recruiter knows the link is outdated rather than
        // silently seeing a different set of candidates.
        setSelectedIds(prev => {
          if (prev.size > 0) {
            // Preserve existing selection if candidates still present; drop gone ones.
            const stillPresent = new Set(data.candidatures.map(c => c.id))
            const kept = new Set(Array.from(prev).filter(id => stillPresent.has(id)))
            if (kept.size > 0) return kept
          }

          const urlIds = (searchParams.get('candidatures') ?? '').split(',').filter(Boolean)
          if (urlIds.length > 0) {
            const presentSet = new Set(data.candidatures.map(c => c.id))
            const intersected = urlIds.filter(id => presentSet.has(id))
            if (intersected.length === 0) {
              toast.warning(`Les candidats du lien ne sont plus dans ce poste — affichage des ${Math.min(3, data.candidatures.length)} premiers par score.`)
              return new Set(data.candidatures.slice(0, 3).map(c => c.id))
            }
            const capped = intersected.slice(0, MAX_OVERLAY)
            const dropped = intersected.length - capped.length
            const missing = urlIds.length - intersected.length
            if (missing > 0) {
              toast.info(`${missing} candidat(s) du lien ne sont plus disponibles — affichage des ${capped.length} restant(s).`)
            } else if (dropped > 0) {
              toast.info(`Comparaison limitée à ${MAX_OVERLAY} candidats — ${dropped} masqué(s).`)
            }
            return new Set(capped)
          }

          return new Set(data.candidatures.slice(0, 3).map(c => c.id))
        })

        // Fetch aboro per candidate (unchanged pattern, non-blocking).
        const aboroResults = await Promise.all(
          data.candidatures.map(async c => {
            const r = await fetch(`/api/recruitment/candidates/${c.candidateId}/aboro`, { credentials: 'include' })
            return { id: c.id, aboro: r.ok ? (await r.json()).profile ?? null : null }
          }),
        )
        if (cancelled) return
        const aboroMap: Record<string, AboroProfile | null> = {}
        for (const { id, aboro } of aboroResults) aboroMap[id] = aboro
        setAboroByCandidate(aboroMap)

        setState(data.candidatures.length === 0 ? 'empty' : 'loaded')
      } catch (err) {
        console.error('[Report Comparison] Error:', err)
        if (!cancelled) setState('error')
      }
    }

    loadData()
    return () => { cancelled = true }
    // `searchParams` is intentionally read as initial state — changing URL
    // params post-load does NOT re-fetch or re-select. The selection is
    // owned by the user once they've toggled checkboxes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posteId, reloadToken])

  const bundles: CandidateBundle[] = useMemo(() => {
    if (!payload) return []
    return payload.candidatures.map(row => ({
      row,
      aboro: aboroByCandidate[row.id] ?? null,
      radarData: buildRadarData(row.ratings, categories, payload.roleCategories),
    }))
  }, [payload, aboroByCandidate, categories])

  const selectedBundles = bundles.filter(b => selectedIds.has(b.row.id))

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) {
        if (next.size >= MAX_OVERLAY) return prev
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const runTransition = async () => {
    if (!pendingAction) return
    setActionBusy(true)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${pendingAction.candidatureId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: pendingAction.nextStatut,
          currentStatut: pendingAction.currentStatut,
          sendEmail: pendingAction.nextStatut === 'refuse',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error ?? `Erreur : ${res.status}`)
        return
      }
      setPendingAction(null)
      setReloadToken(t => t + 1)
    } finally {
      setActionBusy(false)
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center" data-testid="state-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div
          className="max-w-md rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-destructive"
          data-testid="state-error"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium mb-1">Erreur de chargement</h3>
              <p className="text-sm mb-3">Impossible de charger la comparaison. Vérifiez votre connexion et réessayez.</p>
              <Button variant="outline" size="sm" onClick={() => setReloadToken(t => t + 1)}>
                Réessayer
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'empty' || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md rounded-lg border bg-muted/30 p-4" data-testid="state-empty">
          <h3 className="font-medium mb-1">Aucun candidat</h3>
          <p className="text-sm text-muted-foreground">
            Aucune candidature active pour ce poste. Une fois que des candidats ont postulé, ils apparaîtront ici.
          </p>
        </div>
      </div>
    )
  }

  const posteTitre = payload.poste.titre
  const candidates = bundles
  const roleHasCategories = payload.roleCategories.length > 0
  const showStalenessBanner = !roleHasCategories && !staleDismissed
  const singleCandidate = candidates.length === 1

  return (
    <div className="min-h-screen bg-white text-black print:text-black">
      <style>{`@media print { .no-print { display: none !important; } @page { size: landscape; margin: 1cm; } }`}</style>

      <div className="no-print fixed top-4 right-4 z-50">
        <Button onClick={() => window.print()} size="sm">
          <Printer className="h-4 w-4 mr-2" />
          Imprimer / Enregistrer PDF
        </Button>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
        {/* Header */}
        <div className="text-center border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold uppercase tracking-wide">Comparaison des candidats</h1>
          <p className="text-sm mt-1">{posteTitre} — GIE SINAPSE</p>
          <p className="text-xs text-gray-500 mt-1">
            {candidates.length} candidat{candidates.length !== 1 ? 's' : ''} en lice (hors refusés)
          </p>
        </div>

        {/* Staleness banner */}
        {showStalenessBanner && (
          <div
            className="no-print rounded-lg border border-amber-400 bg-amber-50 p-4 dark:bg-amber-900/20"
            data-testid="state-stale"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <h3 className="font-medium text-sm mb-1 text-amber-900 dark:text-amber-200">
                  Configuration du rôle incomplète
                </h3>
                <div className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
                  <span className="flex-1">
                    Aucune catégorie de compétence n'est associée à ce rôle. Le classement et le radar utilisent toutes les catégories en fallback.
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setStaleDismissed(true)}>
                    Ignorer
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Interactive ranked table (hidden in print) */}
        <div className="no-print">
          <h2 className="text-lg font-bold mb-3">Classement</h2>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="w-12 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Candidat</th>
                  <th className="w-20 px-3 py-2 font-medium text-right">Fit</th>
                  <th className="px-3 py-2 font-medium">Manques</th>
                  <th className="w-56 px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(b => {
                  const { row } = b
                  const isSelected = selectedIds.has(row.id)
                  const atCap = !isSelected && selectedIds.size >= MAX_OVERLAY
                  const isTerminal = TERMINAL_STATUSES.has(row.statut)
                  const canPreselect = row.statut === 'postule'
                  return (
                    <tr key={row.id} className="border-t hover:bg-muted/30" data-testid={`row-${row.id}`}>
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={isSelected}
                          disabled={atCap}
                          onCheckedChange={c => toggleSelection(row.id, c === true)}
                          aria-label={`Inclure ${row.candidateName} dans le radar`}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.rank}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.candidateName}</div>
                        <div className="text-xs text-muted-foreground">
                          {STATUT_LABELS[row.statut] ?? row.statut}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.tauxPoste != null ? `${row.tauxPoste}%` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row.gaps.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Aucun</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.gaps.map(g => (
                              <GapChip
                                key={g.categoryId}
                                categoryLabel={g.categoryLabel}
                                rating={g.rating}
                                severity={g.severity}
                                targetRating={TARGET_RATING}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={!canPreselect}
                            onClick={() => setPendingAction({
                              candidatureId: row.id,
                              candidateName: row.candidateName,
                              nextStatut: 'preselectionne',
                              currentStatut: row.statut,
                            })}
                            data-testid={`preselect-${row.id}`}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Préselec.
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isTerminal}
                            onClick={() => setPendingAction({
                              candidatureId: row.id,
                              candidateName: row.candidateName,
                              nextStatut: 'refuse',
                              currentStatut: row.statut,
                            })}
                            data-testid={`refuse-${row.id}`}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Refuser
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {singleCandidate && (
            <p className="mt-2 text-xs text-muted-foreground">
              Un seul candidat — ajoutez d'autres candidatures pour comparer.
            </p>
          )}
        </div>

        {/* Radar overlay (role-aware axes) */}
        {selectedBundles.length > 0 && categories.length > 0 && (
          <div className="mb-8 flex justify-center">
            <div className="w-[500px]">
              <VisxRadarChart
                data={selectedBundles[0]?.radarData ?? []}
                overlay={selectedBundles[1]?.radarData}
                primaryLabel={selectedBundles[0]?.row.candidateName}
                overlayLabel={selectedBundles[1]?.row.candidateName}
                height={350}
                showExport={false}
              />
              {selectedBundles.length > 2 && (
                <p className="text-xs text-gray-500 text-center mt-1">
                  Radar affiche les 2 premiers sélectionnés ({selectedBundles.length} cochés — décoche pour changer la comparaison).
                </p>
              )}
              {!roleHasCategories && (
                <p className="text-xs text-amber-700 dark:text-amber-400 text-center mt-1">
                  Axes : toutes catégories (rôle non configuré)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Print-friendly comparison table */}
        <div className="overflow-x-auto">
          <h2 className="text-lg font-bold border-b pb-1 mb-3 hidden print:block">Synthèse</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Candidat</th>
                <th className="py-2 font-medium">Statut</th>
                <th className="py-2 font-medium text-right">Poste</th>
                <th className="py-2 font-medium text-right">Équipe</th>
                <th className="py-2 font-medium text-right">Soft</th>
                <th className="py-2 font-medium text-right">Global</th>
                <th className="py-2 font-medium">Manques</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(b => {
                const { row } = b
                return (
                  <tr key={row.id} className="border-b border-gray-200">
                    <td className="py-2 font-mono text-xs">{row.rank}</td>
                    <td className="py-2 font-medium">{row.candidateName}</td>
                    <td className="py-2 text-xs">{STATUT_LABELS[row.statut] ?? row.statut}</td>
                    <td className="py-2 text-right font-mono">{row.tauxPoste != null ? `${row.tauxPoste}%` : '—'}</td>
                    <td className="py-2 text-right font-mono">{row.tauxEquipe != null ? `${row.tauxEquipe}%` : '—'}</td>
                    <td className="py-2 text-right font-mono">{row.tauxSoft != null ? `${row.tauxSoft}%` : '—'}</td>
                    <td className="py-2 text-right font-bold font-mono">{row.tauxGlobal != null ? `${row.tauxGlobal}%` : '—'}</td>
                    <td className="py-2 text-xs">
                      {row.gaps.length === 0
                        ? '—'
                        : row.gaps.map(g => g.categoryLabel).join(', ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Aboro summary (existing print section) */}
        {candidates.some(b => b.aboro) && (
          <div>
            <h2 className="text-lg font-bold border-b pb-1 mb-3">Profils comportementaux</h2>
            <div className="grid grid-cols-2 gap-4">
              {candidates.filter(b => b.aboro).map(b => (
                <div key={b.row.id} className="border rounded p-3">
                  <p className="font-medium text-sm mb-1">{b.row.candidateName}</p>
                  {b.aboro!.talents.length > 0 && (
                    <div className="mb-1">
                      <span className="text-xs text-gray-500">Talents : </span>
                      <span className="text-xs">{b.aboro!.talents.slice(0, 4).join(', ')}</span>
                    </div>
                  )}
                  {b.aboro!.axes_developpement.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-500">Axes dev. : </span>
                      <span className="text-xs">{b.aboro!.axes_developpement.slice(0, 3).join(', ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t-2 border-black pt-4 text-center text-xs text-gray-500">
          <p>Généré par Skill Radar — GIE SINAPSE</p>
          <p>Document confidentiel — {new Date().toLocaleDateString('fr-FR')}</p>
        </div>
      </div>

      {/* Action confirmation dialog */}
      <AlertDialog open={pendingAction !== null} onOpenChange={open => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.nextStatut === 'preselectionne' ? 'Préselectionner ce candidat ?' : 'Refuser ce candidat ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.nextStatut === 'preselectionne'
                ? `${pendingAction?.candidateName} passera au statut « Préselectionné ». Un email d'évaluation lui sera envoyé.`
                : `${pendingAction?.candidateName} sera refusé. Un email de refus sera envoyé au candidat.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={runTransition}
              disabled={actionBusy}
              className={pendingAction?.nextStatut === 'refuse' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

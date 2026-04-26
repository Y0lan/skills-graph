import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, BarChart3, Loader2, Star } from 'lucide-react'
import { toast } from 'sonner'
import AppHeader from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import StarToggle from '@/components/recruit/star-toggle'
import { STATUT_LABELS, formatDateTime } from '@/lib/constants'

interface ShortlistItem {
  candidatureId: string
  addedAt: string
  note: string | null
  statut: string
  posteId: string
  posteTitre: string
  postePole: string
  candidateId: string
  candidateName: string
  candidateEmail: string | null
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
  tauxGlobal: number | null
}

const REPORT_CAP = 4

interface PosteOption { id: string; titre: string; pole: string }

export default function RecruitSavedCandidatesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ShortlistItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Selection scoped per-poste (used by the per-group "Comparer" button —
  // existing per-poste comparison endpoint).
  const [selectedByPoste, setSelectedByPoste] = useState<Record<string, Set<string>>>({})
  // Cross-poste selection — flat set across all groups, paired with a
  // user-picked target poste. Drives the new cross-poste comparison.
  const [crossPosteIds, setCrossPosteIds] = useState<Set<string>>(new Set())
  const [targetPosteId, setTargetPosteId] = useState<string>('')
  const [allPostes, setAllPostes] = useState<PosteOption[]>([])

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/recruitment/shortlist', { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      const body = await res.json() as { items: ShortlistItem[] }
      setItems(body.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  // Fetch all postes once for the target-poste picker (cross-poste compare).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/recruitment/postes', { credentials: 'include' })
        if (!res.ok) return
        const body = await res.json() as Array<{ id: string; titre: string; pole: string }>
        if (!cancelled) setAllPostes(body.map(p => ({ id: p.id, titre: p.titre, pole: p.pole })))
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { fetchItems() }, [])

  // Group by source-poste. Sort groups by latest added-at so freshly-
  // starred postes float up.
  const groups = useMemo(() => {
    if (!items) return []
    const byPoste = new Map<string, { posteId: string; posteTitre: string; postePole: string; rows: ShortlistItem[]; latestAddedAt: string }>()
    for (const it of items) {
      const g = byPoste.get(it.posteId)
      if (g) {
        g.rows.push(it)
        if (it.addedAt > g.latestAddedAt) g.latestAddedAt = it.addedAt
      } else {
        byPoste.set(it.posteId, { posteId: it.posteId, posteTitre: it.posteTitre, postePole: it.postePole, rows: [it], latestAddedAt: it.addedAt })
      }
    }
    return Array.from(byPoste.values()).sort((a, b) => b.latestAddedAt.localeCompare(a.latestAddedAt))
  }, [items])

  const toggleSelect = (posteId: string, candidatureId: string) => {
    setSelectedByPoste(prev => {
      const next = { ...prev }
      const set = new Set(next[posteId] ?? [])
      if (set.has(candidatureId)) set.delete(candidatureId); else set.add(candidatureId)
      next[posteId] = set
      return next
    })
  }

  const compareGroup = (posteId: string) => {
    const set = selectedByPoste[posteId]
    if (!set || set.size < 2) return
    const ids = Array.from(set).slice(0, REPORT_CAP).join(',')
    if (set.size > REPORT_CAP) {
      toast.info(`Comparaison limitée à ${REPORT_CAP} candidats — les premiers sélectionnés sont retenus.`)
    }
    navigate(`/recruit/reports/comparison/${posteId}?candidatures=${ids}`)
  }

  const toggleCrossPoste = (candidatureId: string) => {
    setCrossPosteIds(prev => {
      const next = new Set(prev)
      if (next.has(candidatureId)) next.delete(candidatureId); else next.add(candidatureId)
      return next
    })
  }

  const compareCrossPoste = () => {
    if (crossPosteIds.size < 2 || !targetPosteId) return
    const ids = Array.from(crossPosteIds).slice(0, REPORT_CAP).join(',')
    if (crossPosteIds.size > REPORT_CAP) {
      toast.info(`Comparaison limitée à ${REPORT_CAP} candidats — les premiers sélectionnés sont retenus.`)
    }
    // cross=1 + target poste in URL → comparison page POSTs to the
    // cross-poste endpoint with baseline-only scoring.
    navigate(`/recruit/reports/comparison/${targetPosteId}?cross=1&candidatures=${ids}`)
  }

  const removeStarred = (candidatureId: string) => {
    setItems(prev => prev?.filter(i => i.candidatureId !== candidatureId) ?? prev)
    setSelectedByPoste(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (next[k].has(candidatureId)) {
          const s = new Set(next[k]); s.delete(candidatureId); next[k] = s
        }
      }
      return next
    })
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container mx-auto px-4 py-6 text-sm text-red-600">{error}</div>
      </div>
    )
  }

  if (!items) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container mx-auto px-4 py-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div>
          <Link to="/recruit/pipeline" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Pipeline
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <h1 className="text-2xl font-bold">Candidats sauvegardés</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Marquez des candidats avec ⭐ depuis n&apos;importe où dans le recrutement
            pour les retrouver ici. Comparez sur leur poste d&apos;origine ci-dessous,
            ou sélectionnez plusieurs candidats issus de postes différents et
            comparez-les contre un poste cible (cross-poste, ci-dessous).
          </p>
        </div>

        {/* Cross-poste comparison panel — visible only when items exist.
            Lets the recruiter pick a target poste + ≥2 starred candidates
            from any source poste, then opens the comparison report with
            baseline-only scoring against the target. */}
        {items.length > 0 ? (
          <Card className="border-primary/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Comparer sur tous les postes
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                    Choisissez un poste cible, cochez les candidats à comparer
                    (max {REPORT_CAP}). Les scores sont recalculés contre le
                    poste cible à partir des compétences de base —
                    sans relecture role-aware d&apos;origine.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    aria-label="Poste cible"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[14rem]"
                    value={targetPosteId}
                    onChange={(e) => setTargetPosteId(e.target.value)}
                  >
                    <option value="">— Choisir un poste cible —</option>
                    {allPostes.map(p => (
                      <option key={p.id} value={p.id}>{p.titre} ({p.pole})</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={!targetPosteId || crossPosteIds.size < 2}
                    onClick={compareCrossPoste}
                    title={
                      !targetPosteId ? 'Choisissez un poste cible' :
                      crossPosteIds.size < 2 ? 'Cochez au moins 2 candidats ci-dessous' :
                      'Lancer la comparaison cross-poste'
                    }
                  >
                    <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                    Comparer cross-poste ({crossPosteIds.size})
                  </Button>
                </div>
              </div>
              {crossPosteIds.size > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {crossPosteIds.size} candidat{crossPosteIds.size > 1 ? 's' : ''} sélectionné{crossPosteIds.size > 1 ? 's' : ''} cross-poste ·{' '}
                  <button type="button" className="underline hover:text-foreground" onClick={() => setCrossPosteIds(new Set())}>tout désélectionner</button>
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Star className="h-8 w-8 mx-auto mb-3 opacity-40" />
              Aucun candidat sauvegardé pour l&apos;instant.<br />
              Cliquez sur l&apos;étoile à côté d&apos;un candidat pour l&apos;ajouter ici.
            </CardContent>
          </Card>
        ) : (
          groups.map(g => {
            const sel = selectedByPoste[g.posteId] ?? new Set<string>()
            const canCompare = sel.size >= 2
            return (
              <Card key={g.posteId}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h2 className="text-base font-semibold">{g.posteTitre}</h2>
                      <p className="text-xs text-muted-foreground">
                        {g.postePole} · {g.rows.length} candidat{g.rows.length > 1 ? 's' : ''} sauvegardé{g.rows.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canCompare}
                      onClick={() => compareGroup(g.posteId)}
                      title={canCompare ? 'Lancer la comparaison sur ce poste' : 'Sélectionnez au moins 2 candidats du même poste'}
                    >
                      <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                      Comparer ({sel.size})
                    </Button>
                  </div>
                  <div className="grid grid-cols-[auto_auto_1fr] sm:grid-cols-[6rem_6rem_1fr] gap-y-0 rounded-md border overflow-hidden">
                    {/* Column header row — clarifies the two checkboxes */}
                    <div className="contents text-[10px] font-semibold tracking-wider uppercase text-muted-foreground bg-muted/40">
                      <div className="px-3 py-1.5 text-center border-b">Source</div>
                      <div className="px-3 py-1.5 text-center border-b border-l">Cross-poste</div>
                      <div className="px-3 py-1.5 border-b border-l">Candidat</div>
                    </div>
                    {g.rows.map((r, idx) => (
                      <div key={r.candidatureId} className={`contents ${idx > 0 ? '' : ''}`}>
                        <div className="px-3 py-3 flex items-center justify-center border-t hover:bg-muted/30">
                          <Checkbox
                            checked={sel.has(r.candidatureId)}
                            onCheckedChange={() => toggleSelect(g.posteId, r.candidatureId)}
                            aria-label={`Sélectionner ${r.candidateName} pour la comparaison sur ${g.posteTitre}`}
                            title="Comparer sur ce poste source"
                          />
                        </div>
                        <div className="px-3 py-3 flex items-center justify-center border-t border-l hover:bg-muted/30">
                          <Checkbox
                            checked={crossPosteIds.has(r.candidatureId)}
                            onCheckedChange={() => toggleCrossPoste(r.candidatureId)}
                            aria-label={`Sélectionner ${r.candidateName} pour la comparaison cross-poste`}
                            title="Comparer cross-poste (panneau en haut)"
                            className="border-primary/60 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                          />
                        </div>
                        <div className="flex items-center gap-3 p-3 border-t border-l hover:bg-muted/30 transition-colors min-w-0">
                        <StarToggle
                          candidatureId={r.candidatureId}
                          initialActive
                          onChange={(active) => { if (!active) removeStarred(r.candidatureId) }}
                        />
                        <Link to={`/recruit/${r.candidateId}`} className="flex-1 min-w-0 hover:underline">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{r.candidateName}</span>
                            <Badge variant="outline" className="shrink-0">{STATUT_LABELS[r.statut] ?? r.statut}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {r.tauxGlobal != null ? `Global ${Math.round(r.tauxGlobal)}%` : 'Score à calculer'}
                            {r.tauxPoste != null ? ` · Poste ${Math.round(r.tauxPoste)}%` : ''}
                            {' · ajouté '}{formatDateTime(r.addedAt)}
                          </div>
                        </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

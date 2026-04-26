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

export default function RecruitSavedCandidatesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ShortlistItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Selection scoped per-poste (since the comparison report stays
  // per-poste this session). Map of posteId → set of candidatureIds.
  const [selectedByPoste, setSelectedByPoste] = useState<Record<string, Set<string>>>({})

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
            pour les retrouver ici. Comparaison multi-postes : bientôt disponible.
            En attendant, comparez par poste source ci-dessous.
          </p>
        </div>

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
                  <div className="divide-y rounded-md border">
                    {g.rows.map(r => (
                      <div key={r.candidatureId} className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                        <Checkbox
                          checked={sel.has(r.candidatureId)}
                          onCheckedChange={() => toggleSelect(g.posteId, r.candidatureId)}
                          aria-label={`Sélectionner ${r.candidateName} pour la comparaison`}
                        />
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

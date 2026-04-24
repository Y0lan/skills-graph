import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import AppHeader from '@/components/app-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ArrowLeft, ChevronRight, Send, BarChart3, Loader2 } from 'lucide-react'

interface ShortlistItem {
  candidatureId: string
  candidateId: string
  name: string
  statut: string
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxSoft: number | null
  tauxGlobal: number
  currentCompany: string | null
  currentRole: string | null
  totalExperienceYears: number | null
  city: string | null
  top3Skills: Array<{ skillId: string; rating: number }>
}

interface ShortlistResponse {
  poste: { id: string; titre: string; description: string | null; roleId: string }
  items: ShortlistItem[]
}

type SortKey = 'global' | 'poste' | 'equipe' | 'soft'

export default function PosteShortlistPage() {
  const { posteId } = useParams<{ posteId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ShortlistResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<SortKey>('global')
  const [outreachOpen, setOutreachOpen] = useState(false)
  const [outreachStatut, setOutreachStatut] = useState('skill_radar_envoye')
  const [outreachMessage, setOutreachMessage] = useState('')
  const [sending, setSending] = useState(false)

  const fetchShortlist = useCallback(async () => {
    if (!posteId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/recruitment/postes/${posteId}/shortlist?limit=10`, { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [posteId])

  useEffect(() => { fetchShortlist() }, [fetchShortlist])

  const sorted = useMemo(() => {
    if (!data) return []
    const items = [...data.items]
    const key: keyof ShortlistItem = sortBy === 'global' ? 'tauxGlobal'
      : sortBy === 'poste' ? 'tauxPoste'
      : sortBy === 'equipe' ? 'tauxEquipe'
      : 'tauxSoft'
    items.sort((a, b) => ((b[key] as number | null) ?? -1) - ((a[key] as number | null) ?? -1))
    return items
  }, [data, sortBy])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Cap aligned with the comparison report's MAX_OVERLAY = 4 (report-comparison-page.tsx).
  // Selecting 5 would silently drop the 5th on the report side.
  const canCompare = selected.size >= 2 && selected.size <= 4
  const canOutreach = selected.size > 0 && selected.size <= 20

  const sendOutreach = async () => {
    if (!posteId) return
    setSending(true)
    const key = crypto.randomUUID()
    try {
      const res = await fetch(`/api/recruitment/postes/${posteId}/outreach`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
        body: JSON.stringify({
          candidatureIds: Array.from(selected),
          statut: outreachStatut,
          customBody: outreachMessage.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const sentCount = body.sent?.length ?? 0
      const failedCount = body.failed?.length ?? 0
      if (failedCount === 0) {
        toast.success(`${sentCount} email${sentCount > 1 ? 's' : ''} envoyé${sentCount > 1 ? 's' : ''}`)
      } else {
        toast.warning(`${sentCount} envoyé(s), ${failedCount} échec(s) — voir la console`)
        console.warn('Outreach failures:', body.failed)
      }
      setOutreachOpen(false)
      setSelected(new Set())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  const compareSelected = () => {
    if (!canCompare || !posteId) return
    const ids = Array.from(selected).join(',')
    navigate(`/recruit/reports/comparison/${posteId}?candidatures=${ids}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container mx-auto px-4 py-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la shortlist…
        </div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container mx-auto px-4 py-6 text-sm text-red-600">{error ?? 'Erreur inconnue'}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <Link to="/recruit" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Pipeline
            </Link>
            <h1 className="text-2xl font-bold mt-1">Shortlist : {data.poste.titre}</h1>
            {data.poste.description ? (
              <p className="text-sm text-muted-foreground mt-1 max-w-3xl line-clamp-2">{data.poste.description}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="shortlist-sort" className="text-sm text-muted-foreground">Trier par</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy((v ?? 'global') as SortKey)}>
              <SelectTrigger id="shortlist-sort" className="w-40" aria-label="Critère de tri"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="poste">Poste</SelectItem>
                <SelectItem value="equipe">Équipe</SelectItem>
                <SelectItem value="soft">Soft</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={!canCompare} onClick={compareSelected}>
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Comparer ({selected.size})
            </Button>
            <Button size="sm" disabled={!canOutreach} onClick={() => setOutreachOpen(true)}>
              <Send className="h-3.5 w-3.5 mr-1.5" /> Contacter ({selected.size})
            </Button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Aucun candidat avec un score global calculé pour ce poste.
              <br />
              <span className="text-xs">Ajoutez une fiche de poste + ré-extrayez les CV pour voir la shortlist.</span>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top {sorted.length} — triés par {sortBy}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {sorted.map(item => (
                <div key={item.candidatureId} className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={selected.has(item.candidatureId)}
                    onCheckedChange={() => toggle(item.candidatureId)}
                  />
                  <Link to={`/recruit/${item.candidateId}`} className="flex-1 min-w-0 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[
                          item.currentRole && item.currentCompany ? `${item.currentRole} · ${item.currentCompany}` : null,
                          item.totalExperienceYears != null ? `${item.totalExperienceYears} ans` : null,
                          item.city,
                        ].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.top3Skills.map(s => (
                          <Badge key={s.skillId} variant="outline" className="text-[10px] tabular-nums">
                            {s.skillId} · L{s.rating}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-xs tabular-nums shrink-0">
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">Global</div>
                        <div className="font-semibold">{item.tauxGlobal}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">Poste</div>
                        <div className="font-medium">{item.tauxPoste ?? '—'}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">Équipe</div>
                        <div className="font-medium">{item.tauxEquipe ?? '—'}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">Soft</div>
                        <div className="font-medium">{item.tauxSoft ?? '—'}%</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={outreachOpen} onOpenChange={(v) => { if (!v) setOutreachOpen(false) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Contacter {selected.size} candidat{selected.size > 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Template d&apos;email (statut)</label>
              <Select value={outreachStatut} onValueChange={(v) => setOutreachStatut(v ?? 'skill_radar_envoye')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skill_radar_envoye">Envoyer skill radar</SelectItem>
                  <SelectItem value="preselectionne">Pré-sélectionné</SelectItem>
                  <SelectItem value="entretien_1">Entretien 1</SelectItem>
                  <SelectItem value="entretien_2">Entretien 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Message personnalisé (optionnel, markdown)</label>
              <Textarea
                value={outreachMessage}
                onChange={e => setOutreachMessage(e.target.value)}
                rows={5}
                placeholder="Laisser vide pour utiliser le template par défaut"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Max 20 candidats par envoi. Les échecs individuels n&apos;arrêtent pas le lot.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOutreachOpen(false)} disabled={sending}>Annuler</Button>
            <Button onClick={sendOutreach} disabled={sending}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Envoyer ({selected.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

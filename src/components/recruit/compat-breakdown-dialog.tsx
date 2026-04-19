import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, AlertTriangle, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export type CompatMetric = 'poste' | 'equipe' | 'soft'

export interface CompatBreakdownDialogProps {
  open: boolean
  onClose: () => void
  candidatureId: string
  metric: CompatMetric
}

interface PosteItem {
  skillId?: string
  skillLabel?: string
  categoryId?: string
  categoryLabel?: string
  candidateLevel: number
  targetLevel: number
  weight: number
  contribution: number
  contributionPct: number
}

interface PosteBreakdown {
  total: number
  formula: 'weighted' | 'category-average'
  items: PosteItem[]
}

interface EquipeItem {
  categoryId: string
  categoryLabel: string
  candidateAvg: number
  teamAvg: number
  contribution: number
  direction: 'fills_gap' | 'matches' | 'below_team'
}

interface EquipeBreakdown {
  total: number
  items: EquipeItem[]
}

interface SoftBreakdown {
  total: number
  groups: Array<{
    name: 'collaboration' | 'adaptability' | 'leadership'
    weight: number
    avg: number
    contribution: number
    traits: { name: string; value: number }[]
  }>
  alerts: { trait: string; value: number; threshold: number; message: string }[]
}

type Breakdown = PosteBreakdown | EquipeBreakdown | SoftBreakdown

const METRIC_TITLES: Record<CompatMetric, string> = {
  poste: 'Compatibilité au poste',
  equipe: 'Complémentarité avec l’équipe',
  soft: 'Profil comportemental (Âboro)',
}

const FORMULA_TEXT: Record<string, string> = {
  weighted: 'score = Σ ( min(candidat, attendu) / attendu × poids ) / Σ poids × 100  · poids = 2 (requis), 1 (apprécié)',
  'category-average': 'score = moyenne des moyennes catégorie (candidat / 5 × 100) — fallback Phase 1',
  equipe: 'Par catégorie : si candidat ≥ moyenne équipe → bonus de comblement de gap ; sinon malus de 20 %',
  soft: 'score = ( collaboration × 0.4 + adaptabilité × 0.3 + leadership × 0.3 ) × 10',
}

export default function CompatBreakdownDialog({ open, onClose, candidatureId, metric }: CompatBreakdownDialogProps) {
  const [data, setData] = useState<Breakdown | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setData(null)
    setError(null)
    setLoading(true)
    fetch(`/api/recruitment/candidatures/${candidatureId}/compat/${metric}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<Breakdown>
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [open, candidatureId, metric])

  function copyMarkdown(): void {
    if (!data) return
    const lines: string[] = [`# ${METRIC_TITLES[metric]} — ${data.total}%`, '']
    if (metric === 'poste') {
      const d = data as PosteBreakdown
      lines.push(`Formule : \`${FORMULA_TEXT[d.formula]}\``, '')
      lines.push('| Élément | Candidat | Attendu | Poids | Contribution |')
      lines.push('|---|---|---|---|---|')
      for (const it of d.items) {
        const label = it.skillLabel ?? it.categoryLabel ?? '?'
        lines.push(`| ${label} | ${it.candidateLevel} | ${it.targetLevel} | ${it.weight} | ${it.contributionPct}% |`)
      }
    } else if (metric === 'equipe') {
      const d = data as EquipeBreakdown
      lines.push(`Formule : \`${FORMULA_TEXT.equipe}\``, '')
      lines.push('| Catégorie | Candidat | Équipe | Direction | Score |')
      lines.push('|---|---|---|---|---|')
      for (const it of d.items) {
        lines.push(`| ${it.categoryLabel} | ${it.candidateAvg} | ${it.teamAvg} | ${it.direction} | ${it.contribution} |`)
      }
    } else {
      const d = data as SoftBreakdown
      lines.push(`Formule : \`${FORMULA_TEXT.soft}\``, '')
      lines.push('| Groupe | Moyenne | Poids | Contribution |')
      lines.push('|---|---|---|---|')
      for (const g of d.groups) {
        lines.push(`| ${g.name} | ${g.avg}/10 | ${g.weight} | ${g.contribution} |`)
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success('Copié — vous pouvez coller dans vos notes'),
      () => toast.error('Impossible de copier'),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>{METRIC_TITLES[metric]}</span>
            {data && <Badge className="text-base">{data.total}%</Badge>}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {data && metric === 'poste' && (
              <>Formule : <code className="text-[10px]">{FORMULA_TEXT[(data as PosteBreakdown).formula]}</code></>
            )}
            {data && metric === 'equipe' && (
              <>Formule : <code className="text-[10px]">{FORMULA_TEXT.equipe}</code></>
            )}
            {data && metric === 'soft' && (
              <>Formule : <code className="text-[10px]">{FORMULA_TEXT.soft}</code></>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calcul du détail…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {data && metric === 'poste' && <PosteBreakdownView data={data as PosteBreakdown} />}
        {data && metric === 'equipe' && <EquipeBreakdownView data={data as EquipeBreakdown} />}
        {data && metric === 'soft' && <SoftBreakdownView data={data as SoftBreakdown} />}

        {data && (
          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={copyMarkdown}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copier en markdown
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PosteBreakdownView({ data }: { data: PosteBreakdown }) {
  if (data.items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Aucun item à détailler.</p>
  }
  const maxContribution = Math.max(...data.items.map(i => i.contribution))
  return (
    <div className="space-y-1.5">
      {data.items.map((item, i) => {
        const label = item.skillLabel ?? item.categoryLabel ?? '?'
        const widthPct = maxContribution > 0 ? (item.contribution / maxContribution) * 100 : 0
        const fullness = item.targetLevel > 0 ? Math.min(100, (item.candidateLevel / item.targetLevel) * 100) : 0
        return (
          <div key={`${label}-${i}`} className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="truncate font-medium">
                {label}
                {item.weight === 2 && <Badge variant="outline" className="ml-1.5 text-[9px] py-0 px-1">Requis</Badge>}
                {item.weight === 1 && <Badge variant="outline" className="ml-1.5 text-[9px] py-0 px-1 text-muted-foreground">Apprécié</Badge>}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {item.candidateLevel}/{item.targetLevel} · {item.contributionPct}%
              </span>
            </div>
            <div className="h-1.5 rounded bg-muted overflow-hidden">
              <div
                className={`h-full ${fullness >= 100 ? 'bg-emerald-500' : fullness >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EquipeBreakdownView({ data }: { data: EquipeBreakdown }) {
  if (data.items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Aucune catégorie à comparer.</p>
  }
  const labels: Record<EquipeItem['direction'], { label: string; color: string }> = {
    fills_gap: { label: 'Comble un gap', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    matches: { label: 'Renforce', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
    below_team: { label: 'Sous l’équipe', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-500' },
  }
  return (
    <div className="space-y-2">
      {data.items.map(item => (
        <div key={item.categoryId} className="rounded-md border p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium truncate">{item.categoryLabel}</span>
            <Badge className={`text-[10px] ${labels[item.direction].color}`}>
              {labels[item.direction].label}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground tabular-nums">
            <div>Candidat : <span className="text-foreground font-medium">{item.candidateAvg}/5</span></div>
            <div>Équipe : <span className="text-foreground font-medium">{item.teamAvg}/5</span></div>
            <div>Score : <span className="text-foreground font-medium">{item.contribution}</span></div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SoftBreakdownView({ data }: { data: SoftBreakdown }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {data.groups.map(g => (
          <div key={g.name} className="rounded-md border p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium capitalize">{g.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">poids {g.weight} · {g.avg}/10</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {g.traits.map(t => (
                <Badge key={t.name} variant="outline" className="text-[10px]">
                  {t.name}: {t.value}/10
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
      {data.alerts.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-1.5">Alertes (informatives, non éliminatoires)</p>
          <ul className="space-y-0.5 text-[11px] text-amber-900 dark:text-amber-200">
            {data.alerts.map(a => (
              <li key={a.trait}>• {a.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

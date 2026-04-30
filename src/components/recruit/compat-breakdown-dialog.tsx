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
  fulfillmentPct?: number
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

interface GapAnalysisEntry {
  categoryId: string
  categoryLabel: string
  candidateAvg: number
  teamAvg: number
  gap: number
}

interface BonusSkillEntry {
  skillId: string
  skillLabel: string
  categoryLabel: string
  score: number
}

interface EquipeBreakdown {
  total: number
  items: EquipeItem[]
  gapAnalysis?: GapAnalysisEntry[]
  bonusSkills?: BonusSkillEntry[]
  promptVersion?: number | null
  model?: string | null
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

/** Human-language explanations shown under the dialog title. Replaced the
 *  older maths-notation strings because recruiters (primary audience) need
 *  "what does this score mean" more than "what's the exact formula". The
 *  detailed per-item rows below show the raw inputs anyway. */
const FORMULA_TEXT: Record<string, string> = {
  weighted:
    'Pour chaque compétence attendue : on compare le niveau du candidat au niveau attendu. Les compétences « requis » comptent le double des « apprécié ». Le score est la moyenne pondérée, exprimée en pourcentage du niveau attendu.',
  'category-average':
    'Aucune compétence précise n’est définie sur ce poste — on compare le candidat aux grandes catégories du rôle. Pour chaque catégorie : moyenne des notes du candidat ÷ 5 × 100 %. Score final = moyenne de ces pourcentages.',
  equipe:
    'Catégorie par catégorie : si le candidat est au niveau ou au-dessus de la moyenne équipe, il comble un écart (bonus). S’il est en-dessous, malus de 20 %. Le score final combine les deux.',
  soft:
    'Moyenne pondérée des 3 dimensions Âboro : collaboration 40 %, adaptabilité 30 %, leadership 30 %, ramenée sur 100.',
}

export default function CompatBreakdownDialog({ open, onClose, candidatureId, metric }: CompatBreakdownDialogProps) {
  const [data, setData] = useState<Breakdown | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Reset + fetch when the dialog opens or (candidatureId, metric) changes.
    // Intentionally calling setState in the effect: we need the loading/null
    // state synced with the new fetch cycle. The eslint rule is conservative;
    // this is the "subscribe + reflect external state" pattern it's meant to
    // allow. Rule-disable with context where the rule still applies.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <DialogContent className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>{METRIC_TITLES[metric]}</span>
            {data && <Badge className="text-base">{data.total}%</Badge>}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {data && metric === 'poste' && FORMULA_TEXT[(data as PosteBreakdown).formula]}
            {data && metric === 'equipe' && FORMULA_TEXT.equipe}
            {data && metric === 'soft' && FORMULA_TEXT.soft}
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
  // Bar width = fulfillmentPct (0-100% of target). Previously we used
  // contribution-relative-to-max which made the top contributor visually
  // full even if it was at 29%. Label + bar now tell the same story.
  // In category-average fallback, weight is always 1 so the Requis/
  // Apprécié distinction is meaningless — suppress the badge.
  const isFallback = data.formula === 'category-average'

  // Sort: 100% first (top of list), then descending fulfillment. Within
  // ties, Requis-weighted items come ahead of Apprécié so the "what
  // matters most for the poste" narrative stays readable. Recruiter
  // feedback: "afficher les 100% en haut et les moins bien notés de
  // plus en plus bas".
  const sorted = data.items.slice().sort((a, b) => {
    const fa = a.fulfillmentPct ?? (a.targetLevel > 0 ? Math.min(100, (a.candidateLevel / a.targetLevel) * 100) : 0)
    const fb = b.fulfillmentPct ?? (b.targetLevel > 0 ? Math.min(100, (b.candidateLevel / b.targetLevel) * 100) : 0)
    if (fb !== fa) return fb - fa
    return (b.weight ?? 1) - (a.weight ?? 1)
  })

  return (
    <div className="space-y-1.5 min-w-0">
      {sorted.map((item, i) => {
        const label = item.skillLabel ?? item.categoryLabel ?? '?'
        const fulfillment = item.fulfillmentPct
          ?? (item.targetLevel > 0 ? Math.min(100, (item.candidateLevel / item.targetLevel) * 100) : 0)
        // Over-fulfilled (candidate above target) caps at 100% but the
        // raw delta is recruiter-relevant: "+1 above bar" reads cleaner
        // than "4/3" which looks like a broken fraction.
        const overshoot = item.candidateLevel > item.targetLevel
          ? item.candidateLevel - item.targetLevel
          : 0
        const barColor = fulfillment >= 100
          ? 'bg-emerald-500'
          : fulfillment >= 60 ? 'bg-amber-500' : 'bg-rose-500'
        const badge = !isFallback && item.weight === 2
          ? <Badge variant="outline" className="text-[9px] py-0 px-1 border-primary/40 bg-primary/10 text-primary shrink-0">Requis</Badge>
          : !isFallback && item.weight === 1
            ? <Badge variant="outline" className="text-[9px] py-0 px-1 text-muted-foreground shrink-0">Apprécié</Badge>
            : null
        return (
          <div key={`${label}-${i}`} className="space-y-1 min-w-0">
            <div className="flex items-center justify-between text-xs gap-2 min-w-0">
              {/* Label + badge group — min-w-0 lets the flex actually
                  shrink the truncation span. Badge stays visible
                  (shrink-0) while the label ellipsises. */}
              <span className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="truncate font-medium min-w-0">{label}</span>
                {badge}
              </span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                Candidat {item.candidateLevel} · Requis {item.targetLevel}
                {overshoot > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · +{overshoot}</span>}
                <span className="ml-1.5 font-medium text-foreground">{Math.round(fulfillment)}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded bg-muted overflow-hidden">
              <div
                className={`h-full ${barColor}`}
                style={{ width: `${Math.max(0, Math.min(100, fulfillment))}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EquipeBreakdownView({ data }: { data: EquipeBreakdown }) {
  if (data.items.length === 0 && (!data.gapAnalysis || data.gapAnalysis.length === 0) && (!data.bonusSkills || data.bonusSkills.length === 0)) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Aucune catégorie à comparer.</p>
  }
  const bonusByCategory = new Map<string, BonusSkillEntry[]>()
  for (const b of data.bonusSkills ?? []) {
    const list = bonusByCategory.get(b.categoryLabel) ?? []
    list.push(b)
    bonusByCategory.set(b.categoryLabel, list)
  }

  // Merge per-category direction (from data.items) with gap numbers
  // (from data.gapAnalysis). The previous design rendered these as TWO
  // separate sections — same categories, different angles — so the
  // recruiter had to mentally join them. Now: one row per category, a
  // dual-marker bar (candidate filled bar + team marker line + numeric
  // gap), plus a directional badge derived from the gap sign so the
  // verdict is obvious at a glance.
  const directionByCategory = new Map<string, EquipeItem['direction']>()
  for (const it of data.items) directionByCategory.set(it.categoryId, it.direction)
  // v4.6.1: sort BEST → WORST (recruiter wants the strong areas at the
  // top, the weak ones at the bottom — same convention as the poste
  // breakdown).
  // Direction also handles the "everyone is at 0" edge case: when
  // BOTH candidate and team levels are 0, the gap is 0 but it isn't
  // a "fills_gap" — neither side has the skill. Tag it as 'matches'
  // (which renders as "Au niveau de l'équipe") so the row doesn't
  // misleadingly read "Comble un gap" with a +0.0.
  const merged = (data.gapAnalysis ?? [])
    .slice()
    .sort((a, b) => b.gap - a.gap)
    .map(g => {
      const directionFromAPI = directionByCategory.get(g.categoryId)
      const bothZero = g.candidateAvg === 0 && g.teamAvg === 0
      const direction: EquipeItem['direction'] = bothZero
        ? 'matches'
        : directionFromAPI ?? (g.gap > 0.2 ? 'fills_gap' : g.gap < -0.2 ? 'below_team' : 'matches')
      return { ...g, direction }
    })

  return (
    <div className="space-y-4 min-w-0">
      {merged.length > 0 ? (
        <div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Pour chaque catégorie&nbsp;: la barre montre le niveau du candidat (couleur), la ligne verticale montre la moyenne de l'équipe.
            L'écart à droite indique de combien le candidat est au-dessus (+) ou en-dessous (−) de l'équipe.
          </p>
          <ul className="space-y-3 min-w-0">
            {merged.map(g => (
              <DualMarkerRow
                key={g.categoryId}
                label={g.categoryLabel}
                candidate={g.candidateAvg}
                team={g.teamAvg}
                gap={g.gap}
                direction={g.direction}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {bonusByCategory.size > 0 ? (
        <div className="min-w-0">
          <h4 className="text-xs font-medium uppercase text-muted-foreground mb-2">Compétences bonus (hors poste)</h4>
          <div className="space-y-1.5 min-w-0">
            {Array.from(bonusByCategory.entries()).map(([catLabel, skills]) => (
              <div key={catLabel} className="rounded border p-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">{catLabel}</div>
                <div className="flex flex-wrap gap-1">
                  {skills.map(s => (
                    <Badge key={s.skillId} variant="outline" className="text-[10px] tabular-nums">
                      {s.skillLabel} · L{s.score}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(data.promptVersion || data.model) ? (
        <div className="pt-2 text-[11px] text-muted-foreground border-t flex items-center justify-between">
          <span>Extraction : {data.model ?? 'inconnu'}</span>
          {data.promptVersion ? <span>Prompt v{data.promptVersion}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Single row of the team breakdown: category label on top, dual-marker bar
 * (candidate fill + team marker line) in the middle, gap badge on the right,
 * fine-print numeric values underneath. The visual + the numeric tell the
 * same story so a recruiter can pick up the gap at a glance and verify the
 * exact figures one beat later.
 *
 * Scale: 0–5 (everywhere the rating system uses 0–5). The bar is rendered
 * as a percentage of 5 to keep it independent of fixed pixel widths.
 */
function DualMarkerRow({
  label, candidate, team, gap, direction,
}: {
  label: string
  candidate: number
  team: number
  gap: number
  direction: EquipeItem['direction']
}) {
  const max = 5
  const candPct = Math.max(0, Math.min(100, (candidate / max) * 100))
  const teamPct = Math.max(0, Math.min(100, (team / max) * 100))
  // v4.6.1: when both candidate AND team are at zero, the gap is 0 by
  // arithmetic but the right human story is "neither side has this
  // skill" — not a "match", not a "gap to fill". Surface that
  // explicitly so the recruiter doesn't misread the row.
  const bothZero = candidate === 0 && team === 0
  const fillColor = gap > 0.2
    ? 'bg-emerald-500/70'
    : gap < -0.2 ? 'bg-amber-500/70' : 'bg-sky-500/60'
  const directionLabel = bothZero
    ? { text: 'Personne ne maîtrise', color: 'text-muted-foreground' }
    : direction === 'fills_gap'
      ? { text: 'Comble un gap', color: 'text-emerald-700 dark:text-emerald-400' }
      : direction === 'below_team'
        ? { text: 'Sous l\'équipe', color: 'text-amber-700 dark:text-amber-500' }
        : { text: 'Au niveau de l\'équipe', color: 'text-sky-700 dark:text-sky-400' }
  return (
    <li className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0 text-sm">
        <span className="font-medium truncate min-w-0">{label}</span>
        <span className={`shrink-0 text-xs ${directionLabel.color}`}>{directionLabel.text}</span>
      </div>
      <div
        className="relative h-2 rounded-full bg-muted overflow-hidden"
        role="img"
        aria-label={`Candidat ${candidate.toFixed(1)} sur 5, équipe ${team.toFixed(1)} sur 5, écart ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}`}
      >
        {/* Candidate fill — coloured by sign of gap so the recruiter
            picks up "above team" / "below team" peripherally without
            reading numbers. */}
        <div
          className={`absolute inset-y-0 left-0 ${fillColor}`}
          style={{ width: `${candPct}%` }}
        />
        {/* Team marker — a 2px vertical line on top of the fill so it's
            visible whether the candidate is above or below. */}
        <div
          className="absolute inset-y-[-2px] w-[2px] bg-foreground/70 dark:bg-foreground/85 pointer-events-none"
          style={{ left: `calc(${teamPct}% - 1px)` }}
          aria-hidden
        />
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
        <span>
          Candidat <span className="text-foreground font-medium">{candidate.toFixed(1)}/{max}</span>
          <span className="mx-2">·</span>
          Équipe <span className="text-foreground font-medium">{team.toFixed(1)}/{max}</span>
        </span>
        <span className={`font-mono font-medium ${gap > 0.2 ? 'text-emerald-600 dark:text-emerald-400' : gap < -0.2 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {gap >= 0 ? '+' : ''}{gap.toFixed(1)}
        </span>
      </div>
    </li>
  )
}

function SoftBreakdownView({ data }: { data: SoftBreakdown }) {
  return (
    <div className="space-y-3 min-w-0">
      <div className="space-y-2 min-w-0">
        {data.groups.map(g => (
          <div key={g.name} className="rounded-md border p-2.5 space-y-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 text-sm min-w-0">
              <span className="font-medium capitalize truncate min-w-0">{g.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground shrink-0">poids {g.weight} · {g.avg}/10</span>
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

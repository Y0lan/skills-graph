import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Sentence-format gap table. Replaces the bare 3-column Candidat/Équipe/Écart
 * display the user called out as incomprehensible. Reads as natural French
 * instead of a numeric matrix.
 *
 * Structure:
 *   - Top 3 "Renforts" (the candidate lifts the team's weaker areas)
 *   - Top 3 "À couvrir" (the team is stronger — something to probe at interview)
 *   - Full expandable list with one line per skill, same sentence format
 *
 * Designed to be neutral: the framing is "complements the team" / "team
 * leads here", not "candidate strength" / "candidate weakness" — a low
 * score where the team already excels is a non-issue, not a risk.
 */
export interface GapEntry {
  skill: string
  category: string
  candidateScore: number
  teamAvg: number
  gap: number
}

export interface GapSynthesisProps {
  /** Raw gap list (with possible null entries from the flatMap upstream). */
  gapAnalysis: (GapEntry | null)[]
}

const MIN_GAP_TO_SURFACE = 0.2

export default function GapSynthesis({ gapAnalysis }: GapSynthesisProps) {
  const { renforts, aCouvrir, full } = useMemo(() => {
    const valid = gapAnalysis.filter((g): g is GapEntry => g !== null && Number.isFinite(g.gap))
    const sorted = [...valid].sort((a, b) => b.gap - a.gap)
    const renforts = sorted.filter(g => g.gap > MIN_GAP_TO_SURFACE).slice(0, 3)
    const aCouvrir = [...sorted].reverse().filter(g => g.gap < -MIN_GAP_TO_SURFACE).slice(0, 3)
    return { renforts, aCouvrir, full: sorted }
  }, [gapAnalysis])

  if (full.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidat vs équipe</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Pas encore assez de données pour comparer le candidat à l'équipe.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Candidat vs équipe</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Comparaison par compétence: écart positif = le candidat relève le niveau de l'équipe sur ce point;
          écart négatif = l'équipe est déjà plus forte.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <GapColumn
            eyebrow="Renforts apportés"
            emptyCopy="Pas de point de renfort significatif."
            entries={renforts}
            tone="positive"
          />
          <GapColumn
            eyebrow="À couvrir à l'entretien"
            emptyCopy="L'équipe n'a pas de vrai gap sur ce candidat."
            entries={aCouvrir}
            tone="neutral"
          />
        </div>

        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
            <span className="group-open:hidden">Voir toutes les compétences ({full.length})</span>
            <span className="hidden group-open:inline">Replier</span>
          </summary>
          <ul className="mt-3 divide-y divide-border/60 text-sm">
            {full.map((g, i) => (
              <li key={`${g.skill}-${i}`} className="py-2 flex items-baseline gap-2">
                <span className="flex-1">
                  <span className="font-medium">{g.skill}</span>
                  <span className="text-muted-foreground"> — candidat {formatScoreFraction(g.candidateScore)}, équipe {formatScoreFraction(g.teamAvg)}</span>
                </span>
                <span className={`font-mono tabular-nums text-xs shrink-0 ${gapTone(g.gap)}`}>
                  {g.gap > 0 ? '+' : ''}{g.gap.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  )
}

function GapColumn({
  eyebrow, entries, emptyCopy, tone,
}: { eyebrow: string; entries: GapEntry[]; emptyCopy: string; tone: 'positive' | 'neutral' }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-2">{eyebrow}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{emptyCopy}</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(g => (
            <li key={g.skill} className="text-sm leading-snug">
              <span className="font-medium">{g.skill}</span>
              <span className="text-muted-foreground">
                {' '}— candidat {formatScoreFraction(g.candidateScore)}, équipe {formatScoreFraction(g.teamAvg)}
              </span>
              <span className={`ml-2 text-xs font-mono tabular-nums ${tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {g.gap > 0 ? '+' : ''}{g.gap.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatScoreFraction(v: number): string {
  return `${v.toFixed(1)}/5`
}

function gapTone(v: number): string {
  if (v > MIN_GAP_TO_SURFACE) return 'text-emerald-600 dark:text-emerald-400'
  if (v < -MIN_GAP_TO_SURFACE) return 'text-amber-600 dark:text-amber-400'
  return 'text-muted-foreground'
}

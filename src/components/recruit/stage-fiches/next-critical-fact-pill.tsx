import { useEffect, useMemo, useState } from 'react'
import type { Statut } from '@/lib/constants'
import { fetchStageFicheData } from '@/lib/stage-fiches/client'
import { STAGE_FICHE_META } from '@/lib/stage-fiches/registry'
import {
  compareToNow,
  formatFicheDateTimeShort,
  formatFicheDate,
  parseFicheDateTime,
} from '@/lib/stage-fiches/datetime'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The "next critical fact" pill rendered in the candidature header.
 *
 * Rule (priority order):
 *   1. entretien_1 / entretien_2 / aboro → upcoming `scheduledAt`
 *   2. proposition                       → `responseDeadline`
 *   3. embauche                          → `arrivalDateInNc`
 *
 * Tints by proximity:
 *   <1h   rose pulse
 *   <24h  amber
 *   <distant  muted
 *   past  hidden (we don't surface stale facts)
 *
 * Stays silent (returns null) when the current stage has no upstream
 * field defined or when the field is empty / past. The header is busy
 * — show only what the recruiter can act on right now.
 */

interface PillFact {
  label: string
  dateRaw: string
  proximity: 'imminent' | 'soon' | 'distant'
  actionLabel?: string
  actionHref?: string
}

export interface NextCriticalFactPillProps {
  candidatureId: string
  statut: Statut
  /** Bump to force a refetch (workspace passes the SSE signal). */
  refetchSignal?: number
}

export function NextCriticalFactPill({ candidatureId, statut, refetchSignal }: NextCriticalFactPillProps) {
  const meta = STAGE_FICHE_META[statut]
  // Stages without an upstream date field never render a pill — short-circuit
  // before the effect / state machinery.
  if (!meta.upstreamDateField) return null

  return (
    <NextCriticalFactPillInner
      candidatureId={candidatureId}
      statut={statut}
      refetchSignal={refetchSignal}
    />
  )
}

function NextCriticalFactPillInner({ candidatureId, statut, refetchSignal }: NextCriticalFactPillProps) {
  const meta = STAGE_FICHE_META[statut]
  const [fact, setFact] = useState<PillFact | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetchStageFicheData(candidatureId, statut)
        if (cancelled) return
        const dateRaw = r.data[meta.upstreamDateField as string] as string | undefined
        if (!dateRaw) { setFact(null); return }
        const proximity = compareToNow(dateRaw)
        if (!proximity || proximity === 'past') { setFact(null); return }
        const actionField = meta.upstreamActionField
        const actionHref = actionField ? (r.data[actionField] as string | undefined) : undefined
        const isDateOnly = meta.upstreamDateField === 'responseDeadline' || meta.upstreamDateField === 'arrivalDateInNc'
        const formatted = isDateOnly ? formatFicheDate(dateRaw) : formatFicheDateTimeShort(dateRaw)
        let label: string
        switch (statut) {
          case 'entretien_1': label = `Entretien 1 · ${formatted}`; break
          case 'entretien_2': label = `Entretien 2 · ${formatted}`; break
          case 'aboro':       label = `Test Âboro · ${formatted}`; break
          case 'proposition': label = `Réponse attendue le ${formatted}`; break
          case 'embauche':    label = `Arrivée prévue le ${formatted}`; break
          default:            label = formatted
        }
        setFact({
          label,
          dateRaw,
          proximity,
          actionLabel: meta.upstreamActionLabel ?? undefined,
          actionHref,
        })
      } catch {
        if (!cancelled) setFact(null)
      }
    })()
    return () => { cancelled = true }
  }, [candidatureId, statut, meta, refetchSignal])

  const tone = useMemo(() => {
    if (!fact) return ''
    switch (fact.proximity) {
      case 'imminent': return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30 animate-pulse'
      case 'soon':     return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
      case 'distant':  return 'bg-muted/40 text-muted-foreground ring-1 ring-border'
    }
  }, [fact])

  if (!fact) return null
  // Sanity check parse; if the stored shape was bad we already returned null.
  if (!parseFicheDateTime(fact.dateRaw)) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 h-7 max-w-[28ch] tabular-nums',
        'text-[12px] font-medium leading-none whitespace-nowrap',
        tone,
      )}
      title={fact.label}
    >
      <span className="truncate">{fact.label}</span>
      {fact.actionLabel && fact.actionHref ? (
        <a
          href={fact.actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] hover:underline shrink-0"
        >
          {fact.actionLabel} <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </span>
  )
}

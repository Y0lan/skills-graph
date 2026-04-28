import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FicheShell, FicheField } from './fiche-shell'
import { propositionFicheSchema } from '@/lib/stage-fiches/schemas'
import { buildFichePatch, formatXpf, shallowFicheEqual } from './_fiche-helpers'

/**
 * Proposition fiche: the offer details. Salaire proposé vs grille
 * standard is the highest-signal field — it answers "did we negotiate
 * well?" at a glance via the inline diff chip.
 *
 * Currency: XPF (CFP franc, Sinapse is in Nouvelle-Calédonie). XPF has
 * no decimal subdivision, so all amounts are integers.
 */

export interface PropositionFicheValues {
  salaryProposedAnnualXpf?: number
  salaryStandardAnnualXpf?: number
  bonusVariableAnnualXpf?: number
  benefitsMd?: string
  conditionsMd?: string
  responseDeadline?: string
}

export interface PropositionFicheProps {
  eyebrow: string
  title: string
  data: PropositionFicheValues
  metaLine?: string | null
  draftBanner?: React.ReactNode
  onSave: (patch: Record<string, unknown>) => Promise<void> | void
  onLocalChange?: (next: PropositionFicheValues) => void
}

function salaryDiffChip(proposed?: number, standard?: number): React.ReactNode | null {
  if (proposed == null || standard == null || standard === 0) return null
  const delta = ((proposed - standard) / standard) * 100
  const rounded = Math.round(delta * 10) / 10
  if (rounded === 0) {
    return <span className="ml-2 inline-flex items-center rounded-full bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">alignée</span>
  }
  if (rounded > 0) {
    return <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">+{rounded.toLocaleString('fr-FR')}&nbsp;%</span>
  }
  return <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">{rounded.toLocaleString('fr-FR')}&nbsp;%</span>
}

export function PropositionFiche({
  eyebrow, title, data, metaLine, draftBanner, onSave, onLocalChange,
}: PropositionFicheProps) {
  const [draft, setDraft] = useState<PropositionFicheValues>(data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setDraft(data) }, [data])

  const isDirty = useMemo(
    () => !shallowFicheEqual(draft as Record<string, unknown>, data as Record<string, unknown>),
    [draft, data],
  )

  function update<K extends keyof PropositionFicheValues>(key: K, value: PropositionFicheValues[K] | undefined) {
    setDraft(d => {
      const next: PropositionFicheValues = { ...d }
      if (value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value))) {
        delete next[key]
      } else {
        next[key] = value
      }
      onLocalChange?.(next)
      return next
    })
  }

  async function handleSave() {
    const parsed = propositionFicheSchema.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Données invalides')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const patch = buildFichePatch(data as Record<string, unknown>, draft as Record<string, unknown>)
      if (Object.keys(patch).length === 0) { setSaving(false); return }
      await onSave(patch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDraft(data)
    setError(null)
  }

  const isEmpty = Object.keys(draft).length === 0

  return (
    <FicheShell
      eyebrow={eyebrow}
      title={title}
      isDirty={isDirty}
      isSaving={saving}
      errorMessage={error}
      metaLine={metaLine}
      banner={draftBanner}
      onSave={handleSave}
      onCancel={handleCancel}
      emptyHint={isEmpty ? 'Saisis le salaire proposé, la grille standard et la date butoir de réponse.' : undefined}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FicheField label="Salaire proposé (XPF/an)" isEmpty={draft.salaryProposedAnnualXpf == null}>
          <Input
            type="number"
            min={0}
            step={100000}
            value={draft.salaryProposedAnnualXpf ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('salaryProposedAnnualXpf', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="7 200 000"
            className="h-8 text-sm tabular-nums"
          />
          {draft.salaryProposedAnnualXpf != null && (
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{formatXpf(draft.salaryProposedAnnualXpf)}{salaryDiffChip(draft.salaryProposedAnnualXpf, draft.salaryStandardAnnualXpf)}</p>
          )}
        </FicheField>

        <FicheField label="Grille standard (XPF/an)" isEmpty={draft.salaryStandardAnnualXpf == null} hint="Salaire de référence du poste pour comparaison">
          <Input
            type="number"
            min={0}
            step={100000}
            value={draft.salaryStandardAnnualXpf ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('salaryStandardAnnualXpf', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="6 800 000"
            className="h-8 text-sm tabular-nums"
          />
        </FicheField>

        <FicheField label="Variable / bonus (XPF/an)" isEmpty={draft.bonusVariableAnnualXpf == null}>
          <Input
            type="number"
            min={0}
            step={50000}
            value={draft.bonusVariableAnnualXpf ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('bonusVariableAnnualXpf', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="500 000"
            className="h-8 text-sm tabular-nums"
          />
        </FicheField>

        <FicheField label="Réponse attendue avant" isEmpty={!draft.responseDeadline} hint="Date butoir; alimente le rappel automatique 24h avant">
          <Input
            type="date"
            value={draft.responseDeadline ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('responseDeadline', e.target.value || undefined)}
            className="h-8 text-sm"
          />
        </FicheField>

        <FicheField label="Avantages (markdown)" isEmpty={!draft.benefitsMd} className="sm:col-span-2">
          <Textarea
            value={draft.benefitsMd ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('benefitsMd', e.target.value || undefined)}
            rows={3}
            maxLength={4000}
            placeholder="- Voiture de fonction&#10;- Mutuelle famille&#10;- Logement les 3 premiers mois"
            className="text-sm resize-y"
          />
        </FicheField>

        <FicheField label="Conditions / clauses (markdown)" isEmpty={!draft.conditionsMd} className="sm:col-span-2">
          <Textarea
            value={draft.conditionsMd ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('conditionsMd', e.target.value || undefined)}
            rows={3}
            maxLength={4000}
            placeholder="- Période d'essai 4 mois&#10;- Clause de non-concurrence 12 mois&#10;- Engagement minimum 24 mois"
            className="text-sm resize-y"
          />
        </FicheField>
      </div>
    </FicheShell>
  )
}

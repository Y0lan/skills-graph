import { useEffect, useMemo, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FicheShell, FicheField } from './fiche-shell'
import { refuseFicheSchema } from '@/lib/stage-fiches/schemas'
import { buildFichePatch, shallowFicheEqual } from './_fiche-helpers'

/**
 * Refuse fiche: why the candidate didn't make it. The 6-month-test
 * scenario ("dans 6 mois un candidat me rappelle, on l'avait dit
 * non parce que…") needs the reason categorised + detailed.
 */

export interface RefuseFicheValues {
  reason?: 'competences' | 'budget' | 'timing' | 'fit' | 'concurrence' | 'desistement_candidat' | 'autre'
  reasonDetails?: string
  feedbackSent?: boolean
}

export interface RefuseFicheProps {
  eyebrow: string
  title: string
  data: RefuseFicheValues
  metaLine?: string | null
  draftBanner?: React.ReactNode
  onSave: (patch: Record<string, unknown>) => Promise<void> | void
  onLocalChange?: (next: RefuseFicheValues) => void
}

const REASON_LABELS: Record<NonNullable<RefuseFicheValues['reason']>, string> = {
  competences: 'Compétences insuffisantes',
  budget: 'Budget — salaire trop élevé',
  timing: 'Timing / disponibilité',
  fit: 'Fit équipe / culturel',
  concurrence: 'Choisi un concurrent',
  desistement_candidat: 'Désistement du candidat',
  autre: 'Autre',
}

export function RefuseFiche({
  eyebrow, title, data, metaLine, draftBanner, onSave, onLocalChange,
}: RefuseFicheProps) {
  const [draft, setDraft] = useState<RefuseFicheValues>(data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setDraft(data) }, [data])

  const isDirty = useMemo(
    () => !shallowFicheEqual(draft as Record<string, unknown>, data as Record<string, unknown>),
    [draft, data],
  )

  function update<K extends keyof RefuseFicheValues>(key: K, value: RefuseFicheValues[K] | undefined) {
    setDraft(d => {
      const next: RefuseFicheValues = { ...d }
      if (value === undefined || value === '') delete next[key]
      else next[key] = value
      onLocalChange?.(next)
      return next
    })
  }

  async function handleSave() {
    const parsed = refuseFicheSchema.safeParse(draft)
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

  function handleCancel() { setDraft(data); setError(null) }

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
      emptyHint={isEmpty ? 'Catégorise la raison du refus pour un suivi clair dans 6 mois.' : undefined}
    >
      <div className="grid grid-cols-1 gap-3">
        <FicheField label="Motif principal" isEmpty={!draft.reason}>
          <Select value={draft.reason ?? ''} onValueChange={(v) => update('reason', (v || undefined) as RefuseFicheValues['reason'])}>
            <SelectTrigger size="sm" className="h-8 w-full text-sm">
              <SelectValue placeholder="Choisir le motif…" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(REASON_LABELS) as Array<keyof typeof REASON_LABELS>).map(key => (
                <SelectItem key={key} value={key}>{REASON_LABELS[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FicheField>

        <FicheField label="Détails (markdown)" isEmpty={!draft.reasonDetails} hint="Ce que tu voudrais te rappeler dans 6 mois si le candidat te recontacte.">
          <Textarea
            value={draft.reasonDetails ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('reasonDetails', e.target.value || undefined)}
            rows={3}
            maxLength={2000}
            placeholder="Manquait expérience IBM i récente. À recontacter quand on aura un poste plus junior."
            className="text-sm resize-y"
          />
        </FicheField>

        <FicheField label="Email de retour envoyé" isEmpty={draft.feedbackSent == null}>
          <div className="flex items-center gap-3 h-8 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="feedbackSent"
                checked={draft.feedbackSent === true}
                onChange={() => update('feedbackSent', true)}
              />
              Oui
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="feedbackSent"
                checked={draft.feedbackSent === false}
                onChange={() => update('feedbackSent', false)}
              />
              Non / pas encore
            </label>
          </div>
        </FicheField>
      </div>
    </FicheShell>
  )
}

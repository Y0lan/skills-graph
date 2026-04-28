import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FicheShell, FicheField } from './fiche-shell'
import { embaucheFicheSchema } from '@/lib/stage-fiches/schemas'
import { buildFichePatch, shallowFicheEqual } from './_fiche-helpers'

/**
 * Embauche fiche: hire-side details. The recruiter cares most about
 * `arrivalDateInNc` (when does the candidate physically show up in
 * Nouméa?) — fed into the upstream pill in the candidature header.
 */

export interface EmbaucheFicheValues {
  startDate?: string
  originCity?: string
  requiresRelocation?: boolean
  arrivalDateInNc?: string
  residencyStatus?: 'citoyen_nc' | 'metropole' | 'etranger_visa' | 'autre'
  onboardingNotesMd?: string
}

export interface EmbaucheFicheProps {
  eyebrow: string
  title: string
  data: EmbaucheFicheValues
  metaLine?: string | null
  draftBanner?: React.ReactNode
  onSave: (patch: Record<string, unknown>) => Promise<void> | void
  onLocalChange?: (next: EmbaucheFicheValues) => void
}

export function EmbaucheFiche({
  eyebrow, title, data, metaLine, draftBanner, onSave, onLocalChange,
}: EmbaucheFicheProps) {
  const [draft, setDraft] = useState<EmbaucheFicheValues>(data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setDraft(data) }, [data])

  const isDirty = useMemo(
    () => !shallowFicheEqual(draft as Record<string, unknown>, data as Record<string, unknown>),
    [draft, data],
  )

  function update<K extends keyof EmbaucheFicheValues>(key: K, value: EmbaucheFicheValues[K] | undefined) {
    setDraft(d => {
      const next: EmbaucheFicheValues = { ...d }
      if (value === undefined || value === '') delete next[key]
      else next[key] = value
      onLocalChange?.(next)
      return next
    })
  }

  async function handleSave() {
    const parsed = embaucheFicheSchema.safeParse(draft)
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
  const showRelocation = draft.requiresRelocation === true

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
      emptyHint={isEmpty ? 'Date de prise de poste, ville d\'origine, statut résidence — l\'arrivée en NC alimente le rappel automatique.' : undefined}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FicheField label="Date de prise de poste" isEmpty={!draft.startDate}>
          <Input
            type="date"
            value={draft.startDate ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('startDate', e.target.value || undefined)}
            className="h-8 text-sm"
          />
        </FicheField>

        <FicheField label="Statut de résidence" isEmpty={!draft.residencyStatus}>
          <Select value={draft.residencyStatus ?? ''} onValueChange={(v) => update('residencyStatus', (v || undefined) as EmbaucheFicheValues['residencyStatus'])}>
            <SelectTrigger size="sm" className="h-8 w-full text-sm">
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="citoyen_nc">Citoyen NC</SelectItem>
              <SelectItem value="metropole">Métropole</SelectItem>
              <SelectItem value="etranger_visa">Étranger avec visa</SelectItem>
              <SelectItem value="autre">Autre</SelectItem>
            </SelectContent>
          </Select>
        </FicheField>

        <FicheField label="Ville d'origine" isEmpty={!draft.originCity}>
          <Input
            type="text"
            value={draft.originCity ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('originCity', e.target.value || undefined)}
            placeholder="Paris, Lyon, déjà à Nouméa…"
            maxLength={120}
            className="h-8 text-sm"
          />
        </FicheField>

        <FicheField label="Déménagement nécessaire" isEmpty={draft.requiresRelocation == null}>
          <div className="flex items-center gap-3 h-8 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="requiresRelocation"
                checked={draft.requiresRelocation === true}
                onChange={() => update('requiresRelocation', true)}
              />
              Oui
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="requiresRelocation"
                checked={draft.requiresRelocation === false}
                onChange={() => update('requiresRelocation', false)}
              />
              Non (déjà sur place)
            </label>
          </div>
        </FicheField>

        {showRelocation && (
          <FicheField label="Arrivée prévue en NC" isEmpty={!draft.arrivalDateInNc} hint="Alimente le rappel automatique J-1 dans le digest" className="sm:col-span-2">
            <Input
              type="date"
              value={draft.arrivalDateInNc ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('arrivalDateInNc', e.target.value || undefined)}
              className="h-8 text-sm"
            />
          </FicheField>
        )}

        <FicheField label="Notes onboarding (markdown)" isEmpty={!draft.onboardingNotesMd} className="sm:col-span-2">
          <Textarea
            value={draft.onboardingNotesMd ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('onboardingNotesMd', e.target.value || undefined)}
            rows={3}
            maxLength={4000}
            placeholder="Buddy assigné, parcours d'accueil, équipement à préparer…"
            className="text-sm resize-y"
          />
        </FicheField>
      </div>
    </FicheShell>
  )
}

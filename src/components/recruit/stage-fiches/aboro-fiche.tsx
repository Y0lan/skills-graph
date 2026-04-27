import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExternalLink } from 'lucide-react'
import { FicheShell, FicheField } from './fiche-shell'
import { VerdictPill, type Verdict } from './verdict-pill'
import { aboroFicheSchema } from '@/lib/stage-fiches/schemas'
import { fromInputDateTimeLocal, toInputDateTimeLocal } from '@/lib/stage-fiches/datetime'

export interface AboroFicheValues {
  scheduledAt?: string
  mode?: 'visio' | 'presentiel'
  meetLink?: string
  location?: string
  resultPdfUrl?: string
  resultSummary?: string
  recommendation?: 'compatible' | 'reserve' | 'non_compatible'
}

export interface AboroFicheProps {
  eyebrow: string
  title: string
  data: AboroFicheValues
  metaLine?: string | null
  draftBanner?: React.ReactNode
  onSave: (next: AboroFicheValues) => Promise<void> | void
  onLocalChange?: (next: AboroFicheValues) => void
}

export function AboroFiche({
  eyebrow,
  title,
  data,
  metaLine,
  draftBanner,
  onSave,
  onLocalChange,
}: AboroFicheProps) {
  const [draft, setDraft] = useState<AboroFicheValues>(data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setDraft(data) }, [data])

  const isDirty = useMemo(() => !shallowEq(draft, data), [draft, data])

  function update<K extends keyof AboroFicheValues>(key: K, value: AboroFicheValues[K] | undefined) {
    setDraft(d => {
      const next: AboroFicheValues = { ...d }
      if (value === undefined || value === '') delete next[key]
      else next[key] = value
      onLocalChange?.(next)
      return next
    })
  }

  async function handleSave() {
    const parsed = aboroFicheSchema.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Données invalides')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      const allKeys = new Set([...Object.keys(draft), ...Object.keys(data)]) as Set<keyof AboroFicheValues>
      for (const k of allKeys) {
        const a = data[k]
        const b = draft[k]
        if (Object.is(a, b)) continue
        if (b === undefined) patch[k] = null
        else patch[k] = b
      }
      if (Object.keys(patch).length === 0) {
        setSaving(false)
        return
      }
      await onSave(patch as AboroFicheValues)
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

  const pdf = draft.resultPdfUrl?.trim()
  const meet = draft.meetLink?.trim()
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
      emptyHint={isEmpty ? 'Quand le test sera planifié ou reçu, ajoute la date, le lien du rapport et ta recommandation.' : undefined}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FicheField label="Date & heure (Nouméa)" isEmpty={!draft.scheduledAt}>
          <Input
            type="datetime-local"
            value={toInputDateTimeLocal(draft.scheduledAt)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('scheduledAt', fromInputDateTimeLocal(e.target.value) || undefined)}
            className="h-8 text-sm tabular-nums"
          />
        </FicheField>

        <FicheField label="Mode" isEmpty={!draft.mode}>
          <Select value={draft.mode ?? ''} onValueChange={(v) => update('mode', (v || undefined) as AboroFicheValues['mode'])}>
            <SelectTrigger size="sm" className="h-8 w-full text-sm">
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visio">Visio</SelectItem>
              <SelectItem value="presentiel">Présentiel</SelectItem>
            </SelectContent>
          </Select>
        </FicheField>

        <FicheField
          label="Lien Meet"
          isEmpty={!draft.meetLink && draft.mode === 'visio'}
          action={
            meet ? (
              <a
                href={meet}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-primary hover:underline"
              >
                Ouvrir <ExternalLink className="h-3 w-3" />
              </a>
            ) : undefined
          }
        >
          <Input
            type="url"
            value={draft.meetLink ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('meetLink', e.target.value || undefined)}
            placeholder="https://meet.google.com/…"
            className="h-8 text-sm"
          />
        </FicheField>

        <FicheField label="Lieu (présentiel)" isEmpty={!draft.location && draft.mode === 'presentiel'}>
          <Input
            type="text"
            value={draft.location ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('location', e.target.value || undefined)}
            placeholder="Bureau Aboro · Nouméa"
            maxLength={200}
            className="h-8 text-sm"
          />
        </FicheField>

        <FicheField
          label="Lien du rapport PDF"
          isEmpty={!draft.resultPdfUrl}
          className="sm:col-span-2"
          action={
            pdf ? (
              <a
                href={pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-primary hover:underline"
              >
                Ouvrir <ExternalLink className="h-3 w-3" />
              </a>
            ) : undefined
          }
        >
          <Input
            type="url"
            value={draft.resultPdfUrl ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('resultPdfUrl', e.target.value || undefined)}
            placeholder="https://… (drive, gcs, …)"
            className="h-8 text-sm"
          />
        </FicheField>

        <FicheField label="Recommandation" isEmpty={!draft.recommendation}>
          <div className="flex items-center gap-2">
            <Select value={draft.recommendation ?? ''} onValueChange={(v) => update('recommendation', (v || undefined) as AboroFicheValues['recommendation'])}>
              <SelectTrigger size="sm" className="h-8 w-full text-sm">
                <SelectValue placeholder="Pas encore reçue…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compatible">Compatible</SelectItem>
                <SelectItem value="reserve">Réservé</SelectItem>
                <SelectItem value="non_compatible">Non compatible</SelectItem>
              </SelectContent>
            </Select>
            {draft.recommendation ? <VerdictPill value={draft.recommendation as Verdict} /> : null}
          </div>
        </FicheField>

        <FicheField label="Résumé du rapport" isEmpty={!draft.resultSummary} className="sm:col-span-2">
          <Textarea
            value={draft.resultSummary ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('resultSummary', e.target.value || undefined)}
            rows={3}
            maxLength={2000}
            placeholder="Points clés du rapport Aboro — ce qu'il faut retenir."
            className="text-sm resize-y"
          />
        </FicheField>
      </div>
    </FicheShell>
  )
}

function shallowEq(a: AboroFicheValues, b: AboroFicheValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof AboroFicheValues>
  for (const k of keys) {
    if (a[k] !== b[k]) return false
  }
  return true
}

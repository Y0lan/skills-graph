import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExternalLink, Mail } from 'lucide-react'
import { FicheShell, FicheField } from './fiche-shell'
import { VerdictPill, type Verdict } from './verdict-pill'
import { entretienFicheSchema } from '@/lib/stage-fiches/schemas'
import { fromInputDateTimeLocal, toInputDateTimeLocal } from '@/lib/stage-fiches/datetime'

/**
 * Entretien 1 / Entretien 2 fiche.
 *
 * Soft-required fields are marked with a small star but never block save.
 * Per Y3: when the recruiter wants the upstream pill to surface this
 * interview, `scheduledAt` becomes hard-required (we surface that as a
 * red `*` and prevent save with an empty scheduledAt + a non-empty
 * other field). For now: pure soft-required.
 */

export interface EntretienFicheValues {
  scheduledAt?: string
  mode?: 'visio' | 'presentiel' | 'telephone'
  meetLink?: string
  location?: string
  durationMin?: number
  interviewers?: string[]
  conclusion?: 'go' | 'caution' | 'no_go'
  summary?: string
}

export interface EntretienFicheProps {
  eyebrow: string
  title: string
  data: EntretienFicheValues
  metaLine?: string | null
  draftBanner?: React.ReactNode
  onSave: (next: EntretienFicheValues) => Promise<void> | void
  onLocalChange?: (next: EntretienFicheValues) => void
}

export function EntretienFiche({
  eyebrow,
  title,
  data,
  metaLine,
  draftBanner,
  onSave,
  onLocalChange,
}: EntretienFicheProps) {
  const [draft, setDraft] = useState<EntretienFicheValues>(data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed from props when the workspace switches candidatures or the
  // SSE refetch lands a fresh snapshot (matches the use-timeline-filter
  // pattern documented in src/hooks/use-timeline-filter.ts).
  useEffect(() => { setDraft(data) }, [data])

  const isDirty = useMemo(() => !shallowEq(draft, data), [draft, data])

  function update<K extends keyof EntretienFicheValues>(key: K, value: EntretienFicheValues[K] | undefined) {
    setDraft(d => {
      const next: EntretienFicheValues = { ...d }
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete next[key]
      } else {
        next[key] = value
      }
      onLocalChange?.(next)
      return next
    })
  }

  async function handleSave() {
    // Validate the merged shape locally first so a typo doesn't round-trip.
    const parsed = entretienFicheSchema.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Données invalides')
      return
    }
    setError(null)
    setSaving(true)
    try {
      // Build a "diff" that includes nulls for cleared fields so the
      // server can apply the explicit clear-via-null merge semantics.
      const patch: Record<string, unknown> = {}
      const allKeys = new Set([...Object.keys(draft), ...Object.keys(data)]) as Set<keyof EntretienFicheValues>
      for (const k of allKeys) {
        const a = data[k] as unknown
        const b = draft[k] as unknown
        if (Object.is(a, b)) continue
        if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])) continue
        if (b === undefined) patch[k] = null
        else patch[k] = b
      }
      if (Object.keys(patch).length === 0) {
        setSaving(false)
        return
      }
      await onSave(patch as EntretienFicheValues)
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
      emptyHint={isEmpty ? 'Ajoute la date, le lien Meet, ta conclusion — bref ou détaillé, comme tu préfères.' : undefined}
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
          <Select value={draft.mode ?? ''} onValueChange={(v) => update('mode', (v || undefined) as EntretienFicheValues['mode'])}>
            <SelectTrigger size="sm" className="h-8 w-full text-sm">
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visio">Visio</SelectItem>
              <SelectItem value="presentiel">Présentiel</SelectItem>
              <SelectItem value="telephone">Téléphone</SelectItem>
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
            placeholder="Bureau Sinapse · Salle Lagon"
            maxLength={200}
            className="h-8 text-sm"
          />
        </FicheField>

        <FicheField label="Durée (min)" isEmpty={!draft.durationMin}>
          <Input
            type="number"
            min={15}
            max={240}
            step={15}
            value={draft.durationMin ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('durationMin', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="60"
            className="h-8 text-sm tabular-nums"
          />
        </FicheField>

        <FicheField label="Conclusion" isEmpty={!draft.conclusion}>
          <div className="flex items-center gap-2">
            <Select value={draft.conclusion ?? ''} onValueChange={(v) => update('conclusion', (v || undefined) as EntretienFicheValues['conclusion'])}>
              <SelectTrigger size="sm" className="h-8 w-full text-sm">
                <SelectValue placeholder="Pas encore tranchée…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="go">Go</SelectItem>
                <SelectItem value="caution">À surveiller</SelectItem>
                <SelectItem value="no_go">No-go</SelectItem>
              </SelectContent>
            </Select>
            {draft.conclusion ? <VerdictPill value={draft.conclusion as Verdict} /> : null}
          </div>
        </FicheField>

        <FicheField
          label="Intervieweurs"
          isEmpty={!draft.interviewers || draft.interviewers.length === 0}
          className="sm:col-span-2"
        >
          <Input
            type="text"
            value={(draft.interviewers ?? []).join(', ')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              update('interviewers', list.length ? list.slice(0, 8) : undefined)
            }}
            placeholder="Guillaume B., Olivier F."
            className="h-8 text-sm"
          />
        </FicheField>

        <FicheField
          label="Résumé / compte-rendu"
          isEmpty={!draft.summary}
          className="sm:col-span-2"
        >
          <Textarea
            value={draft.summary ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('summary', e.target.value || undefined)}
            rows={4}
            maxLength={10_000}
            placeholder="Quelques lignes — points marquants, hésitations, prochaines étapes…"
            className="text-sm resize-y"
          />
        </FicheField>
      </div>

      {meet ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Mail className="h-3 w-3" />
          <span>Le lien Meet est aussi visible dans la pile en haut de la fiche du candidat.</span>
        </div>
      ) : null}
    </FicheShell>
  )
}

function shallowEq(a: EntretienFicheValues, b: EntretienFicheValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof EntretienFicheValues>
  for (const k of keys) {
    const va = a[k]
    const vb = b[k]
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length) return false
      if (va.some((v, i) => v !== vb[i])) return false
    } else if (va !== vb) {
      return false
    }
  }
  return true
}

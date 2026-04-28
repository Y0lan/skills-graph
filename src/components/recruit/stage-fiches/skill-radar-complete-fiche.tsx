import { useEffect, useMemo, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FicheShell, FicheField } from './fiche-shell'
import { VerdictPill, type Verdict } from './verdict-pill'
import { skillRadarCompleteFicheSchema } from '@/lib/stage-fiches/schemas'
import { buildFichePatch, shallowFicheEqual } from './_fiche-helpers'

/**
 * Skill Radar Complete fiche: the recruiter's bilan after the candidate
 * submitted their auto-evaluation. The radar itself + AI report live in
 * EvaluationDisclosure further down the workspace; this fiche is the
 * recruiter's own one-paragraph synthesis.
 */

export interface SkillRadarCompleteFicheValues {
  strengthsSummary?: string
  redFlags?: string
  goNoGo?: 'go' | 'caution' | 'no_go'
}

export interface SkillRadarCompleteFicheProps {
  eyebrow: string
  title: string
  data: SkillRadarCompleteFicheValues
  metaLine?: string | null
  draftBanner?: React.ReactNode
  onSave: (patch: Record<string, unknown>) => Promise<void> | void
  onLocalChange?: (next: SkillRadarCompleteFicheValues) => void
}

export function SkillRadarCompleteFiche({
  eyebrow, title, data, metaLine, draftBanner, onSave, onLocalChange,
}: SkillRadarCompleteFicheProps) {
  const [draft, setDraft] = useState<SkillRadarCompleteFicheValues>(data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setDraft(data) }, [data])

  const isDirty = useMemo(
    () => !shallowFicheEqual(draft as Record<string, unknown>, data as Record<string, unknown>),
    [draft, data],
  )

  function update<K extends keyof SkillRadarCompleteFicheValues>(key: K, value: SkillRadarCompleteFicheValues[K] | undefined) {
    setDraft(d => {
      const next: SkillRadarCompleteFicheValues = { ...d }
      if (value === undefined || value === '') delete next[key]
      else next[key] = value
      onLocalChange?.(next)
      return next
    })
  }

  async function handleSave() {
    const parsed = skillRadarCompleteFicheSchema.safeParse(draft)
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
      emptyHint={isEmpty ? 'Synthèse rapide du Skill Radar : forces, points de vigilance, verdict initial.' : undefined}
    >
      <div className="grid grid-cols-1 gap-3">
        <FicheField label="Forces (markdown)" isEmpty={!draft.strengthsSummary}>
          <Textarea
            value={draft.strengthsSummary ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('strengthsSummary', e.target.value || undefined)}
            rows={3}
            maxLength={2000}
            placeholder="Domaines techniques solides, soft skills marquants, expériences pertinentes…"
            className="text-sm resize-y"
          />
        </FicheField>

        <FicheField label="Points de vigilance (markdown)" isEmpty={!draft.redFlags}>
          <Textarea
            value={draft.redFlags ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('redFlags', e.target.value || undefined)}
            rows={3}
            maxLength={2000}
            placeholder="Lacunes à confirmer en entretien, contradictions CV/auto-éval…"
            className="text-sm resize-y"
          />
        </FicheField>

        <FicheField label="Verdict initial" isEmpty={!draft.goNoGo}>
          <div className="flex items-center gap-2">
            <Select value={draft.goNoGo ?? ''} onValueChange={(v) => update('goNoGo', (v || undefined) as SkillRadarCompleteFicheValues['goNoGo'])}>
              <SelectTrigger size="sm" className="h-8 w-full text-sm">
                <SelectValue placeholder="Pas encore décidé…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="go">Go — passer en entretien</SelectItem>
                <SelectItem value="caution">À surveiller</SelectItem>
                <SelectItem value="no_go">No-go — refuser</SelectItem>
              </SelectContent>
            </Select>
            {draft.goNoGo ? <VerdictPill value={draft.goNoGo as Verdict} /> : null}
          </div>
        </FicheField>
      </div>
    </FicheShell>
  )
}

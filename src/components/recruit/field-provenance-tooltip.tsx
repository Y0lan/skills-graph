import { Lock, Unlock, Info, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export interface ProfileField<T> {
  value: T | null
  runId: string | null
  sourceDoc: 'cv' | 'lettre' | 'merged' | 'human' | null
  confidence: number | null
  humanLockedAt: string | null
  humanLockedBy: string | null
}

export interface FieldProvenanceTooltipProps {
  candidateId: string
  fieldPath: string
  field: ProfileField<unknown>
  onChange: (next: ProfileField<unknown>) => void
  className?: string
}

/**
 * Inline info + lock button rendered next to a profile field value.
 *
 * Shows source/confidence/lock state in a tooltip. Clicking the lock
 * icon calls the candidate profile-lock endpoint and optimistically
 * updates local state. Server errors roll back and toast.
 */
export default function FieldProvenanceTooltip({
  candidateId,
  fieldPath,
  field,
  onChange,
  className,
}: FieldProvenanceTooltipProps) {
  const [busy, setBusy] = useState(false)
  const locked = !!field.humanLockedAt

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    const desired = !locked
    try {
      const res = await fetch(`/api/candidates/${candidateId}/profile-lock`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldPath, locked: desired }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      onChange({
        ...field,
        humanLockedAt: desired ? new Date().toISOString() : null,
        humanLockedBy: desired ? 'you' : null,
      })
      toast.success(desired ? 'Champ verrouillé' : 'Champ déverrouillé')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec')
    } finally {
      setBusy(false)
    }
  }

  const sourceLabel = field.sourceDoc === 'cv' ? 'CV' : field.sourceDoc === 'lettre' ? 'Lettre de motivation' : field.sourceDoc === 'human' ? 'Manuel' : 'Fusion'
  const confidencePct = field.confidence != null ? Math.round(field.confidence * 100) : null

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[260px] space-y-1">
          <div><span className="font-medium">Source :</span> {sourceLabel}</div>
          {confidencePct != null ? <div><span className="font-medium">Confiance :</span> {confidencePct}%</div> : null}
          {locked ? <div className="text-amber-600 dark:text-amber-400"><Lock className="inline h-3 w-3 mr-1" />Verrouillé par {field.humanLockedBy ?? 'un recruteur'}</div> : null}
        </TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggle}
        disabled={busy}
        className="h-5 w-5 p-0"
        title={locked ? 'Déverrouiller (les ré-extractions pourront écraser)' : 'Verrouiller (protège contre les ré-extractions)'}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : locked ? <Lock className="h-3 w-3 text-amber-600" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
      </Button>
    </span>
  )
}

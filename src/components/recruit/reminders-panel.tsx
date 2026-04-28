import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Bell, Plus, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatFicheDateTime, fromInputDateTimeLocal } from '@/lib/stage-fiches/datetime'
import { cn } from '@/lib/utils'
import { MarkdownNote } from '@/components/ui/markdown-note'

/**
 * Reminders panel for a single candidature.
 *
 * Shows pending + done reminders, lets the recruiter add new ones via
 * an inline composer. The daily-recap cron emails Guillaume a digest at
 * 08:00 NC of every reminder due in the next 24h plus auto-derived
 * alerts from candidature_stage_data.
 *
 * remind_at is stored as Pacific/Noumea wall-clock (YYYY-MM-DDTHH:mm).
 * The datetime helpers from v5.1 do all the TZ work.
 */

interface Reminder {
  id: number
  remindAt: string
  bodyMd: string
  isDone: boolean
  createdBy: string
  createdAt: string
  doneAt: string | null
}

export interface RemindersPanelProps {
  candidatureId: string
}

export default function RemindersPanel({ candidatureId }: RemindersPanelProps) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)
  const [composeAt, setComposeAt] = useState<string>('')
  const [composeBody, setComposeBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      const r = await fetch(
        `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/reminders`,
        { credentials: 'include' },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setReminders(await r.json() as Reminder[])
    } catch {
      // Silent — empty list is harmless. Toast on save errors only.
    } finally {
      setLoading(false)
    }
  }, [candidatureId])

  useEffect(() => { void refetch() }, [refetch])

  // Default the date input to "tomorrow at 09:00 Nouméa" when opening.
  // Use Intl with timeZone:'Pacific/Noumea' so a recruiter on a laptop
  // set to a different timezone still gets NC-tomorrow, not their
  // local-tomorrow (coderabbit minor).
  useEffect(() => {
    if (composing && !composeAt) {
      const tomorrowMs = Date.now() + 24 * 60 * 60 * 1000
      const noumeaDate = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Pacific/Noumea',
      }).format(new Date(tomorrowMs))
      // en-CA emits YYYY-MM-DD format directly, perfect for our wall-clock string.
      setComposeAt(`${noumeaDate}T09:00`)
    }
  }, [composing, composeAt])

  const submit = useCallback(async () => {
    const remindAt = fromInputDateTimeLocal(composeAt)
    if (!remindAt) {
      toast.error('Date de rappel requise')
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch(
        `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/reminders`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remindAt, bodyMd: composeBody.trim() }),
        },
      )
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`)
      setReminders(prev => [body as Reminder, ...prev])
      setComposing(false)
      setComposeAt('')
      setComposeBody('')
      toast.success('Rappel ajouté')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur — rappel non créé')
    } finally {
      setSubmitting(false)
    }
  }, [composeAt, composeBody, candidatureId])

  const toggleDone = useCallback(async (r: Reminder) => {
    try {
      const res = await fetch(
        `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/reminders/${r.id}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDone: !r.isDone }),
        },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated = await res.json() as Reminder
      setReminders(prev => prev.map(x => x.id === r.id ? updated : x))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }, [candidatureId])

  const remove = useCallback(async (r: Reminder) => {
    try {
      const res = await fetch(
        `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/reminders/${r.id}`,
        { method: 'DELETE', credentials: 'include' },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setReminders(prev => prev.filter(x => x.id !== r.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }, [candidatureId])

  const pending = reminders.filter(r => !r.isDone)
  const done = reminders.filter(r => r.isDone)

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 px-4 py-3 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Rappels
            {pending.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0 text-[10px] tabular-nums">
                {pending.length}
              </span>
            )}
          </h3>
        </div>
        {!composing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setComposing(true)}
          >
            <Plus className="h-3 w-3" />
            Me rappeler
          </Button>
        )}
      </header>

      {composing && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 space-y-2">
          <Input
            type="datetime-local"
            value={composeAt}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComposeAt(e.target.value)}
            className="h-8 text-sm tabular-nums"
            disabled={submitting}
          />
          <Textarea
            value={composeBody}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComposeBody(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Pourquoi te rappeler ? (markdown supporté, optionnel)"
            className="text-sm resize-y"
            disabled={submitting}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setComposing(false); setComposeAt(''); setComposeBody('') }}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={submitting || !composeAt}>
              {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
              Programmer
            </Button>
          </div>
        </div>
      )}

      {loading && reminders.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1 py-2">Chargement…</p>
      ) : pending.length === 0 && done.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1 py-2">
          Aucun rappel. La récap quotidienne envoyée le matin résume aussi tes entretiens prévus.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {pending.map(r => (
            <ReminderRow key={r.id} reminder={r} onToggleDone={toggleDone} onRemove={remove} />
          ))}
          {done.length > 0 && (
            <li className="pt-2 border-t border-border/60">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 mb-1.5">Faits ({done.length})</p>
              <ul className="space-y-1.5">
                {done.map(r => (
                  <ReminderRow key={r.id} reminder={r} onToggleDone={toggleDone} onRemove={remove} />
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function ReminderRow({
  reminder, onToggleDone, onRemove,
}: {
  reminder: Reminder
  onToggleDone: (r: Reminder) => void
  onRemove: (r: Reminder) => void
}) {
  return (
    <li className={cn(
      'flex items-start gap-2 rounded-md border px-3 py-2 text-sm group',
      reminder.isDone ? 'border-border/40 bg-muted/20 opacity-70' : 'border-border bg-background',
    )}>
      <button
        type="button"
        onClick={() => onToggleDone(reminder)}
        className={cn(
          'shrink-0 mt-0.5 h-4 w-4 rounded border flex items-center justify-center transition-colors',
          reminder.isDone
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
            : 'border-muted-foreground/40 hover:border-primary',
        )}
        aria-label={reminder.isDone ? 'Marquer comme non fait' : 'Marquer comme fait'}
      >
        {reminder.isDone ? <Check className="h-3 w-3" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[12px] tabular-nums', reminder.isDone && 'line-through text-muted-foreground')}>
          {formatFicheDateTime(reminder.remindAt)}
        </p>
        {reminder.bodyMd && (
          <div className="mt-0.5">
            <MarkdownNote content={reminder.bodyMd} variant="compact" className="text-muted-foreground" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(reminder)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        aria-label="Supprimer le rappel"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  )
}

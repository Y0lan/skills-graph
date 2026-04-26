import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/**
 * Accessible replacement for `window.confirm()`. Focus trap, ESC close,
 * ARIA labels and destructive styling come for free from shadcn-on-base-ui.
 * Callers keep a boolean of open state + onConfirm/onCancel handlers —
 * the component owns nothing beyond render.
 *
 * The previous page used native `confirm()` in three places (revert
 * transition, send-now, destructive file delete). Native confirm blocks
 * the event loop, can't be styled, and traps no focus — especially brittle
 * when the recruiter is mid-transition with a dialog already open.
 */
export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  title: string
  description?: string
  /** Extra content rendered above the action row — useful for "email has
   *  already been sent" warnings where the body is longer than a single
   *  sentence. */
  body?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** 'destructive' switches the confirm button to the rose variant; any
   *  other tone uses the default. */
  tone?: 'default' | 'destructive'
  onConfirm: () => void
  /** Disables the confirm button — useful when a request is inflight and
   *  the caller wants to keep the dialog open but block re-submit. */
  confirmDisabled?: boolean
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  body,
  confirmLabel,
  cancelLabel = 'Annuler',
  tone = 'default',
  onConfirm,
  confirmDisabled,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {body && <div className="py-2 text-sm">{body}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={tone === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

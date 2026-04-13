import { CheckCircle, Circle, PenLine } from 'lucide-react'

export type EvalStatus = 'none' | 'draft' | 'submitted'

export function StatusIcon({ status }: { status: EvalStatus }) {
  switch (status) {
    case 'submitted':
      return <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
    case 'draft':
      return <PenLine className="h-4 w-4 shrink-0 text-amber-500" />
    default:
      return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
  }
}

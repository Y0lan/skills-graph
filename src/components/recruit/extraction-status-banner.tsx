import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, AlertTriangle, AlertCircle, RotateCcw } from 'lucide-react'

export type ExtractionStatus = 'idle' | 'running' | 'succeeded' | 'partial' | 'failed'

export interface ExtractionStatusBannerProps {
  status: ExtractionStatus
  attempts?: number
  lastError?: string | null
  lastExtractionAt?: string | null
  onRetry?: () => void
  onRefresh?: () => void
  retrying?: boolean
}

/**
 * Banner shown on the candidate detail page when CV extraction is running,
 * failed, or produced partial results. Silent for `idle` and `succeeded`.
 *
 * While `running`, the banner polls a caller-provided `onRefresh` callback
 * every 3 seconds so the page picks up the final status without a manual
 * reload. Caller is responsible for updating the `status` prop in response.
 */
export default function ExtractionStatusBanner({
  status,
  attempts = 0,
  lastError,
  lastExtractionAt,
  onRetry,
  onRefresh,
  retrying,
}: ExtractionStatusBannerProps) {
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    if (status === 'running' && onRefresh) {
      pollRef.current = window.setInterval(onRefresh, 3000)
      return () => {
        if (pollRef.current != null) window.clearInterval(pollRef.current)
      }
    }
    return undefined
  }, [status, onRefresh])

  if (status === 'idle' || status === 'succeeded') return null

  if (status === 'running') {
    return (
      <div className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        <span>Extraction du CV en cours&hellip;</span>
      </div>
    )
  }

  const isPartial = status === 'partial'
  const tone = isPartial
    ? 'border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-200'
    : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
  const Icon = isPartial ? AlertTriangle : AlertCircle
  const title = isPartial ? 'Extraction partielle' : 'Extraction échouée'
  const subtitle = isPartial
    ? 'Certaines compétences ou candidatures n’ont pas pu être analysées. Vous pouvez relancer.'
    : 'L’analyse du CV a échoué avant de produire des suggestions utilisables.'

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">{title}</div>
          <div className="text-xs mt-1 opacity-90">{subtitle}</div>
          {lastError ? (
            <div className="text-xs mt-1 font-mono truncate opacity-75" title={lastError}>
              {lastError}
            </div>
          ) : null}
          <div className="text-[11px] mt-1 opacity-60">
            {attempts} tentative{attempts > 1 ? 's' : ''}
            {lastExtractionAt ? ` · ${new Date(lastExtractionAt).toLocaleString('fr-FR')}` : ''}
          </div>
        </div>
        {onRetry ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            className="shrink-0 gap-1.5"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
            Relancer
          </Button>
        ) : null}
      </div>
    </div>
  )
}

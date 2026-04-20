import { useEffect, useRef } from 'react'

/**
 * Subscribe to the per-candidature SSE stream and call the appropriate handler
 * for each event channel. Auto-reconnects with exponential backoff. Returns
 * nothing — pass typed handlers via props.
 *
 * Browser EventSource sends cookies automatically (same-origin), so the
 * server-side requireLead gate just works.
 *
 * Resilience: if the connection drops > 3s the EventSource native reconnect
 * fires; we add a manual cap so we don't hammer a dead server.
 */

export interface CandidatureEventHandlers {
  onDocumentScanUpdated?: (payload: { documentId: string; scanStatus: string; filename: string }) => void
  onExtractionRunCompleted?: (payload: { runId: string; type: string }) => void
  onStatusChanged?: (payload: { statutFrom: string | null; statutTo: string; byUserSlug: string }) => void
}

export function useCandidatureEventStream(candidatureId: string | undefined, handlers: CandidatureEventHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!candidatureId) return

    let es: EventSource | null = null
    let reconnectAttempts = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const open = () => {
      if (cancelled) return
      es = new EventSource(`/api/recruitment/candidatures/${candidatureId}/events/stream`, { withCredentials: true })

      es.addEventListener('open', () => { reconnectAttempts = 0 })

      es.addEventListener('document_scan_updated', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { documentId: string; scanStatus: string; filename: string }
          handlersRef.current.onDocumentScanUpdated?.(data)
        } catch { /* malformed */ }
      })

      es.addEventListener('extraction_run_completed', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { runId: string; type: string }
          handlersRef.current.onExtractionRunCompleted?.(data)
        } catch { /* malformed */ }
      })

      es.addEventListener('status_changed', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { statutFrom: string | null; statutTo: string; byUserSlug: string }
          // Skip the initial __connected__ heartbeat
          if (data.statutTo === '__connected__') return
          handlersRef.current.onStatusChanged?.(data)
        } catch { /* malformed */ }
      })

      es.addEventListener('error', () => {
        if (cancelled) return
        es?.close()
        // Exponential backoff capped at 30s. Skip when document is hidden.
        if (typeof document !== 'undefined' && document.hidden) return
        const delay = Math.min(30_000, 1000 * Math.pow(2, reconnectAttempts++))
        reconnectTimer = setTimeout(open, delay)
      })
    }

    open()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [candidatureId])
}

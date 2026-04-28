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
  /** Each handler receives the candidatureId the stream is subscribed
   *  to as the FIRST argument. Callers should update state keyed by
   *  THIS id, never by some outer-scope "current selection" closure —
   *  when the user switches candidatures, late events from the old
   *  stream can still fire before unsubscribe completes, and the
   *  handler ref is always the LATEST one (updated every render). */
  onDocumentScanUpdated?: (candidatureId: string, payload: { documentId: string; scanStatus: string; filename: string }) => void
  onExtractionRunCompleted?: (candidatureId: string, payload: { runId: string; type: string }) => void
  onStatusChanged?: (candidatureId: string, payload: { statutFrom: string | null; statutTo: string; byUserSlug: string }) => void
  /** v5.1 — fired when a stage fiche (PATCH /stages/:stage/data) is mutated.
   *  Workspace listens to invalidate the matching `useStageFicheData` query. */
  onStageDataChanged?: (candidatureId: string, payload: { stage: string; updatedAt: string; byUserSlug: string }) => void
  /** v5.x — fired when a recruiter flips the cabinet/direct toggle.
   *  Open candidature detail panes + the pipeline page should refetch
   *  to pick up the new canal value (and let CanalToggle\'s
   *  priorNonCabinet re-derive from props). */
  onCanalChanged?: (candidatureId: string, payload: { canalFrom: string; canalTo: string; byUserSlug: string }) => void
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

    // The candidatureId this effect-scope is subscribed to. Captured once
    // here and passed to every handler call so late events from an old
    // stream can't accidentally update the "currently selected" id
    // after the user has switched candidatures.
    const subscribedId = candidatureId

    const open = () => {
      if (cancelled) return
      es = new EventSource(`/api/recruitment/candidatures/${subscribedId}/events/stream`, { withCredentials: true })

      es.addEventListener('open', () => { reconnectAttempts = 0 })

      es.addEventListener('document_scan_updated', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { documentId: string; scanStatus: string; filename: string }
          handlersRef.current.onDocumentScanUpdated?.(subscribedId, data)
        } catch { /* malformed */ }
      })

      es.addEventListener('extraction_run_completed', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { runId: string; type: string }
          handlersRef.current.onExtractionRunCompleted?.(subscribedId, data)
        } catch { /* malformed */ }
      })

      es.addEventListener('status_changed', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { statutFrom: string | null; statutTo: string; byUserSlug: string }
          // Skip the initial __connected__ heartbeat
          if (data.statutTo === '__connected__') return
          handlersRef.current.onStatusChanged?.(subscribedId, data)
        } catch { /* malformed */ }
      })

      es.addEventListener('stage_data_changed', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { stage: string; updatedAt: string; byUserSlug: string }
          handlersRef.current.onStageDataChanged?.(subscribedId, data)
        } catch { /* malformed */ }
      })

      es.addEventListener('canal_changed', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { canalFrom: string; canalTo: string; byUserSlug: string }
          handlersRef.current.onCanalChanged?.(subscribedId, data)
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

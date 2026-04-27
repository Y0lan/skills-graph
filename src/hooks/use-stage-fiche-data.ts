import { useCallback, useEffect, useRef, useState } from 'react'
import type { Statut } from '@/lib/constants'
import { fetchStageFicheData, type FicheResponse } from '@/lib/stage-fiches/client'

/**
 * Read + cache the stage fiche for a (candidature, stage). Exposes a
 * `refetch` so the workspace's SSE handler can invalidate after a peer
 * tab saves. Loads on mount, on candidatureId/stage change, and on
 * explicit refetch.
 *
 * Keeps `lastFetchedAt` so the caller can pass it as `If-Match` on the
 * next PATCH for optimistic concurrency control.
 */
export interface UseStageFicheDataResult {
  data: Record<string, unknown>
  updatedAt: string | null
  updatedBy: string | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useStageFicheData(
  candidatureId: string | undefined,
  stage: Statut | null,
): UseStageFicheDataResult {
  const cacheKey = candidatureId && stage ? `${candidatureId}:${stage}` : ''
  const [state, setState] = useState<FicheResponse>({ data: {}, updatedAt: null, updatedBy: null })
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  // Bumping `tick` forces the effect to re-run for refetch().
  const [tick, setTick] = useState<number>(0)
  const lastReqRef = useRef<AbortController | null>(null)

  // Reset state during render when the (candidature, stage) target changes —
  // documented React pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // Avoids an effect-driven setState which the React-19 lint flags as a
  // cascading-render risk.
  const lastKey = useRef<string>(cacheKey)
  // eslint-disable-next-line react-hooks/refs
  if (lastKey.current !== cacheKey) {
    // eslint-disable-next-line react-hooks/refs
    lastKey.current = cacheKey
    setState({ data: {}, updatedAt: null, updatedBy: null })
    setError(null)
  }

  useEffect(() => {
    if (!candidatureId || !stage) return
    const ctrl = new AbortController()
    lastReqRef.current?.abort()
    lastReqRef.current = ctrl
    setLoading(true)
    setError(null)
    fetchStageFicheData(candidatureId, stage, { signal: ctrl.signal })
      .then(r => {
        if (ctrl.signal.aborted) return
        setState(r)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Erreur fiche')
      })
      .finally(() => {
        if (ctrl.signal.aborted) return
        setLoading(false)
      })
    return () => { ctrl.abort() }
  }, [candidatureId, stage, tick])

  const refetch = useCallback(() => { setTick(t => t + 1) }, [])

  return { data: state.data, updatedAt: state.updatedAt, updatedBy: state.updatedBy, loading, error, refetch }
}

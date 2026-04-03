import { useState, useEffect } from 'react'
import type { EvalStatus } from '@/components/status-icon'

export function useTeamStatus(enabled: boolean) {
  const [statusMap, setStatusMap] = useState<Map<string, EvalStatus>>(new Map())

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch('/api/ratings/status', { signal: controller.signal })
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        const map = new Map<string, EvalStatus>()
        for (const [slug, status] of Object.entries(data)) {
          if (status === 'submitted' || status === 'draft') {
            map.set(slug, status)
          }
        }
        setStatusMap(map)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [enabled])

  const submittedCount = [...statusMap.values()].filter(s => s === 'submitted').length
  return { statusMap, submittedCount }
}

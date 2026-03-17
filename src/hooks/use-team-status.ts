import { useState, useEffect } from 'react'
import type { EvalStatus } from '@/components/status-icon'

export function useTeamStatus(enabled: boolean) {
  const [statusMap, setStatusMap] = useState<Map<string, EvalStatus>>(new Map())

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch('/api/ratings', { signal: controller.signal })
      .then((r) => r.json())
      .then((data: Record<string, { ratings: Record<string, number>; submittedAt: string | null }>) => {
        const map = new Map<string, EvalStatus>()
        for (const [slug, eval_] of Object.entries(data)) {
          if (eval_.submittedAt) {
            map.set(slug, 'submitted')
          } else if (Object.keys(eval_.ratings).length > 0) {
            map.set(slug, 'draft')
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

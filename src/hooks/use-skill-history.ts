import { useState, useEffect, useCallback } from 'react'
import type { SkillChange } from '@/lib/types'

function fetchHistory(slug: string): Promise<SkillChange[]> {
  return fetch(`/api/history/${slug}`, { credentials: 'include' })
    .then(r => r.ok ? r.json() : { changes: [] })
    .then(d => d.changes ?? [])
}

export function useSkillHistory(slug: string | undefined) {
  const [changes, setChanges] = useState<SkillChange[]>([])

  useEffect(() => {
    if (!slug) return
    fetchHistory(slug).then(setChanges).catch(() => setChanges([]))
  }, [slug])

  const refetch = useCallback(() => {
    if (!slug) return
    fetchHistory(slug).then(setChanges).catch(() => {})
  }, [slug])

  return { changes, refetch }
}

export function useTeamHistory() {
  const [timeline, setTimeline] = useState<{ date: string; skillId: string; avgLevel: number }[]>([])

  useEffect(() => {
    fetch('/api/history', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { timeline: [] })
      .then(d => setTimeline(d.timeline ?? []))
      .catch(() => setTimeline([]))
  }, [])

  return { timeline }
}

import { useState, useCallback } from 'react'
import type { MemberRatings, AllRatings } from '@/lib/ratings'

interface UseRatingsReturn {
  data: MemberRatings | null
  loading: boolean
  error: string | null
  fetchRatings: (slug: string) => Promise<MemberRatings | null>
  submitRatings: (
    slug: string,
    payload: {
      ratings: Record<string, number>
      experience: Record<string, number>
      skippedCategories: string[]
    },
  ) => Promise<MemberRatings | null>
}

export function useRatings(): UseRatingsReturn {
  const [data, setData] = useState<MemberRatings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRatings = useCallback(async (slug: string): Promise<MemberRatings | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ratings/${slug}`)
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Member not found' : 'Failed to fetch ratings')
      }
      const json = await res.json()
      setData(json)
      return json
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const submitRatings = useCallback(
    async (
      slug: string,
      payload: {
        ratings: Record<string, number>
        experience: Record<string, number>
        skippedCategories: string[]
      },
    ): Promise<MemberRatings | null> => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/ratings/${slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(
            (errBody as Record<string, string>).error ?? 'Failed to submit ratings',
          )
        }
        const json = await res.json()
        setData(json)
        return json
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return { data, loading, error, fetchRatings, submitRatings }
}

// Hook for fetching all ratings (dashboard)
interface UseAllRatingsReturn {
  data: AllRatings | null
  loading: boolean
  error: string | null
  fetchAll: () => Promise<AllRatings | null>
}

export function useAllRatings(): UseAllRatingsReturn {
  const [data, setData] = useState<AllRatings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (): Promise<AllRatings | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ratings')
      if (!res.ok) throw new Error('Failed to fetch ratings')
      const json = await res.json()
      setData(json)
      return json
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, fetchAll }
}

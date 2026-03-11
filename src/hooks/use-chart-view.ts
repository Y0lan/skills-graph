import { useState, useCallback } from 'react'

export type ChartView = 'radar' | 'barres'

const STORAGE_KEY = 'chart-view-preference'

export function useChartView(): [ChartView, (v: ChartView) => void] {
  const [view, setViewState] = useState<ChartView>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'barres') return 'barres'
    } catch {
      // ignore
    }
    return 'radar'
  })

  const setView = useCallback((v: ChartView) => {
    setViewState(v)
    try {
      localStorage.setItem(STORAGE_KEY, v)
    } catch {
      // ignore
    }
  }, [])

  return [view, setView]
}

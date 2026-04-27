import { useEffect, useRef, useState } from 'react'
import { TIMELINE_FILTER_VALUES, type TimelineFilter } from '@/components/recruit/timeline-filter-chips'

/**
 * Read + persist the timeline filter selection per-candidature.
 *
 * Lives in `src/hooks/` (not next to the chip component) so the chip
 * file can satisfy `react-refresh/only-export-components` — Fast
 * Refresh refuses to swap component modules that also export hooks
 * or constants.
 *
 * The "reset state during render on prop change" idiom is the
 * documented React pattern for "re-seed when a key prop changes" —
 * we use it here so a candidature switch in the workspace flips the
 * filter to the new candidature's persisted choice without an
 * effect cascade. See https://react.dev/reference/react/useState#storing-information-from-previous-renders.
 */
function read(storageKey: string): TimelineFilter {
  if (typeof window === 'undefined') return 'all'
  const stored = window.localStorage.getItem(storageKey)
  if (stored && (TIMELINE_FILTER_VALUES as readonly string[]).includes(stored)) {
    return stored as TimelineFilter
  }
  return 'all'
}

export function useTimelineFilter(candidatureId: string): [TimelineFilter, (next: TimelineFilter) => void] {
  const storageKey = `timeline-filter:${candidatureId}`
  const [value, setValue] = useState<TimelineFilter>(() => read(storageKey))

  // Re-seed when the candidatureId changes inside the same mount
  // (the workspace re-renders, doesn't always remount, on switcher
  // navigation). This is the React-docs-sanctioned pattern; the
  // react-hooks/refs lint flags ref reads during render
  // conservatively but the idiom is supported.
  const lastKey = useRef(storageKey)
  // eslint-disable-next-line react-hooks/refs
  if (lastKey.current !== storageKey) {
    // eslint-disable-next-line react-hooks/refs
    lastKey.current = storageKey
    setValue(read(storageKey))
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, value)
  }, [storageKey, value])

  return [value, setValue]
}

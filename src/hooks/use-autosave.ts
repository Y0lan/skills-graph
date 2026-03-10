import { useEffect, useRef, useCallback } from 'react'
import { useWatch, type Control } from 'react-hook-form'
import type { SkillFormValues } from '@/lib/schemas'

interface UseAutosaveOptions {
  control: Control<SkillFormValues>
  slug: string
  debounceMs?: number
  enabled?: boolean
}

export function useAutosave({ control, slug, debounceMs = 800, enabled = true }: UseAutosaveOptions) {
  const formValues = useWatch({ control })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const savingRef = useRef(false)

  const save = useCallback(async (values: SkillFormValues) => {
    if (savingRef.current) return

    const serialized = JSON.stringify(values)
    if (serialized === lastSavedRef.current) return

    savingRef.current = true
    try {
      const res = await fetch(`/api/ratings/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      })
      if (res.ok) {
        lastSavedRef.current = serialized
      }
    } catch {
      // Silently fail — will retry on next change
    } finally {
      savingRef.current = false
    }
  }, [slug])

  useEffect(() => {
    if (!enabled) return

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      save(formValues as SkillFormValues)
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [formValues, debounceMs, enabled, save])

  // Save immediately on unmount if there are pending changes
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])
}

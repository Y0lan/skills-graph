import { useEffect, useRef, useCallback, useState } from 'react'
import { useWatch, type Control } from 'react-hook-form'
import type { SkillFormValues } from '@/lib/schemas'

//  ┌──────┐  form change  ┌───────┐  fetch OK  ┌───────┐
//  │ idle │ ────────────→  │saving │ ─────────→ │ saved │
//  └──────┘                └───────┘            └───────┘
//                             │                     │
//                             │ fetch fail          │ form change
//                             ▼                     │
//                          ┌───────┐                │
//                          │ error │ ◄──────────────┘
//                          └───────┘     (retry on next change)

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutosaveOptions {
  control: Control<SkillFormValues>
  slug: string
  endpoint?: string
  debounceMs?: number
  enabled?: boolean
}

interface UseAutosaveReturn {
  saveStatus: SaveStatus
  saveError: string | undefined
}

export function useAutosave({ control, slug, endpoint, debounceMs = 800, enabled = true }: UseAutosaveOptions): UseAutosaveReturn {
  const saveUrl = endpoint ?? `/api/ratings/${slug}`
  const formValues = useWatch({ control })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const savingRef = useRef(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | undefined>()

  const save = useCallback(async (values: SkillFormValues) => {
    if (savingRef.current) return

    const serialized = JSON.stringify(values)
    if (serialized === lastSavedRef.current) return

    savingRef.current = true
    setSaveStatus('saving')
    try {
      const res = await fetch(saveUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      })
      if (res.ok) {
        lastSavedRef.current = serialized
        setSaveStatus('saved')
        setSaveError(undefined)
      } else {
        setSaveStatus('error')
        setSaveError(`HTTP ${res.status}`)
      }
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      savingRef.current = false
    }
  }, [saveUrl])

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

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { saveStatus, saveError }
}

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutosave } from '../use-autosave'

// Mock react-hook-form's useWatch
let watchedValues = { ratings: {}, experience: {}, skippedCategories: [] as string[] }
vi.mock('react-hook-form', () => ({
  useWatch: () => watchedValues,
}))

// Mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function createMockControl() {
  return {} as Parameters<typeof useAutosave>[0]['control']
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    watchedValues = { ratings: {}, experience: {}, skippedCategories: [] }
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with idle status', () => {
    const { result } = renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test' }),
    )
    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.saveError).toBeUndefined()
  })

  it('transitions to saving then saved on successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test' }),
    )

    // Trigger debounce by advancing timers
    await act(async () => {
      vi.advanceTimersByTime(800)
    })

    // Should have called fetch
    expect(mockFetch).toHaveBeenCalledWith('/api/ratings/test', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(watchedValues),
    })
    expect(result.current.saveStatus).toBe('saved')
    expect(result.current.saveError).toBeUndefined()
  })

  it('transitions to error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const { result } = renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test' }),
    )

    await act(async () => {
      vi.advanceTimersByTime(800)
    })

    expect(result.current.saveStatus).toBe('error')
    expect(result.current.saveError).toBe('HTTP 500')
  })

  it('transitions to error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test' }),
    )

    await act(async () => {
      vi.advanceTimersByTime(800)
    })

    expect(result.current.saveStatus).toBe('error')
    expect(result.current.saveError).toBe('Network error')
  })

  it('does not save when enabled is false', async () => {
    const { result } = renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test', enabled: false }),
    )

    await act(async () => {
      vi.advanceTimersByTime(800)
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.saveStatus).toBe('idle')
  })

  it('skips save when values have not changed', async () => {
    mockFetch.mockResolvedValue({ ok: true })

    const { result } = renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test' }),
    )

    // First save
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('saved')

    // Re-render with same values triggers debounce but skips fetch
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    // Still only 1 call — values haven't changed
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('uses custom debounceMs', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test', debounceMs: 200 }),
    )

    // Not yet at 200ms
    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    expect(mockFetch).not.toHaveBeenCalled()

    // Now at 200ms
    await act(async () => {
      vi.advanceTimersByTime(50)
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('clears error on successful save after error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const { result } = renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test' }),
    )

    // First save fails
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(result.current.saveStatus).toBe('error')
    expect(result.current.saveError).toBe('HTTP 500')

    // Change values so next save triggers
    mockFetch.mockResolvedValueOnce({ ok: true })
    watchedValues = { ratings: { skill1: 3 }, experience: {}, skippedCategories: [] }

    // Re-render to pick up new watchedValues
    const { result: result2 } = renderHook(() =>
      useAutosave({ control: createMockControl(), slug: 'test' }),
    )

    await act(async () => {
      vi.advanceTimersByTime(800)
    })

    expect(result2.current.saveStatus).toBe('saved')
    expect(result2.current.saveError).toBeUndefined()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { persistDraft, readDraft, clearDraft, shouldRestoreDraft } from '@/lib/stage-fiches/client'

// Some jsdom + vitest combinations expose `localStorage` as an object
// without working setItem/getItem (the Storage prototype isn't fully
// wired). Install a Map-backed shim if the native one is broken — the
// helpers under test only use the four standard methods.
beforeAll(() => {
  const probe = (() => {
    try {
      window.localStorage.setItem('__probe__', '1')
      const ok = window.localStorage.getItem('__probe__') === '1'
      window.localStorage.removeItem('__probe__')
      return ok
    } catch {
      return false
    }
  })()
  if (probe) return
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() { return store.size },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
    },
  })
})

describe('stage-fiches/client — draft persistence (Y6)', () => {
  beforeEach(() => {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i)
      if (k) window.localStorage.removeItem(k)
    }
  })

  it('persists then reads back the draft for a (candidature, stage)', () => {
    persistDraft('cand-1', 'entretien_1', { mode: 'visio' }, '2026-04-30T03:00:00')
    const got = readDraft('cand-1', 'entretien_1')
    expect(got).not.toBeNull()
    expect(got!.data).toEqual({ mode: 'visio' })
    expect(got!.basedOnUpdatedAt).toBe('2026-04-30T03:00:00')
  })

  it('returns null when no draft exists', () => {
    expect(readDraft('cand-2', 'entretien_1')).toBeNull()
  })

  it('clearDraft removes the entry', () => {
    persistDraft('cand-3', 'aboro', { mode: 'visio' }, null)
    expect(readDraft('cand-3', 'aboro')).not.toBeNull()
    clearDraft('cand-3', 'aboro')
    expect(readDraft('cand-3', 'aboro')).toBeNull()
  })

  it('shouldRestoreDraft: true when no server row yet', () => {
    persistDraft('c', 'entretien_1', { mode: 'visio' }, null)
    const draft = readDraft('c', 'entretien_1')
    expect(shouldRestoreDraft(draft, null)).toBe(true)
  })

  it('shouldRestoreDraft: true when basedOnUpdatedAt matches server', () => {
    persistDraft('c', 'entretien_1', { mode: 'visio' }, '2026-04-30T03:00:00')
    const draft = readDraft('c', 'entretien_1')
    expect(shouldRestoreDraft(draft, '2026-04-30T03:00:00')).toBe(true)
  })

  it('shouldRestoreDraft: still true when server moved on (UI asks the user)', () => {
    persistDraft('c', 'entretien_1', { mode: 'visio' }, '2026-04-30T03:00:00')
    const draft = readDraft('c', 'entretien_1')
    expect(shouldRestoreDraft(draft, '2026-04-30T03:05:00')).toBe(true)
  })

  it('shouldRestoreDraft: false when no draft', () => {
    expect(shouldRestoreDraft(null, '2026-04-30T03:00:00')).toBe(false)
  })

  it('shouldRestoreDraft: false when draft data is empty', () => {
    persistDraft('c', 'entretien_1', {}, '2026-04-30T03:00:00')
    const draft = readDraft('c', 'entretien_1')
    expect(shouldRestoreDraft(draft, '2026-04-30T03:00:00')).toBe(false)
  })
})

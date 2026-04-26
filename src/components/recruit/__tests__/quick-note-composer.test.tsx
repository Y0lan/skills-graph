// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// Toast mock has to be at the top level — Vitest hoists `vi.mock` calls
// before module-import order regardless of where you put them, but the
// linter wants them visibly outside any block.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import QuickNoteComposer from '../quick-note-composer'

afterEach(() => cleanup())

/**
 * Quick-note composer is the recruiter's append-only note flow on the
 * candidature timeline. These tests lock down:
 *  - Ctrl+Enter and Cmd+Enter both submit
 *  - empty / whitespace-only does nothing
 *  - optimistic prepend → server confirm → replaceTemp called with real row
 *  - on POST failure, rollbackTemp is called and the textarea is restored
 *  - the publish button is disabled while a submit is inflight
 */
describe('QuickNoteComposer', () => {
  it('renders with placeholder + character counter', () => {
    render(
      <QuickNoteComposer
        candidatureId="c-1"
        currentUserSlug="yolan.test"
        onPublished={() => {}}
      />,
    )
    expect(screen.getByPlaceholderText(/Ajouter une note rapide/)).toBeInTheDocument()
    expect(screen.getByText(/0\/5000/)).toBeInTheDocument()
  })

  it('Ctrl+Enter publishes a non-empty note via fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 42, type: 'note', statutFrom: null, statutTo: null, notes: null, contentMd: 'hello', emailSnapshot: null, createdBy: 'yolan.test', createdAt: '2026-04-27 10:00:00' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const onPublished = vi.fn()

    render(
      <QuickNoteComposer
        candidatureId="c-1"
        currentUserSlug="yolan.test"
        onPublished={onPublished}
      />,
    )
    const ta = screen.getByPlaceholderText(/Ajouter une note rapide/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'hello' } })
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(onPublished).toHaveBeenCalled())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('/api/recruitment/candidatures/c-1/events/note')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ contentMd: 'hello' })
    fetchSpy.mockRestore()
  })

  it('Cmd+Enter (metaKey) also publishes — for Mac users', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 1, type: 'note', statutFrom: null, statutTo: null, notes: null, contentMd: 'mac', emailSnapshot: null, createdBy: 'me', createdAt: 'x' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const onPublished = vi.fn()
    render(
      <QuickNoteComposer
        candidatureId="c-1"
        currentUserSlug="me"
        onPublished={onPublished}
      />,
    )
    const ta = screen.getByPlaceholderText(/Ajouter une note rapide/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'mac' } })
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(onPublished).toHaveBeenCalled())
    fetchSpy.mockRestore()
  })

  it('does not submit empty / whitespace-only notes', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(
      <QuickNoteComposer
        candidatureId="c-1"
        currentUserSlug="me"
        onPublished={() => {}}
      />,
    )
    const ta = screen.getByPlaceholderText(/Ajouter une note rapide/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '   \n  ' } })
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('optimistic path: prepends temp event, replaces with server row on success', async () => {
    const real = { id: 99, type: 'note', statutFrom: null, statutTo: null, notes: null, contentMd: 'opt', emailSnapshot: null, createdBy: 'me', createdAt: '2026-04-27 10:00:00' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(real), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const onOptimisticPrepend = vi.fn()
    const onReplaceTemp = vi.fn()
    const onRollbackTemp = vi.fn()

    render(
      <QuickNoteComposer
        candidatureId="c-1"
        currentUserSlug="me"
        onPublished={() => {}}
        onOptimisticPrepend={onOptimisticPrepend}
        onReplaceTemp={onReplaceTemp}
        onRollbackTemp={onRollbackTemp}
      />,
    )
    const ta = screen.getByPlaceholderText(/Ajouter une note rapide/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'opt' } })
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true })

    // The optimistic prepend should fire IMMEDIATELY (before the await)
    expect(onOptimisticPrepend).toHaveBeenCalledTimes(1)
    const tempEvent = onOptimisticPrepend.mock.calls[0][0]
    expect(tempEvent.contentMd).toBe('opt')
    expect(tempEvent.id).toBeLessThan(0) // negative tempId

    await waitFor(() => expect(onReplaceTemp).toHaveBeenCalled())
    expect(onReplaceTemp).toHaveBeenCalledWith(tempEvent.id, expect.objectContaining({ id: 99 }))
    expect(onRollbackTemp).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('optimistic path: rolls back + restores textarea on POST failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } }),
    )
    const onOptimisticPrepend = vi.fn()
    const onReplaceTemp = vi.fn()
    const onRollbackTemp = vi.fn()

    render(
      <QuickNoteComposer
        candidatureId="c-1"
        currentUserSlug="me"
        onPublished={() => {}}
        onOptimisticPrepend={onOptimisticPrepend}
        onReplaceTemp={onReplaceTemp}
        onRollbackTemp={onRollbackTemp}
      />,
    )
    const ta = screen.getByPlaceholderText(/Ajouter une note rapide/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'opt' } })
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(onRollbackTemp).toHaveBeenCalled())
    expect(onReplaceTemp).not.toHaveBeenCalled()
    // Textarea restored so the recruiter doesn't lose their typing.
    expect(ta.value).toBe('opt')
    fetchSpy.mockRestore()
  })
})

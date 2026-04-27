// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { EntretienFiche, type EntretienFicheValues } from '../entretien-fiche'

afterEach(() => cleanup())

describe('<EntretienFiche>', () => {
  it('renders empty state copy when data is empty', () => {
    render(
      <EntretienFiche
        eyebrow="Étape 05 · Entretien 1"
        title="Entretien 1"
        data={{}}
        onSave={() => {}}
      />,
    )
    expect(screen.getByText(/Ajoute la date, le lien Meet/i)).toBeInTheDocument()
  })

  it('does not show the save bar until a field is dirty', () => {
    render(
      <EntretienFiche
        eyebrow="Étape 05 · Entretien 1"
        title="Entretien 1"
        data={{}}
        onSave={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /Enregistrer/i })).toBeNull()
  })

  it('shows save bar + calls onSave with diff when a field changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <EntretienFiche
        eyebrow="Étape 05 · Entretien 1"
        title="Entretien 1"
        data={{}}
        onSave={onSave}
      />,
    )
    const datetimeInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement
    expect(datetimeInput).not.toBeNull()
    fireEvent.change(datetimeInput, { target: { value: '2026-04-30T14:00' } })

    const saveBtn = await screen.findByRole('button', { name: /Enregistrer/i })
    expect(saveBtn).toBeEnabled()
    fireEvent.click(saveBtn)

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: '2026-04-30T14:00' }))
  })

  it('emits null in the patch when an existing field is cleared', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const initial: EntretienFicheValues = { mode: 'visio', meetLink: 'https://meet.google.com/abc' }
    render(
      <EntretienFiche
        eyebrow="Étape 05 · Entretien 1"
        title="Entretien 1"
        data={initial}
        onSave={onSave}
      />,
    )
    // Clear the meet link
    const meetInput = screen.getByDisplayValue('https://meet.google.com/abc') as HTMLInputElement
    fireEvent.change(meetInput, { target: { value: '' } })
    fireEvent.click(await screen.findByRole('button', { name: /Enregistrer/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>
    expect(patch.meetLink).toBeNull()
  })

  it('rejects malformed local input via Zod and surfaces an error message', async () => {
    const onSave = vi.fn()
    render(
      <EntretienFiche
        eyebrow="Étape 05 · Entretien 1"
        title="Entretien 1"
        data={{}}
        onSave={onSave}
      />,
    )
    // Type into the meet link with a non-URL string so client-side schema rejects.
    const meetInput = screen.getByPlaceholderText(/meet\.google\.com/) as HTMLInputElement
    fireEvent.change(meetInput, { target: { value: 'not a url' } })
    fireEvent.click(await screen.findByRole('button', { name: /Enregistrer/i }))

    expect(onSave).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText(/URL invalide|invalide|attendu/i)).toBeInTheDocument()
    })
  })

  it('Annuler reverts the dirty state', () => {
    render(
      <EntretienFiche
        eyebrow="Étape 05 · Entretien 1"
        title="Entretien 1"
        data={{ mode: 'visio' }}
        onSave={() => {}}
      />,
    )
    const meetInput = screen.getByPlaceholderText(/meet\.google\.com/) as HTMLInputElement
    fireEvent.change(meetInput, { target: { value: 'https://meet.google.com/xyz' } })
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }))
    expect(meetInput.value).toBe('')
  })
})

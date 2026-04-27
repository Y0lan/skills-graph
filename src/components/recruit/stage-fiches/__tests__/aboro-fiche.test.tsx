// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AboroFiche } from '../aboro-fiche'

afterEach(() => cleanup())

describe('<AboroFiche>', () => {
  it('renders empty state with helper hint', () => {
    render(<AboroFiche eyebrow="Étape 06 · Test Âboro" title="Test Âboro" data={{}} onSave={() => {}} />)
    expect(screen.getByText(/Quand le test sera planifié/i)).toBeInTheDocument()
  })

  it('saves a partial patch (recommendation only)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<AboroFiche eyebrow="Étape 06 · Test Âboro" title="Test Âboro" data={{}} onSave={onSave} />)
    // Pick recommendation via the select trigger.
    fireEvent.click(screen.getAllByText(/Pas encore reçue/i)[0])
    // base-ui Select renders a list — pick "Compatible".
    const compatible = await screen.findByText('Compatible')
    fireEvent.click(compatible)

    fireEvent.click(await screen.findByRole('button', { name: /Enregistrer/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith({ recommendation: 'compatible' })
  })

  it('opens the report PDF link in a new tab when filled', () => {
    render(<AboroFiche eyebrow="Étape 06" title="Test Âboro" data={{ resultPdfUrl: 'https://example.test/report.pdf' }} onSave={() => {}} />)
    const link = screen.getByRole('link', { name: /Ouvrir/i })
    expect(link.getAttribute('href')).toBe('https://example.test/report.pdf')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
  })
})

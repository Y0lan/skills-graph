// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import CandidateScoreSummary from '../candidate-score-summary'

afterEach(() => cleanup())

// Stub the breakdown dialog so the test doesn't touch the network.
// CandidateScoreSummary only opens it on click; the body-rendering path is
// already covered by the dialog's own tests.
vi.mock('../compat-breakdown-dialog', () => ({
  __esModule: true,
  default: () => null,
}))

describe('CandidateScoreSummary', () => {
  it('renders four tiles in fixed order: Global, Poste, Équipe, Soft', () => {
    render(
      <CandidateScoreSummary
        tauxGlobal={82}
        tauxPoste={79}
        tauxEquipe={68}
        tauxSoft={85}
      />,
    )
    const labels = screen.getAllByText(/^(Global|Poste|Équipe|Soft)$/).map(n => n.textContent)
    expect(labels).toEqual(['Global', 'Poste', 'Équipe', 'Soft'])
  })

  it('renders "—" + status hint instead of a number when a score is null', () => {
    render(
      <CandidateScoreSummary
        tauxGlobal={null}
        tauxPoste={79}
        tauxEquipe={null}
        tauxSoft={null}
      />,
    )
    // Three "—" placeholders, one for each null score.
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
    // Hints derive from the MISSING_HINT map; verify each null tile's hint.
    expect(screen.getByText('Skill Radar non soumis')).toBeInTheDocument()  // Soft
    expect(screen.getByText('Dépend du Skill Radar')).toBeInTheDocument()    // Global
    expect(screen.getByText('En attente du scoring CV')).toBeInTheDocument() // Équipe
  })

  it('renders the inline missing-action CTA when a tile is null and onMissingAction is provided', () => {
    const onMissingAction = vi.fn()
    render(
      <CandidateScoreSummary
        tauxGlobal={null}
        tauxPoste={79}
        tauxEquipe={null}
        tauxSoft={null}
        onMissingAction={onMissingAction}
        missingActionLabel="Copier le lien Skill Radar"
      />,
    )
    expect(screen.getByRole('button', { name: 'Copier le lien Skill Radar' })).toBeInTheDocument()
  })

  it('does not render the missing-action CTA when no tile is null', () => {
    render(
      <CandidateScoreSummary
        tauxGlobal={82}
        tauxPoste={79}
        tauxEquipe={68}
        tauxSoft={85}
        onMissingAction={() => {}}
        missingActionLabel="Should not render"
      />,
    )
    expect(screen.queryByRole('button', { name: 'Should not render' })).not.toBeInTheDocument()
  })

  it('only Poste and Équipe tiles are clickable when candidatureId is provided', () => {
    render(
      <CandidateScoreSummary
        tauxGlobal={82}
        tauxPoste={79}
        tauxEquipe={68}
        tauxSoft={85}
        candidatureId="cand-1"
      />,
    )
    // Poste + Équipe should each render an aria-labelled button; Global +
    // Soft don't (no breakdown route exposed yet).
    expect(screen.getByRole('button', { name: /détail du score Poste/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /détail du score Équipe/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /détail du score Global/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /détail du score Soft/ })).not.toBeInTheDocument()
  })

  it('verdict badge appears when at least one of poste/equipe is present', () => {
    render(
      <CandidateScoreSummary
        tauxGlobal={null}
        tauxPoste={85}
        tauxEquipe={75}
        tauxSoft={null}
      />,
    )
    // verdictFromScores(85, 75) → mean 80 → "Excellent fit"
    expect(screen.getByText('Excellent fit')).toBeInTheDocument()
  })

  it('does not crash when every tile is null', () => {
    render(
      <CandidateScoreSummary
        tauxGlobal={null}
        tauxPoste={null}
        tauxEquipe={null}
        tauxSoft={null}
      />,
    )
    // Just assert the component still renders without throwing.
    expect(screen.getByText('Compatibilité')).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CandidateStickyHeader from '../candidate-sticky-header'
import type { CandidatureInfo, AllowedTransitions } from '@/hooks/use-candidate-data'

afterEach(() => cleanup())

const baseCandidature = (over: Partial<CandidatureInfo> = {}): CandidatureInfo => ({
  id: 'c-1',
  candidateId: 'cand-1',
  posteId: 'p-1',
  posteTitre: 'Dev Java Senior',
  postePole: 'java_modernisation',
  statut: 'postule',
  canal: 'site',
  notesDirecteur: null,
  tauxPoste: null,
  tauxEquipe: null,
  tauxSoft: null,
  tauxGlobal: null,
  softSkillAlerts: null,
  createdAt: '2026-04-26T10:00:00',
  ...over,
})

const allowedTransitions = (forward: string[]): AllowedTransitions => ({
  allowedTransitions: forward,
  skipTransitions: [],
  notesRequired: [],
})

/**
 * Sticky header is the recruiter's "always within reach" CTA. Tests lock
 * down the contracts codex flagged:
 *  - the candidate name + CTA are visible and tabbable immediately
 *  - the visible CTA derives from `allowedTransitions[0]` minus refuse,
 *    never from a static guidance map
 *  - terminal candidatures show "Aucune action disponible" instead of an
 *    illegal advance
 *  - clicking the CTA fires onOpenTransition with (candidatureId, target,
 *    currentStatut)
 */
describe('CandidateStickyHeader', () => {
  it('returns null when no candidature is selected', () => {
    const { container } = render(
      <CandidateStickyHeader
        candidateName="Tanguy"
        candidature={null}
        allowedTransitions={null}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the candidate name and CTA immediately', () => {
    render(
      <CandidateStickyHeader
        candidateName="Tanguy"
        candidature={baseCandidature()}
        allowedTransitions={allowedTransitions(['preselectionne', 'refuse'])}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )
    expect(screen.getByText('Tanguy')).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /Présélectionné/ })
    expect(cta).toHaveAttribute('tabindex', '0')
  })

  it('renders "Aucune action disponible" for terminal / empty allowedTransitions', () => {
    render(
      <CandidateStickyHeader
        candidateName="Tanguy"
        candidature={baseCandidature({ statut: 'embauche' })}
        allowedTransitions={allowedTransitions([])}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )
    expect(screen.getByText('Aucune action disponible')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('clicking CTA calls onOpenTransition with the right args', () => {
    const onOpenTransition = vi.fn()
    Object.defineProperty(window, 'scrollY', { writable: true, value: 400 })
    render(
      <CandidateStickyHeader
        candidateName="Tanguy"
        candidature={baseCandidature({ statut: 'preselectionne' })}
        allowedTransitions={allowedTransitions(['skill_radar_envoye', 'refuse'])}
        onOpenTransition={onOpenTransition}
        changingStatus={false}
      />,
    )
    fireEvent.scroll(window)
    fireEvent.click(screen.getByRole('button', { name: /Skill Radar envoyé/ }))
    expect(onOpenTransition).toHaveBeenCalledWith('c-1', 'skill_radar_envoye', 'preselectionne')
  })

  it('CTA derives from allowedTransitions, NOT NEXT_ACTION (refuse is filtered out)', () => {
    // If allowedTransitions only had 'refuse', the sticky header must
    // not advertise it as the primary forward action — that would be
    // the equivalent of accidentally showing a destructive CTA up top.
    render(
      <CandidateStickyHeader
        candidateName="Tanguy"
        candidature={baseCandidature()}
        allowedTransitions={allowedTransitions(['refuse'])}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )
    expect(screen.getByText('Aucune action disponible')).toBeInTheDocument()
  })
})

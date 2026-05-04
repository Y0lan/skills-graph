// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CandidaturePosteHeader from '../candidature-poste-header'
import type { AllowedTransitions, CandidatureInfo } from '@/hooks/use-candidate-data'

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
 * Contracts migrated from the deleted CandidateStickyHeader component when
 * its CTA was folded into CandidaturePosteHeader (sticky permanent header
 * refactor). The poste header is now the recruiter's always-visible CTA
 * since the wrapping sticky div keeps it on screen during scroll.
 *
 *  - the visible CTA derives from `allowedTransitions[0]` minus refuse,
 *    never from a static guidance map
 *  - terminal candidatures (or only-refuse-allowed) render NO CTA — a
 *    dead button is worse than no button
 *  - clicking the CTA fires `onOpenTransition(candidatureId, target,
 *    currentStatut)` with the right args
 */
describe('CandidaturePosteHeader — transition CTA contract', () => {
  it('renders the CTA when allowedTransitions has a non-refuse forward', () => {
    render(
      <CandidaturePosteHeader
        candidature={baseCandidature()}
        isPending={false}
        submitted={false}
        analysed={false}
        events={[]}
        allowedTransitions={allowedTransitions(['preselectionne', 'refuse'])}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )
    expect(screen.getByRole('button', { name: /Présélectionné/ })).toBeInTheDocument()
  })

  it('renders NO CTA when allowedTransitions is empty (terminal state)', () => {
    render(
      <CandidaturePosteHeader
        candidature={baseCandidature({ statut: 'embauche' })}
        isPending={false}
        submitted={false}
        analysed={false}
        events={[]}
        allowedTransitions={allowedTransitions([])}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders NO CTA when only refuse is allowed (refuse is filtered out)', () => {
    render(
      <CandidaturePosteHeader
        candidature={baseCandidature()}
        isPending={false}
        submitted={false}
        analysed={false}
        events={[]}
        allowedTransitions={allowedTransitions(['refuse'])}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders NO CTA when allowedTransitions is null (initial load)', () => {
    render(
      <CandidaturePosteHeader
        candidature={baseCandidature()}
        isPending={false}
        submitted={false}
        analysed={false}
        events={[]}
        allowedTransitions={null}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('clicking CTA calls onOpenTransition with (candidatureId, target, currentStatut)', () => {
    const onOpenTransition = vi.fn()
    render(
      <CandidaturePosteHeader
        candidature={baseCandidature({ statut: 'preselectionne' })}
        isPending={false}
        submitted={false}
        analysed={false}
        events={[]}
        allowedTransitions={allowedTransitions(['skill_radar_envoye', 'refuse'])}
        onOpenTransition={onOpenTransition}
        changingStatus={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Skill Radar envoyé/ }))
    expect(onOpenTransition).toHaveBeenCalledWith('c-1', 'skill_radar_envoye', 'preselectionne')
  })

  it('disables the CTA while changingStatus is true', () => {
    render(
      <CandidaturePosteHeader
        candidature={baseCandidature()}
        isPending={false}
        submitted={false}
        analysed={false}
        events={[]}
        allowedTransitions={allowedTransitions(['preselectionne', 'refuse'])}
        onOpenTransition={() => {}}
        changingStatus={true}
      />,
    )
    expect(screen.getByRole('button', { name: /Présélectionné/ })).toBeDisabled()
  })

  it('renders compact candidate identity when provided', () => {
    render(
      <CandidaturePosteHeader
        candidature={baseCandidature()}
        candidateName="Mickael Bourgeoisat MICKAEL"
        candidateLocation="Biscarrosse, France"
        isPending={false}
        submitted={false}
        analysed={false}
        events={[]}
        allowedTransitions={null}
        onOpenTransition={() => {}}
        changingStatus={false}
      />,
    )

    expect(screen.getByText('Mickael Bourgeoisat MICKAEL')).toBeInTheDocument()
    expect(screen.getByText('Biscarrosse, France')).toBeInTheDocument()
  })
})

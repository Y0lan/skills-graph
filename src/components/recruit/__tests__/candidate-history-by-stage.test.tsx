// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// StageFiche dispatcher pulls in fetch + SSE plumbing — out of scope here.
vi.mock('../stage-fiches/stage-fiche', () => ({ StageFiche: () => null }))

import CandidateHistoryByStage from '../candidate-history-by-stage'
import type { CandidatureEvent, CandidatureDocument } from '@/hooks/use-candidate-data'

afterEach(() => cleanup())

function ev(overrides: Partial<CandidatureEvent>): CandidatureEvent {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 1e9),
    type: overrides.type ?? 'note',
    statutFrom: overrides.statutFrom ?? null,
    statutTo: overrides.statutTo ?? null,
    notes: overrides.notes ?? null,
    contentMd: overrides.contentMd ?? null,
    emailSnapshot: overrides.emailSnapshot ?? null,
    createdBy: overrides.createdBy ?? 'test',
    createdAt: overrides.createdAt ?? '2026-04-27 10:00:00',
    stage: overrides.stage ?? null,
    updatedAt: overrides.updatedAt ?? null,
  }
}

function doc(overrides: Partial<CandidatureDocument>): CandidatureDocument {
  return {
    id: overrides.id ?? `d-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? 'cv',
    filename: overrides.filename ?? 'cv.pdf',
    display_filename: overrides.display_filename ?? 'CV.pdf',
    uploaded_by: overrides.uploaded_by ?? 'test',
    created_at: overrides.created_at ?? '2026-04-27 10:00:00',
    scan_status: overrides.scan_status,
    deleted_at: overrides.deleted_at ?? null,
    event_id: overrides.event_id,
  }
}

describe('groupEventsByStage (via CandidateHistoryByStage render)', () => {
  it('honors event.stage when explicit (codex R3 / A.1)', () => {
    // Candidate is currently at `aboro`. They wrote a note while the
    // accordion was open at `entretien_1` (stage='entretien_1' explicit).
    // Without A.1 this note got bucketed under `aboro` via active-statut
    // replay. With A.1 it lands under entretien_1.
    const events: CandidatureEvent[] = [
      ev({ id: 1, type: 'status_change', statutFrom: 'postule', statutTo: 'entretien_1', stage: 'entretien_1', createdAt: '2026-04-26 09:00:00' }),
      ev({ id: 2, type: 'status_change', statutFrom: 'entretien_1', statutTo: 'aboro', stage: 'aboro', createdAt: '2026-04-27 09:00:00' }),
      ev({ id: 3, type: 'note', contentMd: 'a posteriori on entretien_1', stage: 'entretien_1', createdAt: '2026-04-27 10:00:00' }),
    ]
    render(<CandidateHistoryByStage events={events} documents={[]} currentStatut="aboro" />)
    // The note appears in the entretien_1 group block, not aboro.
    // Using text presence + accordion expansion to verify.
    fireEvent.click(screen.getByText('Entretien 1'))
    expect(screen.getByText('a posteriori on entretien_1')).toBeInTheDocument()
  })

  it('falls back to active-statut replay for legacy events without stage (A.1 fallback)', () => {
    // No explicit `stage`. Note created while active stage was preselectionne.
    const events: CandidatureEvent[] = [
      ev({ id: 1, type: 'status_change', statutFrom: 'postule', statutTo: 'preselectionne', createdAt: '2026-04-25 09:00:00' }),
      ev({ id: 2, type: 'note', contentMd: 'old style note', createdAt: '2026-04-25 10:00:00' }),
    ]
    render(<CandidateHistoryByStage events={events} documents={[]} currentStatut="preselectionne" />)
    // accordion open by default for currentStatut so the note should be visible.
    expect(screen.getByText('old style note')).toBeInTheDocument()
  })

  it('honors doc.event_id → linked event stage (codex R1 / A.1)', () => {
    // Doc uploaded with explicit event_id pointing to the entretien_1
    // status_change. Old code bucketed by time-replay → wrong stage.
    const events: CandidatureEvent[] = [
      ev({ id: 1, type: 'status_change', statutFrom: 'postule', statutTo: 'preselectionne', stage: 'preselectionne', createdAt: '2026-04-26 09:00:00' }),
      ev({ id: 7, type: 'status_change', statutFrom: 'preselectionne', statutTo: 'entretien_1', stage: 'entretien_1', createdAt: '2026-04-27 09:00:00' }),
    ]
    const documents: CandidatureDocument[] = [
      doc({ id: 'd1', display_filename: 'CompteRendu_E1.pdf', created_at: '2026-04-27 09:30:00', event_id: 7 }),
    ]
    render(<CandidateHistoryByStage events={events} documents={documents} currentStatut="entretien_1" />)
    // Doc lands under entretien_1 (current statut, default-open).
    expect(screen.getByText(/CompteRendu_E1\.pdf/)).toBeInTheDocument()
  })
})

describe('Reverse stage iteration + controlled accordion (issues 7+11 / A.2)', () => {
  it('renders the current stage above earlier stages (newest-first order)', () => {
    const events: CandidatureEvent[] = [
      // intake seed (status_change → postule, stage='postule')
      ev({ id: 1, type: 'status_change', statutFrom: null, statutTo: 'postule', stage: 'postule', createdAt: '2026-04-25 09:00:00' }),
      ev({ id: 2, type: 'status_change', statutFrom: 'postule', statutTo: 'preselectionne', stage: 'preselectionne', createdAt: '2026-04-26 09:00:00' }),
    ]
    const { container } = render(
      <CandidateHistoryByStage events={events} documents={[]} currentStatut="preselectionne" />,
    )
    // Each AccordionItem becomes a <div> that renders the badge label
    // inside its trigger. Walk the container's text in document order
    // and check Présélectionné appears before Postulé.
    const html = container.innerHTML
    const presPos = html.indexOf('Présélectionné')
    const postPos = html.indexOf('Postulé')
    expect(presPos).toBeGreaterThan(-1)
    expect(postPos).toBeGreaterThan(-1)
    expect(presPos).toBeLessThan(postPos)
  })

  it('opens the current stage by default (controlled accordion)', () => {
    const events: CandidatureEvent[] = [
      ev({ id: 1, type: 'status_change', statutFrom: 'postule', statutTo: 'preselectionne', stage: 'preselectionne', createdAt: '2026-04-26 09:00:00' }),
      ev({ id: 2, type: 'note', contentMd: 'preselected note', stage: 'preselectionne', createdAt: '2026-04-26 10:00:00' }),
    ]
    render(<CandidateHistoryByStage events={events} documents={[]} currentStatut="preselectionne" />)
    expect(screen.getByText('preselected note')).toBeInTheDocument()
  })

  it('manual expansion survives a currentStatut prop change (eng-review I1 append-only)', () => {
    const events: CandidatureEvent[] = [
      ev({ id: 1, type: 'status_change', statutFrom: 'postule', statutTo: 'preselectionne', stage: 'preselectionne', createdAt: '2026-04-26 09:00:00' }),
      ev({ id: 2, type: 'note', contentMd: 'note in postule', stage: 'postule', createdAt: '2026-04-25 09:00:00' }),
      ev({ id: 3, type: 'note', contentMd: 'note in preselectionne', stage: 'preselectionne', createdAt: '2026-04-26 10:00:00' }),
    ]
    const { rerender } = render(
      <CandidateHistoryByStage events={events} documents={[]} currentStatut="preselectionne" />,
    )
    // Manually expand Postulé.
    fireEvent.click(screen.getByText('Postulé'))
    expect(screen.getByText('note in postule')).toBeInTheDocument()

    // SSE arrives: status advanced to entretien_1 (simulated by prop change).
    const advancedEvents: CandidatureEvent[] = [
      ...events,
      ev({ id: 4, type: 'status_change', statutFrom: 'preselectionne', statutTo: 'entretien_1', stage: 'entretien_1', createdAt: '2026-04-27 09:00:00' }),
    ]
    rerender(
      <CandidateHistoryByStage events={advancedEvents} documents={[]} currentStatut="entretien_1" />,
    )

    // Postulé block STILL OPEN — append-only contract.
    expect(screen.getByText('note in postule')).toBeInTheDocument()
    // Entretien 1 trigger now in the DOM (could appear in multiple
    // elements — badge, header — so use getAllByText).
    expect(screen.getAllByText('Entretien 1').length).toBeGreaterThan(0)
  })
})

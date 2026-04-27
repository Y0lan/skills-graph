// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import DocumentStageReassignDialog from '../document-stage-reassign-dialog'
import type { CandidatureEvent, CandidatureDocument } from '@/hooks/use-candidate-data'

afterEach(() => cleanup())

function ev(overrides: Partial<CandidatureEvent>): CandidatureEvent {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 1e9),
    type: overrides.type ?? 'status_change',
    statutFrom: overrides.statutFrom ?? null,
    statutTo: overrides.statutTo ?? null,
    notes: null,
    contentMd: null,
    emailSnapshot: null,
    createdBy: 'test',
    createdAt: overrides.createdAt ?? '2026-04-27 10:00:00',
    stage: overrides.stage ?? null,
    updatedAt: null,
  }
}

const baseDoc: CandidatureDocument = {
  id: 'doc-1',
  type: 'cv',
  filename: 'cv.pdf',
  display_filename: 'CV.pdf',
  uploaded_by: 'test',
  created_at: '2026-04-27 09:30:00',
  deleted_at: null,
  event_id: null,
}

describe('DocumentStageReassignDialog filter (A.9 + codex R4)', () => {
  it('only renders stages the candidate has reached', () => {
    const events: CandidatureEvent[] = [
      ev({ statutFrom: 'postule', statutTo: 'preselectionne' }),
    ]
    render(
      <DocumentStageReassignDialog
        open
        onOpenChange={() => {}}
        doc={baseDoc}
        events={events}
        currentStatut="preselectionne"
        onReassigned={() => {}}
      />,
    )
    // Postulé + Présélectionné present.
    expect(screen.getByText('Postulé')).toBeInTheDocument()
    expect(screen.getByText('Présélectionné')).toBeInTheDocument()
    // Future stages absent.
    expect(screen.queryByText('Skill Radar envoyé')).toBeNull()
    expect(screen.queryByText('Entretien 1')).toBeNull()
    expect(screen.queryByText('Embauché')).toBeNull()
  })

  it('keeps reverted stages visible (codex R4)', () => {
    // Candidate went postule → preselectionne → entretien_1 → reverted to preselectionne.
    const events: CandidatureEvent[] = [
      ev({ statutFrom: 'postule', statutTo: 'preselectionne' }),
      ev({ statutFrom: 'preselectionne', statutTo: 'entretien_1' }),
      ev({ statutFrom: 'entretien_1', statutTo: 'preselectionne' }),
    ]
    render(
      <DocumentStageReassignDialog
        open
        onOpenChange={() => {}}
        doc={baseDoc}
        events={events}
        currentStatut="preselectionne"
        onReassigned={() => {}}
      />,
    )
    expect(screen.getByText('Entretien 1')).toBeInTheDocument()
  })

  it('defaults to currentStatut when doc has no event_id (B1 default-stage)', () => {
    const events: CandidatureEvent[] = [
      ev({ statutFrom: 'postule', statutTo: 'preselectionne' }),
    ]
    render(
      <DocumentStageReassignDialog
        open
        onOpenChange={() => {}}
        doc={baseDoc}
        events={events}
        currentStatut="preselectionne"
        onReassigned={() => {}}
      />,
    )
    const presRadio = screen.getByDisplayValue('preselectionne') as HTMLInputElement
    expect(presRadio.checked).toBe(true)
  })

  it('defaults to the doc\'s linked event stage when event_id is set (B1)', () => {
    const events: CandidatureEvent[] = [
      ev({ id: 1, statutFrom: 'postule', statutTo: 'preselectionne' }),
      ev({ id: 7, statutFrom: 'preselectionne', statutTo: 'entretien_1', stage: 'entretien_1' }),
    ]
    const docAtE1: CandidatureDocument = { ...baseDoc, id: 'd2', event_id: 7 }
    render(
      <DocumentStageReassignDialog
        open
        onOpenChange={() => {}}
        doc={docAtE1}
        events={events}
        currentStatut="entretien_1"
        onReassigned={() => {}}
      />,
    )
    const e1Radio = screen.getByDisplayValue('entretien_1') as HTMLInputElement
    expect(e1Radio.checked).toBe(true)
  })

  it('still shows postule for a brand new candidate with no events', () => {
    // postule is always in the reached set (intake state). A fresh
    // candidate sees only postule + currentStatut.
    render(
      <DocumentStageReassignDialog
        open
        onOpenChange={() => {}}
        doc={baseDoc}
        events={[]}
        currentStatut="postule"
        onReassigned={() => {}}
      />,
    )
    expect(screen.getByText('Postulé')).toBeInTheDocument()
    expect(screen.queryByText('Présélectionné')).toBeNull()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'

import RevertCountdown from '../revert-countdown'

afterEach(() => cleanup())

const baseProps = {
  // 2 minutes ago, well within the 10-min window
  lastStatusChangeAt: new Date(Date.now() - 2 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
  emailState: 'scheduled' as const,
  disabled: false,
  sendingNow: false,
  revertingStatus: false,
  onSendNow: () => {},
  onRevert: () => {},
}

describe('RevertCountdown — dynamic label (A.4 / D-copy-3)', () => {
  it('renders "Revenir à «<prev label>»" when previousStatut is provided', () => {
    render(<RevertCountdown {...baseProps} previousStatut="postule" />)
    expect(screen.getByText(/Revenir à/)).toBeInTheDocument()
    expect(screen.getByText(/«\s*Postulé\s*»/)).toBeInTheDocument()
    expect(screen.queryByText('Annuler la transition')).toBeNull()
  })

  it('falls back to "Annuler le passage" when previousStatut is null', () => {
    render(<RevertCountdown {...baseProps} previousStatut={null} />)
    expect(screen.getByText('Annuler le passage')).toBeInTheDocument()
  })

  it('falls back when previousStatut is omitted', () => {
    render(<RevertCountdown {...baseProps} />)
    expect(screen.getByText('Annuler le passage')).toBeInTheDocument()
  })

  it('exposes a full aria-label on the revert button (truncation safety)', () => {
    render(<RevertCountdown {...baseProps} previousStatut="skill_radar_envoye" />)
    const btn = screen.getByRole('button', { name: /Revenir à Skill Radar envoyé/ })
    expect(btn).toBeInTheDocument()
  })

  it('shows "Annulation…" while reverting (preserves existing behavior)', () => {
    render(<RevertCountdown {...baseProps} previousStatut="postule" revertingStatus />)
    expect(screen.getByText('Annulation…')).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import PipelineCandidatureRow from '../pipeline-candidature-row'

afterEach(() => cleanup())

const baseProps = {
  candidateName: 'Pierre LEFEVRE',
  posteTitre: 'Architecte SI',
  canal: 'sinapse_nc',
  canalLabel: 'sinapse.nc',
  createdAtLabel: '20 avr.',
  hasCv: true,
  hasLettre: false,
  evaluationSubmitted: false,
  softSkillAlertCount: 0,
}

describe('<PipelineCandidatureRow>', () => {
  it('renders name and poste meta without preview', () => {
    render(<PipelineCandidatureRow {...baseProps} preview={null} />)
    expect(screen.getByText('Pierre LEFEVRE')).toBeInTheDocument()
    expect(screen.getByText('Architecte SI')).toBeInTheDocument()
    expect(screen.getByText('sinapse.nc')).toBeInTheDocument()
  })

  it('renders headline with location, role, experience when preview provided', () => {
    render(
      <PipelineCandidatureRow
        {...baseProps}
        preview={{
          city: 'Nouméa',
          country: 'NC',
          currentRole: 'Architecte SI',
          currentCompany: 'Sinapse',
          totalExperienceYears: 18,
          noticePeriodDays: 30,
          topSkills: [],
        }}
      />,
    )
    expect(screen.getByText('Nouméa, NC')).toBeInTheDocument()
    expect(screen.getByText('Architecte SI @ Sinapse')).toBeInTheDocument()
    expect(screen.getByText(/18 ans d'exp\./)).toBeInTheDocument()
    expect(screen.getByText(/préavis 30j/)).toBeInTheDocument()
  })

  it('renders top skills pills when preview has skills', () => {
    render(
      <PipelineCandidatureRow
        {...baseProps}
        preview={{
          city: null, country: null, currentRole: null, currentCompany: null,
          totalExperienceYears: null, noticePeriodDays: null,
          topSkills: [
            { skillId: 'java', skillLabel: 'Java', rating: 4 },
            { skillId: 'spring', skillLabel: 'Spring', rating: 4 },
            { skillId: 'aws', skillLabel: 'AWS', rating: 3 },
          ],
        }}
      />,
    )
    expect(screen.getByText('Java')).toBeInTheDocument()
    expect(screen.getByText('Spring')).toBeInTheDocument()
    expect(screen.getByText('AWS')).toBeInTheDocument()
  })

  it('falls back to the legacy single-line layout when preview is null', () => {
    render(
      <PipelineCandidatureRow
        {...baseProps}
        preview={null}
      />,
    )
    // No headline or skills (no preview data)
    expect(screen.queryByText('Nouméa, NC')).not.toBeInTheDocument()
    expect(screen.queryByText('Java')).not.toBeInTheDocument()
    // But still shows poste + canal (legacy meta)
    expect(screen.getByText('Architecte SI')).toBeInTheDocument()
  })

  it('shows soft-skill alert badge when count > 0', () => {
    render(<PipelineCandidatureRow {...baseProps} softSkillAlertCount={2} preview={null} />)
    expect(screen.getByText('Soft skills')).toBeInTheDocument()
  })

  it('shows CV and LM badges based on flags', () => {
    const { unmount } = render(
      <PipelineCandidatureRow {...baseProps} hasCv={true} hasLettre={true} preview={null} />,
    )
    expect(screen.getByText('CV')).toBeInTheDocument()
    expect(screen.getByText('LM')).toBeInTheDocument()
    unmount()

    render(
      <PipelineCandidatureRow {...baseProps} hasCv={false} hasLettre={false} preview={null} />,
    )
    expect(screen.queryByText('CV')).not.toBeInTheDocument()
    expect(screen.queryByText('LM')).not.toBeInTheDocument()
  })
})

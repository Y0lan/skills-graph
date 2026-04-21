// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import CandidateProfileCard, { type AiProfile } from '../candidate-profile-card'
import type { ProfileField } from '../field-provenance-tooltip'

afterEach(() => cleanup())

function pf<T>(value: T | null): ProfileField<T> {
  return {
    value,
    runId: null,
    sourceDoc: null,
    confidence: null,
    humanLockedAt: null,
    humanLockedBy: null,
  }
}

function makeProfile(overrides: Partial<AiProfile> = {}): AiProfile {
  return {
    identity: { fullName: pf<string>('Pierre LEFEVRE') },
    contact: {
      email: pf<string>('pierre@example.com'),
      phone: pf<string>(null),
      linkedinUrl: pf<string>(null),
      githubUrl: pf<string>(null),
      portfolioUrl: pf<string>(null),
      otherLinks: pf<string[]>(null),
    },
    location: {
      city: pf<string>('Nouméa'),
      country: pf<string>('NC'),
      willingToRelocate: pf<boolean>(null),
      remotePreference: pf<string>(null),
      drivingLicense: pf<string>(null),
    },
    education: [],
    experience: [],
    currentRole: {
      company: pf<string>('Sinapse'),
      role: pf<string>('Architecte SI'),
      isCurrentlyEmployed: pf<boolean>(true),
      startedAt: pf<string>('2022'),
    },
    totalExperienceYears: pf<number>(18),
    languages: [],
    certifications: [],
    publications: [],
    openSource: { githubUsername: pf<string>(null), notableProjects: [] },
    availability: { noticePeriodDays: pf<number>(null), earliestStart: pf<string>(null) },
    softSignals: {
      summaryFr: pf<string>(null),
      motivations: pf<string[]>(null),
      interests: pf<string[]>(null),
      valuesMentioned: pf<string[]>(null),
    },
    additionalFacts: [],
    ...overrides,
  }
}

describe('<CandidateProfileCard>', () => {
  it('renders empty state when profile is null', () => {
    render(<CandidateProfileCard candidateId="c1" profile={null} />)
    expect(screen.getByText(/Aucune extraction CV/i)).toBeInTheDocument()
  })

  it('renders hero with name, current role, experience badge', () => {
    render(<CandidateProfileCard candidateId="c1" profile={makeProfile()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pierre LEFEVRE')
    expect(screen.getByText(/Architecte SI.*@ Sinapse/)).toBeInTheDocument()
    expect(screen.getByText(/18 ans d'exp\./)).toBeInTheDocument()
  })

  it('shows headline location chip', () => {
    render(<CandidateProfileCard candidateId="c1" profile={makeProfile()} />)
    expect(screen.getByText('Nouméa, NC')).toBeInTheDocument()
  })

  it('renders top skills strip when topSkills provided', () => {
    render(
      <CandidateProfileCard
        candidateId="c1"
        profile={makeProfile()}
        topSkills={[
          { skillId: 'java', skillLabel: 'Java', rating: 4 },
          { skillId: 'spring', skillLabel: 'Spring', rating: 4 },
        ]}
      />,
    )
    expect(screen.getByText(/Top compétences/i)).toBeInTheDocument()
    expect(screen.getByText('Java')).toBeInTheDocument()
    expect(screen.getByText('Spring')).toBeInTheDocument()
  })

  it('hides top skills strip when none given', () => {
    render(<CandidateProfileCard candidateId="c1" profile={makeProfile()} />)
    expect(screen.queryByText(/Top compétences/i)).not.toBeInTheDocument()
  })

  it('hides empty sidebar cards (Langues, Certifications, etc.)', () => {
    render(<CandidateProfileCard candidateId="c1" profile={makeProfile()} />)
    expect(screen.queryByText(/^Langues/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Certifications/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Publications/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Disponibilité/)).not.toBeInTheDocument()
  })

  it('shows Langues sidebar card when languages exist', () => {
    const profile = makeProfile({
      languages: [
        { language: 'Français', level: 'natif', certification: null },
        { language: 'Anglais', level: 'courant', certification: null },
      ],
    })
    render(<CandidateProfileCard candidateId="c1" profile={profile} />)
    expect(screen.getByText(/Langues \(2\)/)).toBeInTheDocument()
    expect(screen.getByText('Français')).toBeInTheDocument()
    expect(screen.getByText('Anglais')).toBeInTheDocument()
  })

  it('shows Expérience section when experience entries exist', () => {
    const profile = makeProfile({
      experience: [
        {
          company: 'Sinapse',
          role: 'Architecte SI',
          start: '2022',
          end: null,
          durationMonths: null,
          location: 'Nouméa',
          description: 'Lead de la modernisation',
          technologies: ['Java', 'Spring'],
        },
      ],
    })
    render(<CandidateProfileCard candidateId="c1" profile={profile} />)
    expect(screen.getByText(/Expérience \(1\)/)).toBeInTheDocument()
    expect(screen.getByText('Lead de la modernisation')).toBeInTheDocument()
  })

  it('renders Autres infos accordion when additionalFacts present', () => {
    const profile = makeProfile({
      additionalFacts: [{ label: 'Hobby', value: 'Vélo', source: 'cv' }],
    })
    render(<CandidateProfileCard candidateId="c1" profile={profile} />)
    expect(screen.getByText(/Autres infos \(1\)/)).toBeInTheDocument()
  })

  it('falls back to "Candidat" when name is missing', () => {
    const profile = makeProfile({ identity: { fullName: pf<string>(null) } })
    render(<CandidateProfileCard candidateId="c1" profile={profile} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Candidat')
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogContext, type CatalogContextValue } from '@/lib/catalog-context'
import type { SkillCategory } from '@/data/skill-catalog'
import type { RatingLevel } from '@/data/rating-scale'
import SkillFormWizard from '../skill-form-wizard'

// --- Mocks ---

// Mock useAutosave to avoid network calls
vi.mock('@/hooks/use-autosave', () => ({
  useAutosave: () => ({ saveStatus: 'idle' as const, saveError: undefined }),
}))

// jsdom does not implement scrollTo
beforeAll(() => {
  window.scrollTo = vi.fn()
})

afterEach(() => {
  cleanup()
})

// --- Test data ---

const testCategories: SkillCategory[] = [
  {
    id: 'core-engineering',
    label: 'Socle Technique',
    emoji: '\u{1F4BB}',
    skills: [
      { id: 'java', label: 'Java', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/a' }] },
      { id: 'typescript', label: 'TypeScript', categoryId: 'core-engineering', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/a' }] },
    ],
  },
  {
    id: 'backend-integration',
    label: 'Backend & Services',
    emoji: '\u{1F527}',
    skills: [
      { id: 'spring-boot', label: 'Spring Boot', categoryId: 'backend-integration', descriptors: [{ level: 0, label: 'Inconnu', description: 'N/a' }] },
    ],
  },
]

const testRatingScale: RatingLevel[] = [
  { value: 0, label: 'Inconnu', shortLabel: '0', description: 'N/a' },
  { value: 1, label: 'Notions', shortLabel: '1', description: 'N/a' },
  { value: 2, label: 'Guide', shortLabel: '2', description: 'N/a' },
  { value: 3, label: 'Autonome', shortLabel: '3', description: 'N/a' },
  { value: 4, label: 'Avance', shortLabel: '4', description: 'N/a' },
  { value: 5, label: 'Expert', shortLabel: '5', description: 'N/a' },
]

const catalogValue: CatalogContextValue = {
  categories: testCategories,
  ratingScale: testRatingScale,
  calibrationPrompts: {},
  allSkills: testCategories.flatMap((c) => c.skills),
  skillById: new Map(testCategories.flatMap((c) => c.skills).map((s) => [s.id, s])),
  categoryById: new Map(testCategories.map((c) => [c.id, c])),
  loading: false,
}

const emptyInitialData = {
  ratings: {},
  experience: {},
  skippedCategories: [] as string[],
  declinedCategories: [] as string[],
}

function renderWizard(props: Partial<Parameters<typeof SkillFormWizard>[0]> = {}) {
  const defaultProps = {
    slug: 'test-user',
    initialData: emptyInitialData,
    onSubmit: vi.fn(),
    submitting: false,
  }
  return render(
    <CatalogContext.Provider value={catalogValue}>
      <SkillFormWizard {...defaultProps} {...props} />
    </CatalogContext.Provider>,
  )
}

// --- Tests ---

describe('SkillFormWizard pre-fill behaviour', () => {
  it('shows AI info banner when aiSuggestions are provided', () => {
    renderWizard({
      aiSuggestions: { java: 3, typescript: 4 },
      initialData: {
        ratings: { java: 3, typescript: 4 },
        experience: {},
        skippedCategories: [],
        declinedCategories: [],
      },
    })

    expect(screen.getByText(/2 comp.tences pr..?-remplies/)).toBeInTheDocument()
  })

  it('does not show AI info banner when no suggestions', () => {
    renderWizard()

    expect(screen.queryByText(/pr..?-remplies/)).not.toBeInTheDocument()
  })

  it('shows only role categories by default when roleCategories provided', () => {
    renderWizard({ roleCategories: ['backend-integration'] })

    // With roleCategories=['backend-integration'], only Backend should be visible.
    // Non-role categories are hidden by default (pole filtering).
    const buttons = screen.getAllByRole('button')
    const backendPill = buttons.find((btn) => btn.textContent?.includes('Backend'))
    const soclePill = buttons.find((btn) => btn.textContent?.includes('Socle'))

    expect(backendPill).toBeDefined()
    // Socle is a non-role category, so it should be hidden by default
    expect(soclePill).toBeUndefined()
  })

  it('works normally without any pre-fill props (regression)', () => {
    renderWizard()

    // Wizard renders without errors
    // Progress bar shows all categories + review step
    expect(screen.getByText(/Progression/)).toBeInTheDocument()
    // Both category short labels appear in the progress bar
    expect(screen.getByText('Socle')).toBeInTheDocument()
    expect(screen.getByText('Backend')).toBeInTheDocument()
  })

  it('keeps non-required categories optional but easy to open from review', async () => {
    const user = userEvent.setup()
    renderWizard({
      roleCategories: ['core-engineering'],
      nonPoleGroups: [
        {
          pole: 'transverse',
          label: 'Compétences transverses',
          categories: [testCategories[1]],
        },
      ],
      showCoverageSummary: true,
      initialData: {
        ratings: { java: 3, typescript: 3 },
        experience: {},
        skippedCategories: [],
        declinedCategories: [],
      },
    })

    expect(screen.getByText('Obligatoire')).toBeInTheDocument()
    expect(screen.getByText('Radar complet')).toBeInTheDocument()
    expect(screen.getByText('2/2 compétences')).toBeInTheDocument()
    expect(screen.getByText('2/3 compétences')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /compétences transverses/i }))

    expect(screen.getByText('Backend & Services')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tout noter/i })).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CatalogContext, type CatalogContextValue } from '@/lib/catalog-context'
import type { SkillCategory } from '@/data/skill-catalog'
import FormPage from '../form-page'

// --- Mocks ---

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Mock useAutosave to avoid network calls in integration tests
vi.mock('@/hooks/use-autosave', () => ({
  useAutosave: () => ({ saveStatus: 'idle', saveError: undefined }),
}))

const mockFetchRatings = vi.fn()
const mockSubmitRatings = vi.fn()
const mockResetRatings = vi.fn()
vi.mock('@/hooks/use-ratings', () => ({
  useRatings: () => ({
    data: { ratings: {}, experience: {}, skippedCategories: [], submittedAt: null },
    loading: false,
    error: null,
    fetchRatings: mockFetchRatings,
    submitRatings: mockSubmitRatings,
    resetRatings: mockResetRatings,
  }),
}))

vi.mock('@/data/team-roster', () => ({
  teamMembers: [
    { slug: 'test-user', name: 'Test User', role: 'Dev', team: 'Engineering' },
  ],
  findMember: (slug: string) =>
    slug === 'test-user'
      ? { slug: 'test-user', name: 'Test User', role: 'Dev', team: 'Engineering' }
      : undefined,
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null }),
  },
}))

// Mock sonner — use vi.hoisted so the fn is available when vi.mock is hoisted
const { mockToastSuccess } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess },
}))

// Minimal catalog with 2 categories (1 skill each) for fast tests
const testCategories: SkillCategory[] = [
  {
    id: 'cat-1',
    label: 'Category 1',
    emoji: '🔧',
    skills: [
      { id: 'skill-1', label: 'Skill 1', categoryId: 'cat-1', descriptors: [] },
    ],
  },
  {
    id: 'cat-2',
    label: 'Category 2',
    emoji: '🎨',
    skills: [
      { id: 'skill-2', label: 'Skill 2', categoryId: 'cat-2', descriptors: [] },
    ],
  },
]

const catalogValue: CatalogContextValue = {
  categories: testCategories,
  ratingScale: [
    { value: 0, label: 'Non évalué', shortLabel: 'N/A', description: '' },
    { value: 1, label: 'Débutant', shortLabel: 'Déb', description: '' },
    { value: 2, label: 'Intermédiaire', shortLabel: 'Int', description: '' },
    { value: 3, label: 'Avancé', shortLabel: 'Ava', description: '' },
  ],
  calibrationPrompts: {},
  allSkills: testCategories.flatMap((c) => c.skills),
  skillById: new Map(testCategories.flatMap((c) => c.skills).map((s) => [s.id, s])),
  categoryById: new Map(testCategories.map((c) => [c.id, c])),
  loading: false,
}

function renderFormPage() {
  return render(
    <MemoryRouter initialEntries={['/form/test-user']}>
      <CatalogContext.Provider value={catalogValue}>
        <Routes>
          <Route path="/form/:slug" element={<FormPage />} />
        </Routes>
      </CatalogContext.Provider>
    </MemoryRouter>,
  )
}

// The header submit button has a data-slot="button" and contains Send icon + "Soumettre"
// The AlertDialog also renders a "Soumettre" button even when closed (Radix portal)
// Use data-testid to disambiguate
function findHeaderSubmitButton() {
  return screen.getByTestId('header-submit-btn')
}

describe('FormPage — submit button & dialog', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchRatings.mockResolvedValue({
      ratings: {},
      experience: {},
      skippedCategories: [],
      submittedAt: null,
    })
  })

  it('renders the submit button on step 1 (non-review)', async () => {
    renderFormPage()
    await waitFor(() => {
      expect(findHeaderSubmitButton()).toBeInTheDocument()
    })
  })

  it('shows confirmation dialog when clicking submit on non-review step', async () => {
    const user = userEvent.setup()
    renderFormPage()

    await waitFor(() => {
      expect(findHeaderSubmitButton()).toBeInTheDocument()
    })
    await user.click(findHeaderSubmitButton())

    // Dialog should appear
    expect(await screen.findByText(/soumettre sans vérifier/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /annuler/i })).toBeInTheDocument()
  })

  it('cancel on confirmation dialog closes it without submitting', async () => {
    const user = userEvent.setup()
    renderFormPage()

    await waitFor(() => {
      expect(findHeaderSubmitButton()).toBeInTheDocument()
    })
    await user.click(findHeaderSubmitButton())

    // Dialog visible
    const cancelBtn = await screen.findByRole('button', { name: /annuler/i })
    await user.click(cancelBtn)

    // Dialog should close, no submit called
    await waitFor(() => {
      expect(screen.queryByText(/soumettre sans vérifier/i)).not.toBeInTheDocument()
    })
    expect(mockSubmitRatings).not.toHaveBeenCalled()
  })

  it('confirming dialog calls onSubmit', async () => {
    mockSubmitRatings.mockResolvedValue({ ratings: {}, experience: {}, skippedCategories: [] })
    const user = userEvent.setup()
    renderFormPage()

    await waitFor(() => {
      expect(findHeaderSubmitButton()).toBeInTheDocument()
    })
    await user.click(findHeaderSubmitButton())

    // Wait for dialog, then click the dialog confirm action
    const dialogTitle = await screen.findByText(/soumettre sans vérifier/i)
    // The AlertDialogAction is the last "Soumettre" button in the dialog
    const dialog = dialogTitle.closest('[role="alertdialog"]')
    const confirmBtn = dialog
      ? dialog.querySelector('button:last-of-type')
      : screen.getAllByRole('button', { name: /soumettre/i }).pop()
    await user.click(confirmBtn!)

    await waitFor(() => {
      expect(mockSubmitRatings).toHaveBeenCalled()
    })
  })

  it('shows toast on successful submit', async () => {
    mockSubmitRatings.mockResolvedValue({ ratings: {}, experience: {}, skippedCategories: [] })
    const user = userEvent.setup()
    renderFormPage()

    await waitFor(() => {
      expect(findHeaderSubmitButton()).toBeInTheDocument()
    })
    await user.click(findHeaderSubmitButton())

    const dialogTitle = await screen.findByText(/soumettre sans vérifier/i)
    const dialog = dialogTitle.closest('[role="alertdialog"]')
    const confirmBtn = dialog
      ? dialog.querySelector('button:last-of-type')
      : screen.getAllByRole('button', { name: /soumettre/i }).pop()
    await user.click(confirmBtn!)

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Évaluation soumise avec succès !')
    })
  })

  it('renders page with submit and reset buttons visible', async () => {
    renderFormPage()

    await waitFor(() => {
      expect(findHeaderSubmitButton()).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /réinitialiser/i })).toBeInTheDocument()
    })
  })
})

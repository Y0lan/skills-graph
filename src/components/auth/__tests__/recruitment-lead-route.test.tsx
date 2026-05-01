// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RecruitmentLeadRoute } from '../recruitment-lead-route'

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: mockUseSession,
  },
}))

afterEach(() => {
  cleanup()
  mockUseSession.mockReset()
})

function renderRoute(slug: string | null) {
  mockUseSession.mockReturnValue({
    isPending: false,
    data: slug
      ? { user: { slug } }
      : null,
  })

  return render(
    <MemoryRouter initialEntries={['/recruit/pipeline']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route
          path="/recruit/pipeline"
          element={
            <RecruitmentLeadRoute>
              <p>Recruitment page</p>
            </RecruitmentLeadRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RecruitmentLeadRoute', () => {
  it('renders recruitment content for an allowed lead', () => {
    renderRoute('yolan-maldonado')
    expect(screen.getByText('Recruitment page')).toBeInTheDocument()
  })

  it('blocks authenticated non-leads before rendering recruitment content', () => {
    renderRoute('someone-else')
    expect(screen.queryByText('Recruitment page')).not.toBeInTheDocument()
    expect(screen.getByText('Accès réservé aux responsables recrutement')).toBeInTheDocument()
  })

  it('redirects unauthenticated users to home', () => {
    renderRoute(null)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })
})

import { lazy, Suspense, Component, useEffect } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/providers/theme-provider'
import { CatalogProvider } from '@/providers/catalog-provider'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { useFullRoster } from '@/hooks/use-full-roster'
import { Toaster } from '@/components/ui/sonner'
import Footer from '@/components/footer'

const LandingPage = lazy(() => import('@/pages/landing-page'))
const FormPage = lazy(() => import('@/pages/form-page'))
const DashboardPage = lazy(() => import('@/pages/dashboard-page'))
const RecruitPage = lazy(() => import('@/pages/recruit-page'))
const CandidateDetailPage = lazy(() => import('@/pages/candidate-detail-page'))
const CandidateFormPage = lazy(() => import('@/pages/candidate-form-page'))
const RecruitPipelinePage = lazy(() => import('@/pages/recruit-pipeline-page'))
const ReportCampaignPage = lazy(() => import('@/pages/report-campaign-page'))
const ReportComparisonPage = lazy(() => import('@/pages/report-comparison-page'))
const MentionsLegalesPage = lazy(() => import('@/pages/mentions-legales'))
const ConfidentialitePage = lazy(() => import('@/pages/confidentialite'))

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <CatalogProvider>
        <TooltipProvider>
          <ScrollToTop />
          <FullRosterLoader />
          <ErrorBoundaryWrapper>
            <Suspense
              fallback={
                <div className="flex min-h-screen items-center justify-center">
                  <p className="text-muted-foreground">Chargement...</p>
                </div>
              }
            >
              <div className="flex min-h-screen flex-col">
              <div className="flex-1">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/form/:slug" element={<ProtectedRoute><FormPage /></ProtectedRoute>} />
                <Route path="/dashboard/:slug?" element={<ProtectedRoute checkOwnership={false}><DashboardPage /></ProtectedRoute>} />
                <Route path="/recruit" element={<ProtectedRoute checkOwnership={false}><RecruitPage /></ProtectedRoute>} />
                <Route path="/recruit/pipeline" element={<ProtectedRoute checkOwnership={false}><RecruitPipelinePage /></ProtectedRoute>} />
                <Route path="/recruit/reports/campaign" element={<ProtectedRoute checkOwnership={false}><ReportCampaignPage /></ProtectedRoute>} />
                <Route path="/recruit/reports/comparison/:posteId" element={<ProtectedRoute checkOwnership={false}><ReportComparisonPage /></ProtectedRoute>} />
                <Route path="/recruit/:id" element={<ProtectedRoute checkOwnership={false}><CandidateDetailPage /></ProtectedRoute>} />
                <Route path="/evaluate/:id" element={<CandidateFormPage />} />
                <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
                <Route path="/confidentialite" element={<ConfidentialitePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </div>
              <Footer />
              </div>
            </Suspense>
          </ErrorBoundaryWrapper>
        </TooltipProvider>
        <Toaster position="bottom-left" />
        </CatalogProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

function FullRosterLoader() { useFullRoster(); return null }

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pathname])
  return null
}

function ErrorBoundaryWrapper({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Recharger la page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default App

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
const PosteShortlistPage = lazy(() => import('@/pages/poste-shortlist-page'))
const ReportCampaignPage = lazy(() => import('@/pages/report-campaign-page'))
const ReportComparisonPage = lazy(() => import('@/pages/report-comparison-page'))
const RecruitFunnelPage = lazy(() => import('@/pages/recruit-funnel-page'))
const EquipePage = lazy(() => import('@/pages/equipe-page'))
const MentionsLegalesPage = lazy(() => import('@/pages/mentions-legales'))
const ConfidentialitePage = lazy(() => import('@/pages/confidentialite'))

// Vite fires this event when a dynamically-imported chunk fails to load —
// the canonical signal of a stale-deploy chunk reference. Reload before the
// error reaches React.
//
// The guard stores the LAST reload timestamp (not just a boolean). A second
// stale-chunk hit within RELOAD_COOLDOWN_MS is treated as a genuine missing
// chunk (don't reload again, would loop). After the cooldown, a fresh stale-
// chunk hit triggers a fresh reload — this fixes the case where the user
// stays in the SPA across two deploys and the first auto-reload's guard
// would otherwise block the second.
const STALE_CHUNK_RELOAD_KEY = 'stale-chunk-reload-attempted'
const RELOAD_COOLDOWN_MS = 5_000

function shouldAutoReload(): boolean {
  const ts = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? '0')
  return !ts || (Date.now() - ts) > RELOAD_COOLDOWN_MS
}

function markReload(): void {
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()))
}

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    if (shouldAutoReload()) {
      markReload()
      window.location.reload()
    }
  })
}

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
                <Route path="/equipe" element={<ProtectedRoute checkOwnership={false}><EquipePage /></ProtectedRoute>} />
                <Route path="/dashboard/:slug?" element={<ProtectedRoute checkOwnership={false}><DashboardPage /></ProtectedRoute>} />
                <Route path="/recruit" element={<ProtectedRoute checkOwnership={false}><RecruitPage /></ProtectedRoute>} />
                <Route path="/recruit/pipeline" element={<ProtectedRoute checkOwnership={false}><RecruitPipelinePage /></ProtectedRoute>} />
                <Route path="/recruit/reports/campaign" element={<ProtectedRoute checkOwnership={false}><ReportCampaignPage /></ProtectedRoute>} />
                <Route path="/recruit/reports/comparison/:posteId" element={<ProtectedRoute checkOwnership={false}><ReportComparisonPage /></ProtectedRoute>} />
                <Route path="/recruit/postes/:posteId/shortlist" element={<ProtectedRoute checkOwnership={false}><PosteShortlistPage /></ProtectedRoute>} />
                <Route path="/recruit/funnel" element={<ProtectedRoute checkOwnership={false}><RecruitFunnelPage /></ProtectedRoute>} />
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

// Stale chunk reference after a deploy: index.html is fresh but the in-memory
// SPA still references chunk hashes from the previous build. The browser hits
// 404 when lazy() tries to fetch them. Auto-reload, with a cooldown so a
// genuinely missing chunk doesn't infinite-loop.
function isStaleChunkError(error: Error): boolean {
  const msg = (error?.message ?? '').toLowerCase()
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading chunk') ||
    /loading chunk \d+ failed/i.test(error?.message ?? '')
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; reloadBlocked: boolean }> {
  state: { error: Error | null; reloadBlocked: boolean } = { error: null, reloadBlocked: false }

  static getDerivedStateFromError(error: Error) {
    return { error, reloadBlocked: false }
  }

  componentDidCatch(error: Error) {
    if (!isStaleChunkError(error)) return
    if (shouldAutoReload()) {
      markReload()
      window.location.reload()
    } else {
      // Cooldown active — second stale-chunk hit means the chunk is genuinely
      // missing (CDN drift, partial deploy). Show a real error UI with a
      // manual retry instead of an infinite "Mise à jour…" spinner.
      this.setState({ reloadBlocked: true })
    }
  }

  render() {
    if (this.state.error) {
      // Auto-reload in flight — neutral placeholder until the page navigates.
      if (isStaleChunkError(this.state.error) && !this.state.reloadBlocked) {
        return (
          <div className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-muted-foreground">Mise à jour de l'application…</p>
          </div>
        )
      }
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

import { lazy, Suspense, Component } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/providers/theme-provider'
import { CatalogProvider } from '@/providers/catalog-provider'
import { ProtectedRoute } from '@/components/auth/protected-route'

const FormPage = lazy(() => import('@/pages/form-page'))
const DashboardPage = lazy(() => import('@/pages/dashboard-page'))

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <CatalogProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex min-h-screen items-center justify-center">
                  <p className="text-muted-foreground">Chargement...</p>
                </div>
              }
            >
              <Routes>
                <Route path="/form/:slug" element={<ProtectedRoute><FormPage /></ProtectedRoute>} />
                <Route path="/dashboard/:slug?" element={<DashboardPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </TooltipProvider>
        </CatalogProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
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

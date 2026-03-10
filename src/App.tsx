import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/providers/theme-provider'
import { CatalogProvider } from '@/providers/catalog-provider'

const FormPage = lazy(() => import('@/pages/form-page'))
const DashboardPage = lazy(() => import('@/pages/dashboard-page'))

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <CatalogProvider>
        <TooltipProvider>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center">
                <p className="text-muted-foreground">Chargement...</p>
              </div>
            }
          >
            <Routes>
              <Route path="/form/:slug" element={<FormPage />} />
              <Route path="/dashboard/:slug?" element={<DashboardPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </TooltipProvider>
        </CatalogProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App

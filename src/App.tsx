import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import ThemeToggle from '@/components/theme-toggle'

const FormPage = lazy(() => import('@/pages/form-page'))
const DashboardPage = lazy(() => import('@/pages/dashboard-page'))

function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center">
              <p className="text-muted-foreground">Loading...</p>
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
    </BrowserRouter>
  )
}

export default App

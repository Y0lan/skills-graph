import type { ReactNode } from 'react'
import ThemeToggle from '@/components/theme-toggle'

interface AppHeaderProps {
  headerActions?: ReactNode
  headerNav?: ReactNode
}

export default function AppHeader({ headerActions, headerNav }: AppHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-2">
          {headerActions}
        </div>
        <div className="flex items-center gap-2">
          {headerNav}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

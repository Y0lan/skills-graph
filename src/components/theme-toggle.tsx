import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

// Hydration-safe mounted check without useEffect+setState
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (!mounted) return <Button variant="ghost" size="icon" className="relative h-9 w-9" disabled />

  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className="relative h-9 w-9"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all duration-300 ease-out dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all duration-300 ease-out dark:rotate-0 dark:scale-100" />
    </Button>
  )
}

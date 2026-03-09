import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark' | 'system'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    return stored ?? 'system'
  })

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Listen for system theme changes when using 'system'
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem('theme', t)
    setThemeState(t)
  }, [])

  const toggle = useCallback(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme
    const next = resolved === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }, [theme, setTheme])

  return { theme, setTheme, toggle }
}

'use client'

import { useTheme } from './theme-provider'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme, setShowLightModeWarning, setWarningStep } = useTheme()

  const handleToggle = () => {
    if (theme === 'dark') {
      setWarningStep(1)
      setShowLightModeWarning(true)
    } else {
      setTheme('dark')
    }
  }

  return (
    <button
      onClick={handleToggle}
      className="p-2 text-muted-foreground hover:text-foreground transition-colors border border-border hover:border-foreground/40"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}

'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

type Theme = 'dark' | 'light'

type ThemeContextType = {
  theme: Theme
  setTheme: (theme: Theme) => void
  showLightModeWarning: boolean
  setShowLightModeWarning: (show: boolean) => void
  warningStep: number
  setWarningStep: (step: number) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('theme') as Theme | null
  return stored || 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const [showLightModeWarning, setShowLightModeWarning] = useState(false)
  const [warningStep, setWarningStep] = useState(1)

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
  }, [])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        showLightModeWarning,
        setShowLightModeWarning,
        warningStep,
        setWarningStep,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

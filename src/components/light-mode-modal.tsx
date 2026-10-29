'use client'

import { useTheme } from './theme-provider'
import { useEffect } from 'react'

export function LightModeModal() {
  const { showLightModeWarning, setShowLightModeWarning, warningStep, setWarningStep, setTheme } = useTheme()

  useEffect(() => {
    if (showLightModeWarning) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }, [showLightModeWarning])

  if (!showLightModeWarning) return null

  const handleStayDark = () => {
    setShowLightModeWarning(false)
    setWarningStep(1)
  }

  const handleInsist = () => {
    if (warningStep === 1) {
      setWarningStep(2)
    } else {
      setTheme('light')
      setShowLightModeWarning(false)
      setWarningStep(1)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleStayDark}
      />
      <div className="relative bg-[#0a0a0a] border-2 border-emerald-500 rounded-none p-6 max-w-md w-full mx-4 font-mono shadow-2xl shadow-emerald-500/20">
        <div className="space-y-4">
          <div className="text-emerald-500 text-sm mb-2">
            <span className="animate-pulse">▸</span> sistema@gaveho:~$
          </div>
          {warningStep === 1 ? (
            <>
              <p className="text-emerald-400 text-sm leading-relaxed">
                ¿Estás loco? 🧛
              </p>
              <p className="text-gray-300 text-sm leading-relaxed">
                Dark mode es la única forma de vivir. Protege tus ojos y únete al lado oscuro.
              </p>
            </>
          ) : (
            <>
              <p className="text-amber-400 text-sm leading-relaxed">
                Tus ojos, tu decisión... 😎
              </p>
              <p className="text-gray-300 text-sm leading-relaxed">
                Cargando lentes de sol... Espero que sepas lo que haces.
              </p>
            </>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleStayDark}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-black font-semibold py-2 px-4 transition-colors text-sm"
            >
              {warningStep === 1 ? 'Tienes razón, me quedo en dark' : 'Mejor me quedo en dark'}
            </button>
            <button
              onClick={handleInsist}
              className="flex-1 border-2 border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white py-2 px-4 transition-colors text-sm"
            >
              {warningStep === 1 ? 'Insisto, quiero luz' : 'Adelante, cambia a luz'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

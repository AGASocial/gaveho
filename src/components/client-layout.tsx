'use client'

import { ThemeProvider } from '@/components/theme-provider'
import { Nav } from '@/components/layout/nav'
import { LightModeModal } from '@/components/light-mode-modal'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-8 w-full flex-1">
        {children}
      </main>
      <footer className="border-t border-border/40 mt-16">
        <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-muted-foreground">
          <span className="text-emerald-500">~/</span> © {new Date().getFullYear()} Gabriel Vega
        </div>
      </footer>
      <LightModeModal />
    </ThemeProvider>
  )
}

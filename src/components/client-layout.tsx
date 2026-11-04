'use client'

import Link from 'next/link'
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
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-emerald-500">terms</Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-emerald-500">privacy</Link>
        </div>
      </footer>
      <LightModeModal />
    </ThemeProvider>
  )
}

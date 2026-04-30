import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Nav } from '@/components/layout/nav'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Gabriel Vega', template: '%s | Gabriel Vega' },
  description: 'Senior Software Engineer. Building with AI, TypeScript, and cloud-native architectures.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gaveho.com'),
  openGraph: {
    siteName: 'Gabriel Vega',
    locale: 'en_US',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-full flex flex-col">
        <Nav />
        <main className="max-w-3xl mx-auto px-4 py-10 w-full flex-1">
          {children}
        </main>
        <footer className="border-t border-border/40 mt-20">
          <div className="max-w-3xl mx-auto px-4 py-6 text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} Gabriel Vega · Built with Next.js & deployed on Vercel
          </div>
        </footer>
      </body>
    </html>
  )
}

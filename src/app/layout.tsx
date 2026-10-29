import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { ClientLayout } from '@/components/client-layout'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({ 
  variable: '--font-mono', 
  subsets: ['latin'], 
  weight: ['400', '500', '600', '700'] 
})

export const metadata: Metadata = {
  title: { default: 'Gabriel Vega', template: '%s | Gabriel Vega' },
  description: 'Senior Software Engineer & AI builder. Building production-grade AI agents and scalable software.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gaveho.com'),
  openGraph: {
    siteName: 'Gabriel Vega',
    locale: 'en_US',
    type: 'website',
  },
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} dark`} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen flex flex-col font-mono">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Blog' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <header className="border-b border-border/50 bg-background/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-base tracking-tight">
          gaveho<span className="text-foreground">.</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href))
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`pb-0.5 transition-colors tracking-wide text-xs font-medium uppercase ${
                  active
                    ? 'text-foreground border-b-2 border-foreground'
                    : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
                }`}
              >
                {l.label}
              </Link>
            )
          })}
          <a
            href="https://www.linkedin.com/in/gaveho/"
            target="_blank"
            rel="noopener noreferrer"
            className="pb-0.5 transition-colors tracking-wide text-xs font-medium uppercase text-muted-foreground hover:text-foreground border-b-2 border-transparent"
          >
            LinkedIn
          </a>
        </nav>
      </div>
    </header>
  )
}

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
    <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          gaveho<span className="text-primary">.</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                pathname === l.href
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground transition-colors'
              }
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://www.linkedin.com/in/gaveho/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            LinkedIn
          </a>
        </nav>
      </div>
    </header>
  )
}

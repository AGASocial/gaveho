'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/theme-toggle'

const links = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Blog' },
  { href: '#projects', label: 'Projects' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <header className="border-b border-emerald-600/30 dark:border-emerald-500/30 bg-gray-50 dark:bg-black/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <Logo className="w-8 h-8 text-emerald-700 dark:text-emerald-500 group-hover:text-cyan-700 dark:group-hover:text-cyan-400 transition-colors" />
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href))
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`transition-colors font-medium ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-500'
                    : 'text-gray-600 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-400'
                }`}
              >
                {l.label}
              </Link>
            )
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}

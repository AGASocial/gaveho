import Link from 'next/link'

export const LEGAL_UPDATED = '2026-11-04'
/** Placeholder contact address: change it here and it updates everywhere. */
export const CONTACT_EMAIL = 'privacy@gaveho.com'
export const CONTACT_URL = 'https://www.linkedin.com/in/gaveho/'

export function LegalPage({
  command,
  title,
  intro,
  children,
}: {
  command: string
  title: string
  intro: string
  children: React.ReactNode
}) {
  return (
    <article className="space-y-10 max-w-3xl">
      <div className="space-y-4">
        <div className="text-sm text-cyan-700 dark:text-cyan-500 font-mono">
          <span className="text-emerald-600 dark:text-emerald-500">▸</span> {command}
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
        <p className="text-xs font-mono text-gray-500">Last updated: {LEGAL_UPDATED}</p>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{intro}</p>
      </div>
      <div className="space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">{children}</div>
      <p className="text-sm font-mono text-gray-500">
        <span className="text-emerald-600 dark:text-emerald-500">$</span> see also:{' '}
        <Link href="/terms" className="underline hover:text-emerald-500">/terms</Link>{' '}
        <Link href="/privacy" className="underline hover:text-emerald-500">/privacy</Link>
      </p>
    </article>
  )
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        <span className="text-emerald-600 dark:text-emerald-500 font-mono">#</span> {title}
      </h2>
      {children}
    </section>
  )
}

export function ContactEmail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-600 dark:text-emerald-400 underline">
      {CONTACT_EMAIL}
    </a>
  )
}

export function ContactLink() {
  return (
    <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 underline">
      LinkedIn
    </a>
  )
}

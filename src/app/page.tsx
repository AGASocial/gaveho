import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

const skillGroups = [
  { label: 'Frontend', skills: ['TypeScript', 'Next.js', 'Angular', 'React'] },
  { label: 'Backend', skills: ['Node.js', 'Supabase', 'GCP', 'Azure', 'Docker'] },
  { label: 'AI', skills: ['OpenAI', 'Claude', 'RAG', 'LangChain'] },
]

const projects = [
  {
    name: 'CCTV Magic',
    url: 'https://cctvmagic.aga.social',
    description: 'AI SaaS that transforms security camera photos into hyperrealistic videos using OpenAI Sora.',
    tags: ['Next.js', 'OpenAI Sora', 'Supabase', 'Stripe'],
    status: 'Live',
  },
  {
    name: 'NeuraliticaBot',
    url: '#',
    description: 'Chat with your files (PDF, DOCX, CSV, images) using RAG and OpenAI models.',
    tags: ['Next.js', 'RAG', 'OpenAI', 'Supabase'],
    status: 'In progress',
  },
]

const experience = [
  { company: 'Aequilibrium', role: 'Senior Frontend Developer', period: '09/2025 – Present', current: true },
  { company: 'Snapchat', role: 'Senior Software Engineer', period: '10/2024 – 06/2025', current: false },
  { company: '84.51°', role: 'Senior Software Engineer', period: '05/2024 – 10/2024', current: false },
  { company: 'Backbase', role: 'Senior Frontend Engineer', period: '06/2021 – 04/2024', current: false },
]

export default function Home() {
  return (
    <div className="space-y-20">

      {/* Hero */}
      <section className="pt-6 space-y-6">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-2xl bg-foreground text-background flex items-center justify-center text-xl font-bold tracking-tight select-none">
          GV
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            Gabriel Vega
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Senior Software Engineer · 12+ years
          </p>
        </div>

        <p className="text-base leading-relaxed text-foreground/80 max-w-xl">
          I build full-stack web apps, enterprise platforms, and conversational AI at the
          intersection of <strong className="text-foreground">TypeScript</strong>,{' '}
          <strong className="text-foreground">Next.js</strong>, and modern AI tooling.
          Previously at <strong className="text-foreground">Snapchat</strong> and{' '}
          <strong className="text-foreground">Backbase</strong>.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href="https://www.linkedin.com/in/gaveho/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
          >
            LinkedIn ↗
          </a>
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            Read the blog →
          </Link>
        </div>
      </section>

      {/* Skills */}
      <section className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Tech Stack
        </h2>
        <div className="space-y-3">
          {skillGroups.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground/60 w-16 shrink-0">{group.label}</span>
              {group.skills.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Projects
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <a
              key={p.name}
              href={p.url}
              target={p.url !== '#' ? '_blank' : undefined}
              rel="noopener noreferrer"
              className={`group block p-5 rounded-xl border border-border hover:border-border/80 hover:shadow-md bg-card transition-all duration-200 ${p.url === '#' ? 'pointer-events-none opacity-70' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  {p.name}
                </h3>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  p.status === 'Live'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                }`}>
                  {p.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {p.description}
              </p>
              <div className="flex flex-wrap gap-1">
                {p.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Experience
        </h2>
        <div className="relative space-y-0 border-l border-border ml-1">
          {experience.map((e, i) => (
            <div key={e.company} className={`relative pl-6 ${i < experience.length - 1 ? 'pb-6' : ''}`}>
              {/* dot */}
              <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                e.current
                  ? 'bg-foreground border-foreground'
                  : 'bg-background border-border'
              }`} />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
                <div>
                  <p className="font-medium leading-snug">{e.company}</p>
                  <p className="text-sm text-muted-foreground">{e.role}</p>
                </div>
                <p className="text-xs text-muted-foreground/70 tabular-nums sm:text-right shrink-0">
                  {e.period}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}

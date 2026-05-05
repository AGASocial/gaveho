import Link from 'next/link'

const skillGroups = [
  { label: 'Frontend', skills: ['TypeScript', 'Next.js', 'Angular', 'React', 'Tailwind CSS'] },
  { label: 'Backend', skills: ['Node.js', 'Supabase', 'PostgreSQL', 'Docker', 'GCP', 'Azure'] },
  { label: 'AI & Cloud', skills: ['OpenAI', 'Claude', 'RAG', 'LangChain', 'Vercel'] },
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
    status: 'In Progress',
  },
]

const experience = [
  { company: 'Aequilibrium', role: 'Senior Frontend Developer', period: '09/2025 – Present', current: true },
  { company: 'Snapchat', role: 'Senior Software Engineer', period: '10/2024 – 06/2025', current: false },
  { company: '84.51°', role: 'Senior Software Engineer', period: '05/2024 – 10/2024', current: false },
  { company: 'Backbase', role: 'Senior Frontend Engineer', period: '06/2021 – 04/2024', current: false },
  { company: 'Lexicon Networks', role: 'Software Consultant', period: '05/2018 – 05/2021', current: false },
]

export default function Home() {
  return (
    <div className="space-y-20">

      {/* Hero */}
      <section className="pt-6 space-y-6">
        {/* Avatar */}
        <div className="w-14 h-14 bg-muted border border-border flex items-center justify-center text-sm font-semibold tracking-widest text-muted-foreground select-none">
          GV
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            Gabriel Vega
          </h1>
          <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
            Senior Software Engineer · 12+ Years
          </p>
        </div>

        <p className="text-base leading-relaxed text-foreground/75 max-w-xl">
          I build robust, scalable software systems with a focus on clean architecture and minimal
          design. Previously at <strong className="text-foreground font-medium">Snapchat</strong> and{' '}
          <strong className="text-foreground font-medium">Backbase</strong>. Passionate about
          conversational AI and developer tooling.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href="https://www.linkedin.com/in/gaveho/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
          >
            LinkedIn ↗
          </a>
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            Read the blog →
          </Link>
        </div>
      </section>

      {/* Technical Arsenal */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Technical Arsenal
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {skillGroups.map((group) => (
            <div key={group.label} className="space-y-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/60 font-medium">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {group.skills.map((s) => (
                  <span key={s} className="text-sm text-foreground/80">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Selected Work */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Selected Work
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <a
              key={p.name}
              href={p.url}
              target={p.url !== '#' ? '_blank' : undefined}
              rel="noopener noreferrer"
              className={`group block p-6 border border-border hover:border-foreground/20 hover:shadow-md bg-card transition-all duration-200 ${p.url === '#' ? 'pointer-events-none opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold text-base group-hover:text-primary transition-colors">
                  {p.name}
                </h3>
                <span className={`text-xs px-2 py-0.5 shrink-0 flex items-center gap-1 ${
                  p.status === 'Live'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${p.status === 'Live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {p.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {p.description}
              </p>
              <p className="text-xs text-muted-foreground/60 font-mono">
                {'<>'} {p.tags.join(', ')}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Experience
        </h2>
        <div className="relative border-l border-border ml-1 space-y-0">
          {experience.map((e, i) => (
            <div key={e.company} className={`relative pl-6 ${i < experience.length - 1 ? 'pb-7' : ''}`}>
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
                <p className="text-xs text-muted-foreground/60 tabular-nums font-mono sm:text-right shrink-0">
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

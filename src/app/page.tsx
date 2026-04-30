import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

const skills = [
  'TypeScript', 'Next.js', 'Angular', 'Node.js', 'React',
  'Supabase', 'OpenAI', 'Claude', 'GCP', 'Azure', 'Docker',
]

const projects = [
  {
    name: 'CCTV Magic',
    url: 'https://cctvmagic.aga.social',
    description: 'AI SaaS that transforms security camera photos into hyperrealistic videos using OpenAI Sora.',
    tags: ['Next.js', 'OpenAI Sora', 'Supabase', 'Stripe'],
  },
  {
    name: 'NeuraliticaBot',
    url: '#',
    description: 'Chat with your files (PDF, DOCX, CSV, images) using RAG and OpenAI models.',
    tags: ['Next.js', 'RAG', 'OpenAI', 'Supabase'],
  },
]

const experience = [
  { company: 'Aequilibrium', role: 'Senior Frontend Developer', period: '09/2025 – Present' },
  { company: 'Snapchat', role: 'Senior Software Engineer', period: '10/2024 – 06/2025' },
  { company: '84.51°', role: 'Senior Software Engineer', period: '05/2024 – 10/2024' },
  { company: 'Backbase', role: 'Senior Frontend Engineer', period: '06/2021 – 04/2024' },
]

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Gabriel Vega</h1>
        <p className="text-xl text-muted-foreground font-medium">Senior Software Engineer</p>
        <p className="text-base leading-relaxed max-w-2xl">
          12+ years building full-stack web applications, enterprise platforms, and conversational AI.
          I work at the intersection of <strong>Angular</strong>, <strong>TypeScript</strong>,{' '}
          <strong>Node.js</strong>, and modern AI tooling. Currently at{' '}
          <span className="text-foreground font-medium">Aequilibrium</span>, previously{' '}
          <span className="text-foreground font-medium">Snapchat</span> and{' '}
          <span className="text-foreground font-medium">Backbase</span>.
        </p>
        <div className="flex gap-3 text-sm">
          <a
            href="https://www.linkedin.com/in/gaveho/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            LinkedIn →
          </a>
          <Link href="/blog" className="text-primary hover:underline font-medium">
            Blog →
          </Link>
        </div>
      </section>

      <Separator />

      {/* Skills */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Tech Stack</h2>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <Badge key={s} variant="secondary">{s}</Badge>
          ))}
        </div>
      </section>

      <Separator />

      {/* Projects */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold">Projects</h2>
        <div className="space-y-6">
          {projects.map((p) => (
            <div key={p.name} className="space-y-2">
              <div className="flex items-center gap-2">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:text-primary transition-colors"
                >
                  {p.name} →
                </a>
              </div>
              <p className="text-sm text-muted-foreground">{p.description}</p>
              <div className="flex flex-wrap gap-1">
                {p.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Experience */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Experience</h2>
        <div className="space-y-4">
          {experience.map((e) => (
            <div key={e.company} className="flex justify-between items-start gap-4">
              <div>
                <p className="font-medium">{e.company}</p>
                <p className="text-sm text-muted-foreground">{e.role}</p>
              </div>
              <p className="text-xs text-muted-foreground whitespace-nowrap">{e.period}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

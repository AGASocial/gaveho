import Link from 'next/link'
import { AgentChatWidget } from '@/components/agent-chat-widget'

const skillGroups = [
  { label: 'Frontend', skills: ['TypeScript', 'Next.js', 'Angular', 'React', 'Tailwind CSS'] },
  { label: 'Backend', skills: ['Node.js', 'Supabase', 'PostgreSQL', 'Docker', 'GCP', 'Azure'] },
  { label: 'AI & Cloud', skills: ['OpenAI', 'Claude', 'RAG', 'LangChain', 'Vercel'] },
]

const projects = [
  {
    name: 'Kari Decor',
    url: 'https://karidecor.com',
    description: 'E-commerce site for a Chicago business specializing in personalized gift trays (bandejas de regalo personalizadas) with flowers, treats and details. Features Instagram publishing integration.',
    tags: ['Next.js', 'Vercel', 'Supabase', 'Instagram API'],
    status: 'Live',
  },
  {
    name: 'CCTV Magic',
    url: 'https://cctvmagic.aga.social',
    description: 'AI SaaS that transforms security camera photos into hyperrealistic videos using OpenAI Sora.',
    tags: ['Next.js', 'OpenAI Sora', 'Supabase', 'Stripe'],
    status: 'In Progress',
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
    <div className="space-y-16">

      {/* Terminal Hero */}
      <section className="space-y-6">
        <div className="text-sm text-emerald-500 dark:text-emerald-500 font-mono">
          <span className="animate-pulse">▸</span> gabriel.vega --info
        </div>
        
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
            Gabriel Vega
          </h1>
          <p className="text-cyan-700 dark:text-cyan-400 text-lg font-medium">
            Senior Software Engineer · 12+ Years
          </p>
        </div>

        <div className="space-y-3 text-gray-700 dark:text-gray-300 leading-relaxed max-w-2xl">
          <p>
            I build robust, scalable software systems with a focus on clean architecture and minimal
            design. Previously at <strong className="text-gray-900 dark:text-gray-100 font-semibold">Snapchat</strong> and{' '}
            <strong className="text-gray-900 dark:text-gray-100 font-semibold">Backbase</strong>. Passionate about
            conversational AI and developer tooling.
          </p>
        </div>

        <div className="text-sm text-emerald-600 dark:text-emerald-500">
          <span className="animate-pulse">▸</span> building with AI & TypeScript █
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="https://www.linkedin.com/in/gaveho/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold transition-colors"
          >
            LinkedIn ↗
          </a>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-cyan-700 hover:border-cyan-600 dark:border-cyan-500/60 dark:hover:border-cyan-400 text-cyan-800 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold transition-colors"
          >
            Read the blog →
          </Link>
        </div>
      </section>

      {/* Skills */}
      <section className="space-y-6">
        <div className="text-sm text-cyan-700 dark:text-cyan-500 font-mono">
          <span className="text-emerald-600 dark:text-emerald-500">▸</span> ls -la /skills
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {skillGroups.map((group) => (
            <div key={group.label} className="space-y-3">
              <div className="text-emerald-700 dark:text-emerald-500 font-semibold text-sm">
                [ {group.label} ]
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {group.skills.map((s) => (
                  <span key={s} className="text-sm text-gray-700 dark:text-gray-400">
                    · {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="space-y-6">
        <div className="text-sm text-cyan-700 dark:text-cyan-500 font-mono">
          <span className="text-emerald-600 dark:text-emerald-500">▸</span> cat projects.md
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {projects.map((p) => (
            <div
              key={p.name}
              className="border-2 border-emerald-600/30 dark:border-emerald-500/30 bg-gray-50 dark:bg-black/40 p-5 hover:border-cyan-600/60 dark:hover:border-cyan-500/60 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 group-hover:text-cyan-700 dark:group-hover:text-cyan-400 transition-colors">
                  {p.name}
                </h3>
                <span className={`text-xs px-2 py-1 border-2 ${
                  p.status === 'Live'
                    ? 'border-emerald-600/50 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-400'
                    : 'border-amber-600/50 dark:border-amber-500/50 text-amber-700 dark:text-amber-400'
                }`}>
                  {p.status}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                {p.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {p.tags.map((tag) => (
                  <span key={tag} className="text-xs text-cyan-700 dark:text-cyan-500">
                    #{tag}
                  </span>
                ))}
              </div>
              {p.status === 'In Progress' && (
                <div className="mt-4 text-xs text-gray-500 dark:text-gray-500">
                  <span className="text-amber-600 dark:text-amber-500">▸</span> In Progress...
                  <span className="inline-block w-1 h-3 bg-amber-600 dark:bg-amber-500 animate-pulse ml-1" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className="space-y-6">
        <div className="text-sm text-cyan-700 dark:text-cyan-500 font-mono">
          <span className="text-emerald-600 dark:text-emerald-500">▸</span> history
        </div>
        <div className="space-y-4">
          {experience.map((e) => (
            <div key={e.company} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-gray-300 dark:border-border/20">
              <div>
                <div className="flex items-center gap-2">
                  {e.current && (
                    <span className="w-2 h-2 bg-emerald-600 dark:bg-emerald-500 rounded-full animate-pulse" />
                  )}
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{e.company}</p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{e.role}</p>
              </div>
              <p className="text-xs text-cyan-700 dark:text-cyan-500 font-mono">
                {e.period}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Agent Chat Widget */}
      <section className="space-y-6">
        <div className="text-sm text-cyan-700 dark:text-cyan-500 font-mono">
          <span className="text-emerald-600 dark:text-emerald-500">▸</span> whoami
        </div>
        <AgentChatWidget />
      </section>

    </div>
  )
}

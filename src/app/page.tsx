import Link from 'next/link'
import { AgentChatWidget } from '@/components/agent-chat-widget'

const skillGroups = [
  { label: 'TypeScript', skills: ['Next.js', 'React', 'Angular', 'Node.js'] },
  { label: 'Python', skills: ['FastAPI', 'LangChain', 'OpenAI', 'RAG'] },
  { label: 'LLM', skills: ['GPT-4', 'Claude', 'Agents', 'Prompt Engineering'] },
  { label: 'RAG', skills: ['Vector DBs', 'Embeddings', 'Semantic Search', 'Retrieval'] },
  { label: 'Agents', skills: ['LangChain', 'AutoGPT', 'CrewAI', 'Tool Calling'] },
  { label: 'PostgreSQL', skills: ['Supabase', 'Prisma', 'Migrations', 'Optimization'] },
  { label: 'Docker', skills: ['Compose', 'Kubernetes', 'CI/CD', 'Containers'] },
  { label: 'FastAPI', skills: ['REST', 'WebSockets', 'Async', 'Pydantic'] },
]

const projects = [
  {
    name: 'CCTV Magic',
    url: 'https://cctvmagic.aga.social',
    description: 'AI SaaS that transforms security camera photos into hyperrealistic videos using OpenAI Sora.',
    tags: ['Python', 'OpenCV', 'CLIP', 'FastAPI', 'Redis'],
    status: 'In Progress',
  },
  {
    name: 'NeuraliticaBot',
    url: '#',
    description: 'Chat with your files (PDF, DOCX, CSV, images) using RAG and OpenAI models.',
    tags: ['LangChain', 'OpenAI', 'FastAPI', 'Telegram'],
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
        <div className="text-sm text-emerald-500 font-mono">
          <span className="animate-pulse">▸</span> gabriel.vega --info
        </div>
        
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-100 leading-tight">
            Gabriel Vega
          </h1>
          <p className="text-cyan-400 text-lg">
            Senior Software Engineer & AI builder
          </p>
        </div>

        <div className="space-y-3 text-gray-300 leading-relaxed max-w-2xl">
          <p>
            I build production-grade AI agents and scalable software
          </p>
          <p>
            that turn complex problems into useful, reliable products.
          </p>
          <p>
            Focused on code, models, and real-world impact.
          </p>
        </div>

        <div className="text-sm text-emerald-500">
          <span className="animate-pulse">▸</span> building AI agents & products █
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="https://www.linkedin.com/in/gaveho/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-black font-semibold transition-colors"
          >
            LinkedIn ↗
          </a>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-cyan-500/60 hover:border-cyan-400 text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
          >
            Read the blog →
          </Link>
        </div>
      </section>

      {/* Skills */}
      <section className="space-y-6">
        <div className="text-sm text-cyan-500 font-mono">
          <span className="text-emerald-500">▸</span> ls -la /skills
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {skillGroups.map((group) => (
            <div key={group.label} className="space-y-2">
              <div className="text-emerald-500 font-semibold text-sm">
                [ {group.label} ]
              </div>
              <div className="space-y-1">
                {group.skills.map((s) => (
                  <div key={s} className="text-gray-400 text-sm">
                    · {s}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="space-y-6">
        <div className="text-sm text-cyan-500 font-mono">
          <span className="text-emerald-500">▸</span> cat projects.md
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {projects.map((p) => (
            <div
              key={p.name}
              className="border-2 border-emerald-500/30 bg-black/40 p-5 hover:border-cyan-500/60 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-bold text-lg text-gray-100 group-hover:text-cyan-400 transition-colors">
                  {p.name}
                </h3>
                <span className={`text-xs px-2 py-1 border ${
                  p.status === 'Live'
                    ? 'border-emerald-500/50 text-emerald-400'
                    : 'border-amber-500/50 text-amber-400'
                }`}>
                  {p.status}
                </span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed mb-4">
                {p.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {p.tags.map((tag) => (
                  <span key={tag} className="text-xs text-cyan-500">
                    #{tag}
                  </span>
                ))}
              </div>
              {p.status === 'In Progress' && (
                <div className="mt-4 text-xs text-gray-500">
                  <span className="text-amber-500">▸</span> Analyzing...
                  <span className="inline-block w-1 h-3 bg-amber-500 animate-pulse ml-1" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className="space-y-6">
        <div className="text-sm text-cyan-500 font-mono">
          <span className="text-emerald-500">▸</span> history
        </div>
        <div className="space-y-4">
          {experience.map((e) => (
            <div key={e.company} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-border/20">
              <div>
                <div className="flex items-center gap-2">
                  {e.current && (
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  )}
                  <p className="font-semibold text-gray-100">{e.company}</p>
                </div>
                <p className="text-sm text-gray-400">{e.role}</p>
              </div>
              <p className="text-xs text-cyan-500 font-mono">
                {e.period}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Agent Chat Widget */}
      <section className="space-y-6">
        <div className="text-sm text-cyan-500 font-mono">
          <span className="text-emerald-500">▸</span> whoami
        </div>
        <AgentChatWidget />
      </section>

    </div>
  )
}

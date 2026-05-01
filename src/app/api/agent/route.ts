import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import slugify from 'slugify'
import { savePost } from '@/lib/posts'
import type { GenerateRequest } from '@/types'
import { readFileSync } from 'fs'
import path from 'path'

// Manually parse .env.local — bypasses Turbopack workspace-root detection issue
let envPath = ''
let dir = process.cwd()
for (let i = 0; i < 6; i++) {
  const candidate = path.join(dir, '.env.local')
  try { readFileSync(candidate); envPath = candidate; break } catch { /* keep walking */ }
  const parent = path.dirname(dir)
  if (parent === dir) break
  dir = parent
}
try {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key && val && !process.env[key]) process.env[key] = val
  }
} catch {
  // In production env vars are injected by Vercel — file won't exist
}

const SYSTEM_EN = `You are Gabriel Vega's personal content writer.
Gabriel is a Senior Software Engineer with 12+ years of experience in full-stack development,
conversational AI, fintech, and cloud architectures. He has worked at Snapchat, Backbase, and 84.51°.
He builds with Next.js, TypeScript, Angular, Node.js, Supabase, and OpenAI.
Write in a direct, practical, first-person tone — like a senior engineer sharing real experience,
not a corporate blog. Keep it insightful, occasionally opinionated, and always actionable.`

const SYSTEM_ES = `Eres el escritor de contenido personal de Gabriel Vega.
Gabriel es un Ingeniero de Software Senior con más de 12 años de experiencia en desarrollo full-stack,
IA conversacional, fintech y arquitecturas cloud. Ha trabajado en Snapchat, Backbase y 84.51°.
Desarrolla con Next.js, TypeScript, Angular, Node.js, Supabase y OpenAI.
Escribe en primera persona, de forma directa y práctica — como un ingeniero senior compartiendo experiencia real,
no un blog corporativo. Sé perspicaz, ocasionalmente opinado y siempre accionable. Escribe TODO en español.`

function buildPrompt(topic: string, context: string | undefined, lang: 'en' | 'es') {
  const isEs = lang === 'es'
  return `${isEs ? 'Escribe un artículo de blog sobre' : 'Write a blog post about'}: "${topic}"
${context ? `\n${isEs ? 'Contexto adicional' : 'Additional context'}:\n${context}` : ''}

Return ONLY a valid JSON object with this exact shape:
{
  "title": "${isEs ? 'Título del artículo' : 'Compelling post title'}",
  "excerpt": "${isEs ? 'Resumen de 2-3 oraciones para el listado del blog' : '2-3 sentence summary for the blog listing page'}",
  "content": "${isEs ? 'Artículo completo en formato Markdown. Entre 600-900 palabras.' : 'Full blog post in Markdown format. Aim for 600-900 words.'}",
  "tags": ["tag1", "tag2", "tag3"],
  "tiktok_script": "${isEs ? 'Guión para TikTok en español: 1) Hook de 3 segundos, 2) 3 puntos clave (máx 15 palabras cada uno), 3) CTA. Total < 150 palabras. Tono conversacional y enérgico.' : 'TikTok script: 1) Strong 3-second hook, 2) 3 punchy points (max 15 words each), 3) CTA. Total < 150 words. Conversational, energetic.'}"
}`
}

async function generatePost(
  anthropic: Anthropic,
  topic: string,
  context: string | undefined,
  lang: 'en' | 'es'
) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: lang === 'es' ? SYSTEM_ES : SYSTEM_EN,
    messages: [{ role: 'user', content: buildPrompt(topic, context, lang) }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text
  const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  return JSON.parse(jsonStr)
}

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  try {
    const body: GenerateRequest = await req.json()

    if (body.secret !== process.env.AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { topic, context } = body

    // Generate both EN and ES in parallel
    const [generatedEn, generatedEs] = await Promise.all([
      generatePost(anthropic, topic, context, 'en'),
      generatePost(anthropic, topic, context, 'es'),
    ])

    const slugEn = slugify(generatedEn.title, { lower: true, strict: true })
    const slugEs = slugify(generatedEs.title, { lower: true, strict: true })

    // Save both drafts in parallel
    const [postEn, postEs] = await Promise.all([
      savePost({
        title: generatedEn.title,
        slug: slugEn,
        excerpt: generatedEn.excerpt,
        content: generatedEn.content,
        tags: generatedEn.tags,
        tiktok_script: generatedEn.tiktok_script,
        language: 'en',
        published: false,
      }),
      savePost({
        title: generatedEs.title,
        slug: slugEs,
        excerpt: generatedEs.excerpt,
        content: generatedEs.content,
        tags: generatedEs.tags,
        tiktok_script: generatedEs.tiktok_script,
        language: 'es',
        published: false,
      }),
    ])

    const base = `${process.env.NEXT_PUBLIC_SITE_URL}/blog`
    const secret = process.env.AGENT_SECRET

    return NextResponse.json({
      success: true,
      en: {
        id: postEn.id,
        title: postEn.title,
        preview_url: `${base}/${postEn.slug}?preview=${secret}`,
      },
      es: {
        id: postEs.id,
        title: postEs.title,
        preview_url: `${base}/${postEs.slug}?preview=${secret}`,
        tiktok_script: postEs.tiktok_script, // TikTok script always in Spanish
      },
    })
  } catch (err) {
    console.error('[agent] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

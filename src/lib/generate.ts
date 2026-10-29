import Anthropic from '@anthropic-ai/sdk'
import slugify from 'slugify'
import { savePost } from './posts'

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

export interface GeneratedPost {
  title: string
  excerpt: string
  content: string
  tags: string[]
  tiktok_script: string
}

export interface GeneratedDrafts {
  en: {
    id: string
    title: string
    slug: string
    excerpt: string
    tags: string[]
    preview_url: string
  }
  es: {
    id: string
    title: string
    slug: string
    excerpt: string
    tags: string[]
    tiktok_script: string
    preview_url: string
  }
}

/**
 * Generate EN and ES blog post drafts from a topic and optional context.
 * Saves both as unpublished drafts and returns metadata + preview URLs.
 */
export async function generateBlogDrafts(
  topic: string,
  context?: string
): Promise<GeneratedDrafts> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

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

  return {
    en: {
      id: postEn.id,
      title: postEn.title,
      slug: slugEn,
      excerpt: postEn.excerpt,
      tags: postEn.tags,
      preview_url: `${base}/${postEn.slug}?preview=${secret}`,
    },
    es: {
      id: postEs.id,
      title: postEs.title,
      slug: slugEs,
      excerpt: postEs.excerpt,
      tags: postEs.tags,
      tiktok_script: postEs.tiktok_script || '',
      preview_url: `${base}/${postEs.slug}?preview=${secret}`,
    },
  }
}

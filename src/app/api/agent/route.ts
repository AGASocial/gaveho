import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import slugify from 'slugify'
import { savePost } from '@/lib/posts'
import type { GenerateRequest } from '@/types'
import { readFileSync } from 'fs'
import path from 'path'

// Manually parse .env.local using an absolute path anchored to this file's location.
// This bypasses Turbopack's incorrect workspace-root detection caused by a stray
// package-lock.json in the parent directory.
// In Turbopack dev, __dirname is a virtual path. Walk up from process.cwd()
// (which Next.js sets to the detected workspace root) to find .env.local.
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
    // Force-set: override empty values set by any interceptor (e.g. vestauth)
    if (key && val && !process.env[key]) process.env[key] = val
  }
} catch {
  // In production env vars are injected by Vercel — file won't exist
}

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  try {
    const body: GenerateRequest = await req.json()

    // Shared secret — used by n8n / Telegram bot to authenticate
    if (body.secret !== process.env.AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { topic, context } = body

    const systemPrompt = `You are Gabriel Vega's personal content writer.
Gabriel is a Senior Software Engineer with 12+ years of experience in full-stack development,
conversational AI, fintech, and cloud architectures. He has worked at Snapchat, Backbase, and 84.51°.
He builds with Next.js, TypeScript, Angular, Node.js, Supabase, and OpenAI.
Write in a direct, practical, first-person tone — like a senior engineer sharing real experience,
not a corporate blog. Keep it insightful, occasionally opinionated, and always actionable.`

    const userPrompt = `Write a blog post about: "${topic}"
${context ? `\nAdditional context / research notes:\n${context}` : ''}

Return ONLY a valid JSON object with this exact shape:
{
  "title": "Compelling post title",
  "excerpt": "2-3 sentence summary for the blog listing page",
  "content": "Full blog post in Markdown format (use headings, code blocks, bullet points as needed). Aim for 600-900 words.",
  "tags": ["tag1", "tag2", "tag3"],
  "tiktok_script": "A TikTok video script with: 1) A strong 3-second hook, 2) 3 punchy points (max 15 words each), 3) A CTA. Total < 150 words. Write it as spoken word — conversational, energetic."
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text

    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const generated = JSON.parse(jsonStr)

    const slug = slugify(generated.title, { lower: true, strict: true })

    const post = await savePost({
      title: generated.title,
      slug,
      excerpt: generated.excerpt,
      content: generated.content,
      tags: generated.tags,
      tiktok_script: generated.tiktok_script,
      published: false, // always draft first — you review before publishing
    })

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        title: post.title,
        slug: post.slug,
        tiktok_script: post.tiktok_script,
        preview_url: `${process.env.NEXT_PUBLIC_SITE_URL}/blog/${post.slug}`,
      },
    })
  } catch (err) {
    console.error('[agent] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

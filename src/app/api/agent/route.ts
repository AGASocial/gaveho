import { NextRequest, NextResponse } from 'next/server'
import type { GenerateRequest } from '@/types'
import { generateBlogDrafts } from '@/lib/generate'
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

export async function POST(req: NextRequest) {
  try {
    const body: GenerateRequest = await req.json()

    if (body.secret !== process.env.AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { topic, context } = body
    const drafts = await generateBlogDrafts(topic, context)

    return NextResponse.json({
      success: true,
      en: {
        id: drafts.en.id,
        title: drafts.en.title,
        preview_url: drafts.en.preview_url,
      },
      es: {
        id: drafts.es.id,
        title: drafts.es.title,
        preview_url: drafts.es.preview_url,
        tiktok_script: drafts.es.tiktok_script,
      },
    })
  } catch (err) {
    console.error('[agent] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

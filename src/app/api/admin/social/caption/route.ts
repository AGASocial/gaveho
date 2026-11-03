import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCaptionSystemPrompt } from '@/lib/social/caption'
import { SOCIAL_BUCKET } from '@/lib/social/store'

export const maxDuration = 60

// Routed through Vercel AI Gateway (plain model string; auth via AI_GATEWAY_API_KEY or Vercel OIDC).
const CAPTION_MODEL = 'anthropic/claude-sonnet-4.5'
const pathRe = /^posts\/\d{4}\/\d{2}\/[0-9a-f-]+\.jpg$/

export async function POST(request: Request) {
  const admin = await requireAdminApi()
  if (admin instanceof NextResponse) return admin
  const body = (await request.json().catch(() => null)) as { mediaPath?: unknown; hint?: unknown; language?: unknown; accountId?: unknown } | null
  const mediaPath = typeof body?.mediaPath === 'string' ? body.mediaPath : ''
  if (!pathRe.test(mediaPath)) return NextResponse.json({ error: 'Invalid image.' }, { status: 422, headers: noStoreHeaders })
  const hint = typeof body?.hint === 'string' ? body.hint.slice(0, 500) : ''
  const language = body?.language === 'es' ? 'Spanish' : 'English'
  const db = supabaseAdmin()
  const account =
    typeof body?.accountId === 'string' && body.accountId
      ? (await db.from('gaveho_social_accounts').select('label,username,caption_voice').eq('id', body.accountId).maybeSingle()).data
      : null
  const { data, error } = await db.storage.from(SOCIAL_BUCKET).download(mediaPath)
  if (error || !data) return NextResponse.json({ error: 'Could not read the image.' }, { status: 404, headers: noStoreHeaders })
  try {
    const { text } = await generateText({
      model: CAPTION_MODEL,
      system: buildCaptionSystemPrompt(account),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Write an Instagram caption in ${language}, 60–150 words, with a hook first line, a call to action, 1–3 emojis, and 3–6 relevant hashtags at the end.${hint ? `\nNotes from the account owner: ${hint}` : ''}` },
            { type: 'file', mediaType: 'image/jpeg', data: new Uint8Array(await data.arrayBuffer()) },
          ],
        },
      ],
      providerOptions: { gateway: { user: admin.id, tags: ['feature:instagram-caption', 'app:gaveho'] } },
    })
    const caption = text.trim().slice(0, 2200)
    if (!caption) return NextResponse.json({ error: 'AI returned an empty caption.' }, { status: 502, headers: noStoreHeaders })
    return NextResponse.json({ caption }, { headers: noStoreHeaders })
  } catch (err) {
    console.error('[social/caption] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Caption generation failed. Check AI Gateway on Vercel.' }, { status: 502, headers: noStoreHeaders })
  }
}

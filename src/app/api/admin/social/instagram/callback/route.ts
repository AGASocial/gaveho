import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getActiveAdmin } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { encryptToken } from '@/lib/social/crypto'
import { exchangeCodeForLongLivedToken, getInstagramProfile } from '@/lib/social/instagram'

const STATE_COOKIE = 'gaveho_ig_oauth'

function back(request: NextRequest, query: string) {
  const res = NextResponse.redirect(new URL(`/admin/social?${query}`, request.url))
  res.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/api/admin/social/instagram' })
  return res
}

export async function GET(request: NextRequest) {
  if (!(await getActiveAdmin())) return NextResponse.redirect(new URL('/admin/login', request.url))
  const params = request.nextUrl.searchParams
  if (params.get('error')) return back(request, 'error=denied')
  const code = params.get('code')?.replace(/#_$/, '')
  const state = params.get('state') ?? ''
  let saved: { state?: string; label?: string } = {}
  try {
    saved = JSON.parse(request.cookies.get(STATE_COOKIE)?.value ?? '{}')
  } catch {}
  const a = Buffer.from(state)
  const b = Buffer.from(saved.state ?? '')
  if (!code || !saved.state || a.length !== b.length || !timingSafeEqual(a, b)) return back(request, 'error=state')

  try {
    const token = await exchangeCodeForLongLivedToken(code)
    const profile = await getInstagramProfile(token.accessToken)
    const igUserId = String(profile.user_id ?? profile.id)
    const { error } = await supabaseAdmin()
      .from('gaveho_social_accounts')
      .upsert(
        {
          platform: 'instagram',
          ig_user_id: igUserId,
          username: profile.username,
          label: saved.label || profile.username,
          access_token_encrypted: encryptToken(token.accessToken),
          token_expires_at: token.expiresAt,
          token_refreshed_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: 'platform,ig_user_id' }
      )
    if (error) throw error
    return back(request, 'connected=1')
  } catch (err) {
    console.error('[social/instagram/callback] failed:', err instanceof Error ? err.message : err)
    return back(request, 'error=exchange')
  }
}

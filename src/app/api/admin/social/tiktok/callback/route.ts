import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { exchangeTikTokCode, fetchTikTokUser, queryCreatorInfo, tiktokConfig } from '@/lib/social/tiktok'
import { tiktokTokenColumns } from '@/lib/social/tiktok-store'

export const dynamic = 'force-dynamic'
const STATE_COOKIE = 'gaveho_tiktok_oauth_state'

function done(request: Request, query: string) {
  const res = NextResponse.redirect(new URL(`/admin/social?${query}`, request.url), { headers: noStoreHeaders })
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/admin/social/tiktok', maxAge: 0 })
  return res
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// GET ?code=&state=&scopes= (or ?error=) — TikTok redirects here after consent.
export async function GET(request: Request) {
  const admin = await requireAdminApi()
  if (admin instanceof NextResponse) return admin
  const params = new URL(request.url).searchParams
  const expected = (await cookies()).get(STATE_COOKIE)?.value ?? ''
  const state = params.get('state') ?? ''
  if (!expected || !state || !safeEqual(expected, state)) return done(request, 'tiktok_error=invalid_state')
  const oauthError = params.get('error')
  if (oauthError) return done(request, `tiktok_error=${encodeURIComponent(oauthError.slice(0, 60))}`)
  const code = params.get('code')
  if (!code) return done(request, 'tiktok_error=missing_code')
  const config = tiktokConfig()
  if (!config.configured) return done(request, 'tiktok_error=not_configured')

  try {
    const tokens = await exchangeTikTokCode(code, config.redirectUri)
    const granted = tokens.scope.split(/[,\s]+/)
    if (!granted.includes('video.publish')) return done(request, 'tiktok_error=missing_scope_video.publish')
    const [user, creator] = await Promise.all([
      fetchTikTokUser(tokens.accessToken).catch(() => null),
      queryCreatorInfo(tokens.accessToken).catch(() => null),
    ])
    const username = creator?.creator_username ?? null
    const db = supabaseAdmin()
    // open_id goes in ig_user_id so reconnecting the same TikTok user updates the existing row.
    const { data: existing } = await db.from('gaveho_social_accounts').select('label').eq('platform', 'tiktok').eq('ig_user_id', tokens.openId).maybeSingle()
    const { error } = await db.from('gaveho_social_accounts').upsert(
      {
        platform: 'tiktok',
        api_host: 'tiktok',
        ig_user_id: tokens.openId,
        username,
        label: existing?.label ?? (username ? `TikTok @${username}` : user?.displayName ? `TikTok ${user.displayName}` : 'TikTok'),
        is_active: true,
        ...tiktokTokenColumns(tokens),
      },
      { onConflict: 'platform,ig_user_id' },
    )
    if (error) {
      console.error('[social/tiktok/callback] upsert failed:', error.message)
      return done(request, 'tiktok_error=save_failed')
    }
    return done(request, 'tiktok=connected')
  } catch (e) {
    console.error('[social/tiktok/callback] failed:', e instanceof Error ? e.message : 'unknown')
    return done(request, 'tiktok_error=exchange_failed')
  }
}

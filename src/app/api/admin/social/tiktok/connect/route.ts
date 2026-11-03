import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { buildAuthorizeUrl, tiktokConfig } from '@/lib/social/tiktok'

export const dynamic = 'force-dynamic'
const TIKTOK_STATE_COOKIE = 'gaveho_tiktok_oauth_state'

// GET — starts TikTok Login Kit (OAuth v2). CSRF protection: a random `state` is stored in a short-lived
// httpOnly cookie scoped to the callback path and compared (timing-safe) in the callback, which also
// requires the same admin session. PKCE is not required by TikTok's web flow (the code is exchanged with
// the client secret server-side).
export async function GET(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const config = tiktokConfig()
  if (!config.configured || !process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.redirect(new URL('/admin/social?tiktok_error=not_configured', request.url), { headers: noStoreHeaders })
  }
  const state = randomBytes(32).toString('base64url')
  const res = NextResponse.redirect(buildAuthorizeUrl({ clientKey: config.clientKey!, redirectUri: config.redirectUri, state }), { headers: noStoreHeaders })
  res.cookies.set(TIKTOK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/admin/social/tiktok',
    maxAge: 600,
  })
  return res
}

import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getActiveAdmin } from '@/lib/admin/auth'
import { buildInstagramAuthorizeUrl, getInstagramOAuthConfig } from '@/lib/social/instagram'

const STATE_COOKIE = 'gaveho_ig_oauth'

// GET /api/admin/social/instagram/connect?label=Gaveho%20AI
export async function GET(request: Request) {
  if (!(await getActiveAdmin())) return NextResponse.redirect(new URL('/admin/login', request.url))
  if (!getInstagramOAuthConfig().configured) return NextResponse.redirect(new URL('/admin/social?error=not_configured', request.url))
  const label = (new URL(request.url).searchParams.get('label') ?? '').trim().slice(0, 80)
  const state = randomBytes(24).toString('base64url')
  const response = NextResponse.redirect(buildInstagramAuthorizeUrl(state))
  response.cookies.set(STATE_COOKIE, JSON.stringify({ state, label }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/admin/social/instagram',
  })
  return response
}

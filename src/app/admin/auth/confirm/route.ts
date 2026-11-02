import type { EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAuthServerClient } from '@/lib/supabase/auth-server'
import { getActiveAdmin } from '@/lib/admin/auth'

// Magic-link / PKCE callback.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null
  const auth = await createSupabaseAuthServerClient()
  const result = code
    ? await auth.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await auth.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('Missing token') }
  if (!result.error && (await getActiveAdmin())) return NextResponse.redirect(new URL('/admin', request.url))
  await auth.auth.signOut()
  return NextResponse.redirect(new URL('/admin/login?error=access', request.url))
}

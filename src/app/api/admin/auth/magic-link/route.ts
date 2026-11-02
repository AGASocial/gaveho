import { NextResponse } from 'next/server'
import { createSupabaseAuthServerClient } from '@/lib/supabase/auth-server'
import { noStoreHeaders } from '@/lib/admin/auth'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!email) return NextResponse.json({ error: 'Email required.' }, { status: 422, headers: noStoreHeaders })
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(request.url).origin
  const auth = await createSupabaseAuthServerClient()
  const { error } = await auth.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/admin/auth/confirm` },
  })
  if (error) console.warn('[admin/auth] magic link not sent:', error.message)
  // Always answer the same way so the endpoint does not reveal which emails exist.
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders })
}

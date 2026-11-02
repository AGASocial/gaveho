import { NextResponse } from 'next/server'
import { createSupabaseAuthServerClient } from '@/lib/supabase/auth-server'
import { getActiveAdmin, noStoreHeaders } from '@/lib/admin/auth'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return NextResponse.json({ error: 'Email and password required.' }, { status: 422, headers: noStoreHeaders })
  const auth = await createSupabaseAuthServerClient()
  const { error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !(await getActiveAdmin())) {
    await auth.auth.signOut()
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401, headers: noStoreHeaders })
  }
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders })
}

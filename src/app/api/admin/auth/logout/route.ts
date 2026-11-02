import { NextResponse } from 'next/server'
import { createSupabaseAuthServerClient } from '@/lib/supabase/auth-server'

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient()
  await auth.auth.signOut()
  return NextResponse.redirect(new URL('/admin/login', request.url), { status: 303 })
}

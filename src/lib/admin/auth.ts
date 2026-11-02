import { NextResponse } from 'next/server'
import { createSupabaseAuthServerClient } from '@/lib/supabase/auth-server'
import { supabaseAdmin } from '@/lib/supabase'

export type ActiveAdmin = { id: string; email: string | null; displayName: string }

/**
 * Returns the signed-in Supabase Auth user only if they have an active row in
 * gaveho_admin_profiles. Everyone else (anonymous or any other auth user) gets null.
 */
export async function getActiveAdmin(): Promise<ActiveAdmin | null> {
  try {
    const auth = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user) return null
    const { data: profile, error } = await supabaseAdmin()
      .from('gaveho_admin_profiles')
      .select('display_name,is_active')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error || !profile?.is_active) return null
    return { id: user.id, email: user.email ?? null, displayName: profile.display_name || user.email || 'Admin' }
  } catch (err) {
    console.error('[admin/auth] getActiveAdmin failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

/**
 * Guard for /api/admin/* route handlers.
 *   const guard = await requireAdminApi(); if (guard instanceof NextResponse) return guard
 */
export async function requireAdminApi(): Promise<ActiveAdmin | NextResponse> {
  const admin = await getActiveAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
  return admin
}

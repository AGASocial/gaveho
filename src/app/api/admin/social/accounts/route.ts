import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { ACCOUNT_PUBLIC_COLUMNS } from '@/lib/social/store'

export async function GET() {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const { data, error } = await supabaseAdmin().from('gaveho_social_accounts').select(ACCOUNT_PUBLIC_COLUMNS).order('created_at')
  if (error) return NextResponse.json({ error: 'Could not load accounts.' }, { status: 500, headers: noStoreHeaders })
  return NextResponse.json({ accounts: data }, { headers: noStoreHeaders })
}

export async function PATCH(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const body = (await request.json().catch(() => null)) as { id?: unknown; label?: unknown; isActive?: unknown } | null
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 422, headers: noStoreHeaders })
  const update: Record<string, unknown> = {}
  if (typeof body.label === 'string' && body.label.trim()) update.label = body.label.trim().slice(0, 80)
  if (typeof body.isActive === 'boolean') update.is_active = body.isActive
  const { data, error } = await supabaseAdmin().from('gaveho_social_accounts').update(update).eq('id', body.id).select(ACCOUNT_PUBLIC_COLUMNS).maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Could not update account.' }, { status: 500, headers: noStoreHeaders })
  return NextResponse.json({ account: data }, { headers: noStoreHeaders })
}

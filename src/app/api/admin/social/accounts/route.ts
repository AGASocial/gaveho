import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { ACCOUNT_PUBLIC_COLUMNS } from '@/lib/social/store'
import { removeAgentUploads, revokeTikTokToken } from '@/lib/social/account-cleanup'

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
  const body = (await request.json().catch(() => null)) as { id?: unknown; label?: unknown; isActive?: unknown; captionVoice?: unknown } | null
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 422, headers: noStoreHeaders })
  const update: Record<string, unknown> = {}
  if (typeof body.label === 'string' && body.label.trim()) update.label = body.label.trim().slice(0, 80)
  if (typeof body.isActive === 'boolean') update.is_active = body.isActive
  if (typeof body.captionVoice === 'string') update.caption_voice = body.captionVoice.trim().slice(0, 4000) || null
  const { data, error } = await supabaseAdmin().from('gaveho_social_accounts').update(update).eq('id', body.id).select(ACCOUNT_PUBLIC_COLUMNS).maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Could not update account.' }, { status: 500, headers: noStoreHeaders })
  return NextResponse.json({ account: data }, { headers: noStoreHeaders })
}

// Removes an account and its posts (posts reference accounts with ON DELETE RESTRICT).
// Best-effort afterwards (never blocks the deletion): attempts to revoke the TikTok token and removes
// agent/<id>/ uploads that no remaining post references (runs after this account's posts are deleted).
export async function DELETE(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 422, headers: noStoreHeaders })
  const db = supabaseAdmin()
  const { count } = await db.from('gaveho_social_posts').select('id', { count: 'exact', head: true }).eq('account_id', id).eq('status', 'publishing')
  if (count) return NextResponse.json({ error: 'A post is publishing right now; try again in a minute.' }, { status: 409, headers: noStoreHeaders })
  const { data: account } = await db.from('gaveho_social_accounts').select('platform,access_token_encrypted,refresh_token_encrypted,token_expires_at').eq('id', id).maybeSingle()
  const posts = await db.from('gaveho_social_posts').delete().eq('account_id', id)
  const { error } = posts.error ? posts : await db.from('gaveho_social_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not remove account.' }, { status: 500, headers: noStoreHeaders })
  await Promise.allSettled([
    account?.platform === 'tiktok' ? revokeTikTokToken(account) : Promise.resolve(),
    removeAgentUploads(id),
  ])
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders })
}

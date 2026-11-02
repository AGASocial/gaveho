import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { publishClaimedPost, socialMediaPrefix } from '@/lib/social/store'
import { parseCreatePost } from '@/lib/social/validation'

export const maxDuration = 60

export async function GET() {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const { data, error } = await supabaseAdmin()
    .from('gaveho_social_posts')
    .select('id,account_id,platform,caption,media_urls,status,scheduled_at,published_at,published_media_id,published_permalink,error,created_at,account:gaveho_social_accounts(label,username)')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: 'Could not load posts.' }, { status: 500, headers: noStoreHeaders })
  return NextResponse.json({ posts: data }, { headers: noStoreHeaders })
}

export async function POST(request: Request) {
  const admin = await requireAdminApi()
  if (admin instanceof NextResponse) return admin
  const parsed = parseCreatePost(await request.json().catch(() => null), socialMediaPrefix())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422, headers: noStoreHeaders })
  const input = parsed.value
  const db = supabaseAdmin()
  const { data: account } = await db.from('gaveho_social_accounts').select('id,platform,is_active').eq('id', input.accountId).maybeSingle()
  if (!account?.is_active) return NextResponse.json({ error: 'Account not found or disabled.' }, { status: 422, headers: noStoreHeaders })
  const status = input.mode === 'draft' ? 'draft' : input.mode === 'schedule' ? 'scheduled' : 'publishing'
  const { data: post, error } = await db
    .from('gaveho_social_posts')
    .insert({
      account_id: account.id,
      platform: account.platform,
      caption: input.caption,
      media_urls: input.mediaUrls,
      status,
      scheduled_at: input.scheduledAt,
      created_by: admin.id,
      publish_attempts: status === 'publishing' ? 1 : 0,
      last_attempt_at: status === 'publishing' ? new Date().toISOString() : null,
    })
    .select('id,account_id,caption,media_urls,status')
    .single()
  if (error || !post) return NextResponse.json({ error: 'Could not save post.' }, { status: 500, headers: noStoreHeaders })
  if (status !== 'publishing') return NextResponse.json({ post }, { headers: noStoreHeaders })
  const result = await publishClaimedPost(post)
  return NextResponse.json({ post: { ...post, ...result } }, { status: result.status === 'published' ? 200 : 502, headers: noStoreHeaders })
}

// DELETE ?id= — only drafts, scheduled or failed posts can be removed.
export async function DELETE(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 422, headers: noStoreHeaders })
  const { data, error } = await supabaseAdmin().from('gaveho_social_posts').delete().eq('id', id).in('status', ['draft', 'scheduled', 'failed']).select('id')
  if (error || !data?.length) return NextResponse.json({ error: 'Could not delete post.' }, { status: 409, headers: noStoreHeaders })
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders })
}

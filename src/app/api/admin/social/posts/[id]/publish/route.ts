import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { publishClaimedPost } from '@/lib/social/store'

export const maxDuration = 60

// Publish now (draft / scheduled / failed retry). Atomic claim prevents double publishing.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const db = supabaseAdmin()
  const { data: current } = await db.from('gaveho_social_posts').select('caption,publish_attempts').eq('id', id).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Post not found.' }, { status: 404, headers: noStoreHeaders })
  if (!current.caption?.trim()) return NextResponse.json({ error: 'Add a caption first.' }, { status: 422, headers: noStoreHeaders })
  const { data: post, error } = await db
    .from('gaveho_social_posts')
    .update({ status: 'publishing', error: null, publish_attempts: (current.publish_attempts ?? 0) + 1, last_attempt_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['draft', 'scheduled', 'failed'])
    .select('id,account_id,caption,media_urls')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not claim post.' }, { status: 500, headers: noStoreHeaders })
  if (!post) return NextResponse.json({ error: 'Post is already publishing or published.' }, { status: 409, headers: noStoreHeaders })
  const result = await publishClaimedPost(post)
  return NextResponse.json(result, { status: result.status === 'published' ? 200 : 502, headers: noStoreHeaders })
}

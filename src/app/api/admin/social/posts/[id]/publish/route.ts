import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { type ClaimedPost, publishClaimedPost } from '@/lib/social/store'

export const maxDuration = 60

const STALE_PUBLISHING_MS = 15 * 60 * 1000

// Publish now (draft / scheduled / failed retry, or a 'publishing' row stuck for 15+ minutes).
// Atomic claim prevents double publishing.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const db = supabaseAdmin()
  const { data: current } = await db.from('gaveho_social_posts').select('caption,publish_attempts,status,container_id,last_attempt_at').eq('id', id).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Post not found.' }, { status: 404, headers: noStoreHeaders })
  if (!current.caption?.trim()) return NextResponse.json({ error: 'Add a caption first.' }, { status: 422, headers: noStoreHeaders })
  const staleBefore = new Date(Date.now() - STALE_PUBLISHING_MS).toISOString()
  const stale = current.status === 'publishing' && (!current.last_attempt_at || current.last_attempt_at < staleBefore)
  let claim = db
    .from('gaveho_social_posts')
    .update({
      status: 'publishing',
      error: null,
      publish_attempts: (current.publish_attempts ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
      // A stuck row keeps its container / TikTok publish_id so the retry resumes instead of posting twice.
      ...(stale ? {} : { container_id: null, container_created_at: null }),
    })
    .eq('id', id)
  claim = stale
    ? claim.eq('status', 'publishing').or(`last_attempt_at.is.null,last_attempt_at.lt.${staleBefore}`)
    : claim.in('status', ['draft', 'scheduled', 'failed'])
  // '*' so this works whether or not the TikTok migration (tiktok_options) is applied yet.
  const { data: post, error } = await claim.select('*').maybeSingle<ClaimedPost>()
  if (error) return NextResponse.json({ error: 'Could not claim post.' }, { status: 500, headers: noStoreHeaders })
  if (!post) return NextResponse.json({ error: 'Post is already publishing or published.' }, { status: 409, headers: noStoreHeaders })
  const result = await publishClaimedPost(post)
  return NextResponse.json(result, { status: result.status === 'published' ? 200 : result.status === 'publishing' ? 202 : 502, headers: noStoreHeaders })
}

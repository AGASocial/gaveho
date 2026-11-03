import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { type ClaimedPost, publishClaimedPost } from '@/lib/social/store'

// Reels may poll Meta for up to 30 s each (3 per run).
export const maxDuration = 300
export const dynamic = 'force-dynamic'


/** A 'publishing' row with no container/publish_id this old was interrupted (e.g. a function timeout). */
const STALE_PUBLISHING_MS = 15 * 60 * 1000

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Recover interrupted publishes. They are marked failed (not re-queued) because the platform may already
  // have received the upload; an admin checks the account and retries from the publisher.
  const { data: stale, error: staleError } = await supabaseAdmin()
    .from('gaveho_social_posts')
    .update({ status: 'failed', error: 'Publishing was interrupted before the platform confirmed it. Check the account, then retry.' })
    .eq('status', 'publishing')
    .is('container_id', null)
    .lt('last_attempt_at', new Date(Date.now() - STALE_PUBLISHING_MS).toISOString())
    .select('id')
  if (staleError) console.error('[social-publisher] stale recovery failed:', staleError.message)
  const { data, error } = await supabaseAdmin().rpc('gaveho_claim_due_social_posts', { batch_size: 3 })
  if (error) {
    console.error('[social-publisher] claim failed:', error.message)
    return NextResponse.json({ error: 'Could not claim scheduled posts.' }, { status: 500 })
  }
  const results = []
  for (const post of (data ?? []) as ClaimedPost[]) results.push(await publishClaimedPost(post, { reelWaitMs: 30_000 }))
  return NextResponse.json({ recovered: stale?.length ?? 0, claimed: results.length, results: results.map(({ id, status }) => ({ id, status })) })
}

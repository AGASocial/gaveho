import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { type ClaimedPost, publishClaimedPost } from '@/lib/social/store'

// Reels may poll Meta for up to 30 s each (3 per run).
export const maxDuration = 300
export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin().rpc('gaveho_claim_due_social_posts', { batch_size: 3 })
  if (error) {
    console.error('[social-publisher] claim failed:', error.message)
    return NextResponse.json({ error: 'Could not claim scheduled posts.' }, { status: 500 })
  }
  const results = []
  for (const post of (data ?? []) as ClaimedPost[]) results.push(await publishClaimedPost(post, { reelWaitMs: 30_000 }))
  return NextResponse.json({ claimed: results.length, results: results.map(({ id, status }) => ({ id, status })) })
}

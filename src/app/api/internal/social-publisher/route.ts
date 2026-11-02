import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { publishClaimedPost } from '@/lib/social/store'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Claimed = { id: string; account_id: string; caption: string; media_urls: string[] }

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin().rpc('gaveho_claim_due_social_posts', { batch_size: 3 })
  if (error) {
    console.error('[social-publisher] claim failed:', error.message)
    return NextResponse.json({ error: 'Could not claim scheduled posts.' }, { status: 500 })
  }
  const results = []
  for (const post of (data ?? []) as Claimed[]) results.push(await publishClaimedPost(post))
  return NextResponse.json({ claimed: results.length, results: results.map(({ id, status }) => ({ id, status })) })
}

import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { cleanupAgentUploads } from '@/lib/social/agent-cleanup'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// Hourly: delete agent/ direct uploads older than 24 h that no post references (media_urls / cover_url).
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await cleanupAgentUploads())
  } catch (e) {
    console.error('[social-agent-cleanup] failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { refreshAccountToken } from '@/lib/social/store'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Daily: refresh Instagram-login long-lived tokens that expire within 15 days.
// Tokens without an expiry (non-expiring / system user tokens) and Facebook-login
// tokens are skipped.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cutoff = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabaseAdmin()
    .from('gaveho_social_accounts')
    .select('id')
    .eq('platform', 'instagram')
    .eq('is_active', true)
    .eq('api_host', 'instagram')
    .not('token_expires_at', 'is', null)
    .lt('token_expires_at', cutoff)
  if (error) return NextResponse.json({ error: 'Could not load accounts.' }, { status: 500 })
  const results = []
  for (const { id } of data ?? []) {
    try {
      results.push({ id, ...(await refreshAccountToken(id)), ok: true })
    } catch (err) {
      console.error('[social-token-refresh] failed', { id, message: err instanceof Error ? err.message : err })
      results.push({ id, ok: false })
    }
  }
  return NextResponse.json({ refreshed: results })
}

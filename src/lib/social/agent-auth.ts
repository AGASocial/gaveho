import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { type AgentScope, bearerToken, hashAgentKey, looksLikeAgentKey } from './agent-keys'

export type { AgentScope } from './agent-keys'
export { scopeAllows } from './agent-keys'

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { ...noStoreHeaders, 'WWW-Authenticate': 'Bearer' } })

function matchesLegacyKey(supplied: string) {
  const key = process.env.SOCIAL_AGENT_API_KEY
  if (!key) return false
  // Compare fixed-length digests so timing does not leak length or content.
  const a = createHash('sha256').update(supplied).digest()
  const b = createHash('sha256').update(key).digest()
  return timingSafeEqual(a, b)
}

/**
 * Agent API auth: `Authorization: Bearer <key>`.
 * - `gsk_…` keys from gaveho_social_agent_keys (hashed lookup, revocable, scoped to allowed accounts).
 * - Deprecated: `SOCIAL_AGENT_API_KEY` env var, scoped to all accounts.
 * Returns the scope, or a 401/500 response.
 */
export async function requireAgentApi(request: Request): Promise<AgentScope | NextResponse> {
  const supplied = bearerToken(request.headers.get('authorization'))
  if (!supplied) return unauthorized()
  if (matchesLegacyKey(supplied)) return { keyId: null, accountIds: null }
  if (!looksLikeAgentKey(supplied)) return unauthorized()
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('gaveho_social_agent_keys')
    .select('id,allowed_account_ids,revoked_at')
    .eq('key_hash', hashAgentKey(supplied))
    .maybeSingle<{ id: string; allowed_account_ids: string[] | null; revoked_at: string | null }>()
  if (error) {
    console.error('[agent-auth] key lookup failed:', error.message)
    return NextResponse.json({ error: 'Could not verify API key.' }, { status: 500, headers: noStoreHeaders })
  }
  if (!data || data.revoked_at) return unauthorized()
  const { error: touchError } = await db.from('gaveho_social_agent_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  if (touchError) console.error('[agent-auth] last_used_at update failed:', touchError.message)
  return { keyId: data.id, accountIds: data.allowed_account_ids ?? [] }
}

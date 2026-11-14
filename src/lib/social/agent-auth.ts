import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  type AgentPermissionScope,
  type AgentScope,
  bearerToken,
  hashAgentKey,
  looksLikeAgentKey,
  scopeHasPermission,
} from './agent-keys'

export type { AgentPermissionScope, AgentScope } from './agent-keys'
export { scopeAllows, scopeHasPermission } from './agent-keys'

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
 * - `gsk_…` keys from gaveho_social_agent_keys (hashed lookup, revocable, scoped to allowed accounts + permission scopes).
 * - Deprecated: `SOCIAL_AGENT_API_KEY` env var, scoped to all accounts (no blog permission scopes).
 * Returns the scope, or a 401/500 response.
 */
export async function requireAgentApi(request: Request): Promise<AgentScope | NextResponse> {
  const supplied = bearerToken(request.headers.get('authorization'))
  if (!supplied) return unauthorized()
  // Legacy social env key: all accounts, no blog permissions.
  if (matchesLegacyKey(supplied)) return { keyId: null, accountIds: null, permissions: [] }
  if (!looksLikeAgentKey(supplied)) return unauthorized()
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('gaveho_social_agent_keys')
    .select('id,allowed_account_ids,scopes,revoked_at')
    .eq('key_hash', hashAgentKey(supplied))
    .maybeSingle<{ id: string; allowed_account_ids: string[] | null; scopes: string[] | null; revoked_at: string | null }>()
  if (error) {
    console.error('[agent-auth] key lookup failed:', error.message)
    return NextResponse.json({ error: 'Could not verify API key.' }, { status: 500, headers: noStoreHeaders })
  }
  if (!data || data.revoked_at) return unauthorized()
  const { error: touchError } = await db.from('gaveho_social_agent_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  if (touchError) console.error('[agent-auth] last_used_at update failed:', touchError.message)
  const permissions = (data.scopes ?? []).filter((s): s is AgentPermissionScope => s === 'blog:read' || s === 'blog:write')
  return { keyId: data.id, accountIds: data.allowed_account_ids ?? [], permissions }
}

/** Require a Bearer agent key that includes the given permission (blog:write implies blog:read). */
export async function requireAgentPermission(
  request: Request,
  permission: AgentPermissionScope,
): Promise<AgentScope | NextResponse> {
  const scope = await requireAgentApi(request)
  if (scope instanceof NextResponse) return scope
  if (!scopeHasPermission(scope, permission)) {
    return NextResponse.json(
      { error: `This API key is missing the ${permission} scope.` },
      { status: 403, headers: noStoreHeaders },
    )
  }
  return scope
}

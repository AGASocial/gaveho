import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { isUndefinedColumnError } from '@/lib/supabase-errors'
import { supabaseAdmin } from '@/lib/supabase'
import { generateAgentKey, parseAgentPermissionScopes } from '@/lib/social/agent-keys'

export const dynamic = 'force-dynamic'

// Never select key_hash into responses.
const KEY_COLUMNS_WITH_SCOPES = 'id,name,key_prefix,allowed_account_ids,scopes,created_at,last_used_at,revoked_at'
const KEY_COLUMNS_BASE = 'id,name,key_prefix,allowed_account_ids,created_at,last_used_at,revoked_at'
const SCOPES_MIGRATION_MSG =
  'Database migration required: scopes column is missing on gaveho_social_agent_keys. Apply migrations before creating keys with permission scopes.'

const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStoreHeaders })

function withEmptyScopes<T extends Record<string, unknown>>(row: T): T & { scopes: string[] } {
  return { ...row, scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [] }
}

async function selectKeys() {
  const primary = await supabaseAdmin()
    .from('gaveho_social_agent_keys')
    .select(KEY_COLUMNS_WITH_SCOPES)
    .order('created_at', { ascending: false })
  if (!primary.error) return primary
  if (!isUndefinedColumnError(primary.error)) return primary
  console.warn('[admin/agent-keys] scopes column missing; listing without scopes')
  const fallback = await supabaseAdmin()
    .from('gaveho_social_agent_keys')
    .select(KEY_COLUMNS_BASE)
    .order('created_at', { ascending: false })
  if (fallback.error || !fallback.data) return fallback
  return {
    data: fallback.data.map((row) => withEmptyScopes(row as unknown as Record<string, unknown>)),
    error: null,
  }
}

export async function GET() {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const { data, error } = await selectKeys()
  if (error) return err(500, 'Could not load API keys.')
  return NextResponse.json({ keys: data }, { headers: noStoreHeaders })
}

// POST { name, accountIds?: string[], scopes?: ('blog:read'|'blog:write')[] }
// → { key: {...}, plaintext } (plaintext is returned once and never stored).
// At least one account or one permission scope is required.
export async function POST(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const body = (await request.json().catch(() => null)) as { name?: unknown; accountIds?: unknown; scopes?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : ''
  if (!name) return err(422, 'name is required.')
  const ids = Array.isArray(body?.accountIds) ? [...new Set(body.accountIds.filter((v): v is string => typeof v === 'string'))] : []
  const scopesParsed = parseAgentPermissionScopes(body?.scopes)
  if (!scopesParsed.ok) return err(422, scopesParsed.error)
  if (ids.length === 0 && scopesParsed.scopes.length === 0) {
    return err(422, 'Pick at least one account or one scope (e.g. blog:write).')
  }
  const db = supabaseAdmin()
  if (ids.length > 0) {
    const { data: accounts, error: accError } = await db.from('gaveho_social_accounts').select('id').in('id', ids)
    if (accError || accounts?.length !== ids.length) return err(422, 'Unknown account in accountIds.')
  }
  const { key, prefix, hash } = generateAgentKey()
  const insertWithScopes = {
    name,
    key_prefix: prefix,
    key_hash: hash,
    allowed_account_ids: ids,
    scopes: scopesParsed.scopes,
    created_by: guard.id,
  }
  const created = await db.from('gaveho_social_agent_keys').insert(insertWithScopes).select(KEY_COLUMNS_WITH_SCOPES).single()
  let keyRow: Record<string, unknown> | null =
    created.data && typeof created.data === 'object' ? (created.data as unknown as Record<string, unknown>) : null
  let createError = created.error
  if (createError && isUndefinedColumnError(createError)) {
    if (scopesParsed.scopes.length > 0) return err(503, SCOPES_MIGRATION_MSG)
    console.warn('[admin/agent-keys] scopes column missing; creating social-only key without scopes')
    const retry = await db
      .from('gaveho_social_agent_keys')
      .insert({
        name,
        key_prefix: prefix,
        key_hash: hash,
        allowed_account_ids: ids,
        created_by: guard.id,
      })
      .select(KEY_COLUMNS_BASE)
      .single()
    if (retry.error || !retry.data) {
      console.error('[admin/agent-keys] create failed:', retry.error?.message)
      return err(500, 'Could not create API key.')
    }
    keyRow = withEmptyScopes(retry.data as unknown as Record<string, unknown>)
    createError = null
  }
  if (createError || !keyRow) {
    console.error('[admin/agent-keys] create failed:', createError?.message)
    return err(500, 'Could not create API key.')
  }
  return NextResponse.json({ key: keyRow, plaintext: key }, { status: 201, headers: noStoreHeaders })
}

// DELETE ?id= → revokes (keeps the row for audit).
export async function DELETE(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return err(422, 'id required')
  const revoke = (columns: string) =>
    supabaseAdmin()
      .from('gaveho_social_agent_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .is('revoked_at', null)
      .select(columns)
      .maybeSingle()
  const primary = await revoke(KEY_COLUMNS_WITH_SCOPES)
  let keyRow: Record<string, unknown> | null =
    primary.data && typeof primary.data === 'object' ? (primary.data as unknown as Record<string, unknown>) : null
  let revokeError = primary.error
  if (revokeError && isUndefinedColumnError(revokeError)) {
    console.warn('[admin/agent-keys] scopes column missing; revoking without scopes in response')
    const retry = await revoke(KEY_COLUMNS_BASE)
    if (retry.error) return err(500, 'Could not revoke API key.')
    keyRow = retry.data && typeof retry.data === 'object' ? withEmptyScopes(retry.data as unknown as Record<string, unknown>) : null
    revokeError = null
  }
  if (revokeError) return err(500, 'Could not revoke API key.')
  if (!keyRow) return err(404, 'Key not found or already revoked.')
  return NextResponse.json({ key: keyRow }, { headers: noStoreHeaders })
}

import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { generateAgentKey } from '@/lib/social/agent-keys'

export const dynamic = 'force-dynamic'

// Never select key_hash into responses.
const KEY_COLUMNS = 'id,name,key_prefix,allowed_account_ids,created_at,last_used_at,revoked_at'
const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStoreHeaders })

export async function GET() {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const { data, error } = await supabaseAdmin().from('gaveho_social_agent_keys').select(KEY_COLUMNS).order('created_at', { ascending: false })
  if (error) return err(500, 'Could not load API keys.')
  return NextResponse.json({ keys: data }, { headers: noStoreHeaders })
}

// POST { name, accountIds: string[] } → { key: {...}, plaintext } (plaintext is returned once and never stored).
export async function POST(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const body = (await request.json().catch(() => null)) as { name?: unknown; accountIds?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : ''
  if (!name) return err(422, 'name is required.')
  const ids = Array.isArray(body?.accountIds) ? [...new Set(body.accountIds.filter((v): v is string => typeof v === 'string'))] : []
  if (ids.length === 0) return err(422, 'Pick at least one account.')
  const db = supabaseAdmin()
  const { data: accounts, error: accError } = await db.from('gaveho_social_accounts').select('id').in('id', ids)
  if (accError || accounts?.length !== ids.length) return err(422, 'Unknown account in accountIds.')
  const { key, prefix, hash } = generateAgentKey()
  const { data, error } = await db
    .from('gaveho_social_agent_keys')
    .insert({ name, key_prefix: prefix, key_hash: hash, allowed_account_ids: ids, created_by: guard.id })
    .select(KEY_COLUMNS)
    .single()
  if (error || !data) return err(500, 'Could not create API key.')
  return NextResponse.json({ key: data, plaintext: key }, { status: 201, headers: noStoreHeaders })
}

// DELETE ?id= → revokes (keeps the row for audit).
export async function DELETE(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return err(422, 'id required')
  const { data, error } = await supabaseAdmin()
    .from('gaveho_social_agent_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    .select(KEY_COLUMNS)
    .maybeSingle()
  if (error) return err(500, 'Could not revoke API key.')
  if (!data) return err(404, 'Key not found or already revoked.')
  return NextResponse.json({ key: data }, { headers: noStoreHeaders })
}

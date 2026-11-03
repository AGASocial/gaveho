import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { encryptToken } from '@/lib/social/crypto'
import { refreshLongLivedToken, resolveTokenAccounts } from '@/lib/social/instagram'
import { ACCOUNT_PUBLIC_COLUMNS } from '@/lib/social/store'

// Add an Instagram account (or replace the token of an existing one) by pasting an access token.
export async function POST(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  if (!process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.' }, { status: 500, headers: noStoreHeaders })
  }
  const body = (await request.json().catch(() => null)) as { token?: unknown; label?: unknown } | null
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 80) : ''
  if (token.length < 20 || /\s/.test(token)) return NextResponse.json({ error: 'Pega un token de acceso válido.' }, { status: 422, headers: noStoreHeaders })

  let accounts
  try {
    accounts = await resolveTokenAccounts(token)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token validation failed.'
    return NextResponse.json({ error: `Token inválido: ${message}` }, { status: 422, headers: noStoreHeaders })
  }

  // Instagram-login long-lived tokens can be refreshed, which tells us their expiry.
  // Non-expiring / short-lived / system user tokens fail here and are stored as-is with no expiry.
  let stored = token
  let expiresAt: string | null = null
  if (accounts[0].host === 'instagram') {
    try {
      const fresh = await refreshLongLivedToken(token)
      stored = fresh.accessToken
      expiresAt = fresh.expiresAt
    } catch {}
  }

  const now = new Date().toISOString()
  const rows = accounts.map((a) => ({
    platform: 'instagram',
    api_host: a.host,
    ig_user_id: a.igUserId,
    username: a.username,
    label: (accounts.length === 1 && label) || a.username || a.igUserId,
    access_token_encrypted: encryptToken(stored),
    token_expires_at: expiresAt,
    token_refreshed_at: now,
    is_active: true,
  }))
  const db = supabaseAdmin()
  // Keep an existing label when replacing a token and no new label was given.
  const { data: existing } = await db.from('gaveho_social_accounts').select('ig_user_id,label').eq('platform', 'instagram').in('ig_user_id', rows.map((r) => r.ig_user_id))
  for (const row of rows) {
    const prev = existing?.find((e) => e.ig_user_id === row.ig_user_id)
    if (prev && !(accounts.length === 1 && label)) row.label = prev.label
  }
  const { data, error } = await db.from('gaveho_social_accounts').upsert(rows, { onConflict: 'platform,ig_user_id' }).select(ACCOUNT_PUBLIC_COLUMNS)
  if (error) {
    console.error('[social/accounts/token] upsert failed:', error.message)
    return NextResponse.json({ error: 'No se pudo guardar la cuenta.' }, { status: 500, headers: noStoreHeaders })
  }
  return NextResponse.json({ accounts: data, replaced: existing?.length ?? 0 }, { headers: noStoreHeaders })
}

import { supabaseAdmin } from '@/lib/supabase'
import { ACCOUNT_PUBLIC_COLUMNS } from './store'

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type PublicAccount = { id: string; platform: string; is_active: boolean; username: string | null; label: string }

/** Finds an account by id, username (with or without @) or label. */
export async function findAccount(ref: string): Promise<PublicAccount | null> {
  const value = ref.trim().replace(/^@/, '')
  if (!value) return null
  const db = supabaseAdmin()
  if (uuidRe.test(value)) {
    const { data } = await db.from('gaveho_social_accounts').select(ACCOUNT_PUBLIC_COLUMNS).eq('id', value).maybeSingle()
    return (data as unknown as PublicAccount) ?? null
  }
  const escaped = value.replace(/[%_\\]/g, '\\$&')
  for (const column of ['username', 'label']) {
    const { data } = await db.from('gaveho_social_accounts').select(ACCOUNT_PUBLIC_COLUMNS).ilike(column, escaped).limit(2)
    if (data?.length === 1) return data[0] as unknown as PublicAccount
  }
  return null
}

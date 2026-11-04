import { supabaseAdmin } from '@/lib/supabase'
import { decryptToken } from './crypto'
import { SOCIAL_BUCKET } from './store'

const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/'

/** Best-effort: revokes a TikTok access token. Never throws. */
export async function revokeTikTokToken(encryptedToken: string | null | undefined): Promise<void> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  if (!encryptedToken || !clientKey || !clientSecret) return
  try {
    const res = await fetch(TIKTOK_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token: decryptToken(encryptedToken) }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) console.warn('[account-cleanup] TikTok revoke failed:', res.status)
  } catch (err) {
    console.warn('[account-cleanup] TikTok revoke error:', err instanceof Error ? err.message : 'unknown')
  }
}

/** Best-effort: removes every object under agent/<accountId>/ in the social bucket. Never throws. */
export async function removeAgentUploads(accountId: string): Promise<void> {
  try {
    const storage = supabaseAdmin().storage.from(SOCIAL_BUCKET)
    for (let i = 0; i < 50; i++) {
      const { data, error } = await storage.list(`agent/${accountId}`, { limit: 1000 })
      if (error) throw error
      const paths = (data ?? []).filter((f) => f.id).map((f) => `agent/${accountId}/${f.name}`)
      if (!paths.length) return
      const { error: rmError } = await storage.remove(paths)
      if (rmError) throw rmError
    }
  } catch (err) {
    console.warn('[account-cleanup] agent upload removal failed:', err instanceof Error ? err.message : 'unknown')
  }
}

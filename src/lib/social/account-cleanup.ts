import { supabaseAdmin } from '@/lib/supabase'
import { decryptToken } from './crypto'
import { SOCIAL_BUCKET } from './store'
import { agentUploadPrefix } from './agent-uploads'
import { referencedAgentMedia } from './agent-cleanup'
import { deletableAccountAgentPaths } from './account-cleanup-paths'
import { refreshTikTokToken, tiktokConfig } from './tiktok'

const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/'
const PAGE = 1000
const REMOVE_BATCH = 100
const EXPIRY_SKEW_MS = 60 * 1000

type TikTokTokenRow = { access_token_encrypted: string | null; refresh_token_encrypted: string | null; token_expires_at: string | null }

/** Best-effort: revokes the account's TikTok access token, refreshing it first when expired. Never throws. */
export async function revokeTikTokToken(row: TikTokTokenRow | null | undefined): Promise<void> {
  const { clientKey, clientSecret } = tiktokConfig()
  if (!row?.access_token_encrypted || !clientKey || !clientSecret) return
  try {
    let token = decryptToken(row.access_token_encrypted)
    const expired = !row.token_expires_at || Date.parse(row.token_expires_at) - Date.now() < EXPIRY_SKEW_MS
    if (expired && row.refresh_token_encrypted) {
      try {
        token = (await refreshTikTokToken(decryptToken(row.refresh_token_encrypted))).accessToken
      } catch (err) {
        console.warn('[account-cleanup] TikTok refresh before revoke failed:', err instanceof Error ? err.message : 'unknown')
      }
    }
    const res = await fetch(TIKTOK_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) console.warn('[account-cleanup] TikTok revoke failed:', res.status)
  } catch (err) {
    console.warn('[account-cleanup] TikTok revoke error:', err instanceof Error ? err.message : 'unknown')
  }
}

/**
 * Best-effort: removes agent/<accountId>/ uploads that no remaining post references. Call after the
 * account's own posts are deleted. If the references cannot be loaded, nothing is deleted. Never throws.
 */
export async function removeAgentUploads(accountId: string): Promise<void> {
  try {
    const prefix = agentUploadPrefix(accountId)
    const folder = prefix.slice(0, -1)
    const storage = supabaseAdmin().storage.from(SOCIAL_BUCKET)
    const paths: string[] = []
    for (let offset = 0; ; ) {
      const { data, error } = await storage.list(folder, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error(`list ${folder}: ${error.message}`)
      if (!data?.length) break
      for (const f of data) if (f.id) paths.push(`${prefix}${f.name}`)
      offset += data.length
    }
    if (!paths.length) return
    // Throws on failure: never delete on partial reference data.
    const deletable = deletableAccountAgentPaths(accountId, paths, await referencedAgentMedia(), SOCIAL_BUCKET)
    for (let i = 0; i < deletable.length; i += REMOVE_BATCH) {
      const { error } = await storage.remove(deletable.slice(i, i + REMOVE_BATCH))
      if (error) throw new Error(`remove: ${error.message}`)
    }
  } catch (err) {
    console.warn('[account-cleanup] agent upload removal failed:', err instanceof Error ? err.message : 'unknown')
  }
}

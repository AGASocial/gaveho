import { supabaseAdmin } from '@/lib/supabase'
import { decryptToken, encryptToken } from './crypto'
import {
  buildPostInfo,
  initVideoPost,
  queryCreatorInfo,
  refreshTikTokToken,
  type TikTokOptions,
  type TikTokTokens,
  tiktokPermalink,
  waitForTikTokPublish,
} from './tiktok'

type TikTokAccountRow = {
  id: string
  platform: string
  username: string | null
  is_active: boolean
  access_token_encrypted: string
  refresh_token_encrypted: string | null
  token_expires_at: string | null
}

/** Refresh when the access token expires within this window. */
const REFRESH_SKEW_MS = 10 * 60 * 1000

export function tiktokTokenColumns(tokens: TikTokTokens) {
  return {
    access_token_encrypted: encryptToken(tokens.accessToken),
    refresh_token_encrypted: encryptToken(tokens.refreshToken),
    token_expires_at: tokens.expiresAt,
    refresh_token_expires_at: tokens.refreshExpiresAt,
    token_scope: tokens.scope,
    token_refreshed_at: new Date().toISOString(),
  }
}

async function loadTikTokAccount(accountId: string) {
  const { data, error } = await supabaseAdmin()
    .from('gaveho_social_accounts')
    .select('id,platform,username,is_active,access_token_encrypted,refresh_token_encrypted,token_expires_at')
    .eq('id', accountId)
    .maybeSingle<TikTokAccountRow>()
  if (error || !data) throw new Error('Social account not found.')
  if (data.platform !== 'tiktok') throw new Error('Not a TikTok account.')
  return data
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isFresh = (row: TikTokAccountRow) => Boolean(row.token_expires_at && new Date(row.token_expires_at).getTime() - Date.now() > REFRESH_SKEW_MS)
const current = (row: TikTokAccountRow) => ({ token: decryptToken(row.access_token_encrypted), expiresAt: row.token_expires_at!, username: row.username })

/**
 * Returns a usable access token, refreshing it when needed (or always, with force).
 * TikTok rotates the refresh token on every refresh, so refreshes are serialized per account with a short
 * lease taken through a service_role-only SECURITY DEFINER RPC (gaveho_try_lock_social_token_refresh).
 * Whoever loses the lease waits for the winner and uses the token it stored. The final write is also a
 * compare-and-swap on the old refresh token; on a CAS loss we re-read and use the winner's token.
 */
export async function refreshTikTokAccount(accountId: string, force = true): Promise<{ token: string; expiresAt: string; username: string | null }> {
  const db = supabaseAdmin()
  const row = await loadTikTokAccount(accountId)
  if (!row.is_active) throw new Error('Social account is disabled.')
  if (!force && isFresh(row)) return current(row)
  if (!row.refresh_token_encrypted) throw new Error('TikTok account has no refresh token; reconnect it in /admin/social.')

  const { data: locked, error: lockError } = await db.rpc('gaveho_try_lock_social_token_refresh', { p_account_id: accountId, p_lease_seconds: 30 })
  if (lockError) throw new Error('Could not lock the TikTok token for refresh (is the TikTok migration applied?).')
  if (!locked) {
    // Another request is refreshing: wait for its token.
    for (let i = 0; i < 20; i++) {
      await sleep(1000)
      const again = await loadTikTokAccount(accountId)
      if (again.refresh_token_encrypted !== row.refresh_token_encrypted && isFresh(again)) return current(again)
    }
    throw new Error('Timed out waiting for a concurrent TikTok token refresh.')
  }
  try {
    // Re-read under the lease: a refresh may have finished between our first read and the lock.
    const latest = await loadTikTokAccount(accountId)
    if (latest.refresh_token_encrypted !== row.refresh_token_encrypted && isFresh(latest)) return current(latest)
    const tokens = await refreshTikTokToken(decryptToken(latest.refresh_token_encrypted!)).catch((e: unknown) => {
      throw new Error(`TikTok token refresh failed (reconnect the account if this persists): ${e instanceof Error ? e.message : 'unknown error'}`)
    })
    const { data, error } = await db
      .from('gaveho_social_accounts')
      .update({ ...tiktokTokenColumns(tokens), token_refresh_locked_until: null })
      .eq('id', accountId)
      .eq('refresh_token_encrypted', latest.refresh_token_encrypted!)
      .select('id')
    if (error) throw error
    if (data?.length) return { token: tokens.accessToken, expiresAt: tokens.expiresAt, username: latest.username }
    const winner = await loadTikTokAccount(accountId)
    if (isFresh(winner)) return current(winner)
    throw new Error('TikTok token changed during refresh; try again.')
  } finally {
    await db.from('gaveho_social_accounts').update({ token_refresh_locked_until: null }).eq('id', accountId)
  }
}

export const getTikTokAccessToken = (accountId: string) => refreshTikTokAccount(accountId, false)

export type TikTokClaimedPost = {
  id: string
  account_id: string
  caption: string
  media_urls: string[]
  thumb_offset?: number | null
  container_id?: string | null
  container_created_at?: string | null
  tiktok_options?: TikTokOptions | null
}

/** TikTok upload URLs and pulls time out after ~1 h; give processing a day before giving up. */
const PUBLISH_TTL_MS = 23 * 60 * 60 * 1000

/**
 * Direct Post for a claimed ('publishing') TikTok post. Stores the publish_id in container_id so the
 * publisher cron can resume polling. Throws on failure (the caller marks the post failed).
 */
export async function publishTikTokPost(post: TikTokClaimedPost, waitMs: number) {
  const db = supabaseAdmin()
  const { token, username } = await getTikTokAccessToken(post.account_id)
  let publishId = post.container_id ?? null
  if (publishId && post.container_created_at && Date.now() - new Date(post.container_created_at).getTime() > PUBLISH_TTL_MS) {
    throw new Error('TikTok did not finish processing the video within 23 h. Retry to upload again.')
  }
  if (!publishId) {
    const creator = await queryCreatorInfo(token)
    const postInfo = buildPostInfo({ caption: post.caption, options: post.tiktok_options ?? null, creator, coverTimestampMs: post.thumb_offset })
    const init = await initVideoPost({ token, videoUrl: post.media_urls[0], postInfo })
    publishId = init.publishId
    const { error } = await db
      .from('gaveho_social_posts')
      .update({ container_id: publishId, container_created_at: new Date().toISOString() })
      .eq('id', post.id)
      .eq('status', 'publishing')
    if (error) throw error
  }
  const result = await waitForTikTokPublish(token, publishId, waitMs)
  if (result.state === 'in_progress') return { state: 'in_progress' as const, publishId }
  const postId = result.postIds[0] ?? null
  // Private (SELF_ONLY) posts never get a public post id; keep the publish_id as the media id.
  return { state: 'complete' as const, mediaId: postId ?? publishId, permalink: postId ? tiktokPermalink(username, postId) : null }
}

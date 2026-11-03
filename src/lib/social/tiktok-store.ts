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

/**
 * Rotates the refresh token. Compare-and-swap on the stored (encrypted) refresh token so two concurrent
 * refreshes (cron + publish) cannot overwrite each other with a token TikTok already invalidated.
 */
export async function refreshTikTokAccount(accountId: string, force = true): Promise<{ token: string; expiresAt: string; username: string | null }> {
  const db = supabaseAdmin()
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await loadTikTokAccount(accountId)
    if (!row.is_active) throw new Error('Social account is disabled.')
    const fresh = row.token_expires_at && new Date(row.token_expires_at).getTime() - Date.now() > REFRESH_SKEW_MS
    if (fresh && (!force || attempt > 0)) return { token: decryptToken(row.access_token_encrypted), expiresAt: row.token_expires_at!, username: row.username }
    if (!row.refresh_token_encrypted) throw new Error('TikTok account has no refresh token; reconnect it in /admin/social.')
    const tokens = await refreshTikTokToken(decryptToken(row.refresh_token_encrypted)).catch((e: unknown) => {
      throw new Error(`TikTok token refresh failed (reconnect the account if this persists): ${e instanceof Error ? e.message : 'unknown error'}`)
    })
    const { data, error } = await db
      .from('gaveho_social_accounts')
      .update(tiktokTokenColumns(tokens))
      .eq('id', accountId)
      .eq('refresh_token_encrypted', row.refresh_token_encrypted)
      .select('id')
    if (error) throw error
    if (data?.length) return { token: tokens.accessToken, expiresAt: tokens.expiresAt, username: row.username }
    // Lost the race: someone else stored a newer token; reload and use it.
    force = false
  }
  throw new Error('Could not refresh the TikTok token.')
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

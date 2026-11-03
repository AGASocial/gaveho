import { supabaseAdmin } from '@/lib/supabase'
import { decryptToken, encryptToken } from './crypto'
import { type ApiHost, createReelContainer, publishInstagramMedia, publishReelContainer, refreshLongLivedToken, waitForReelContainer } from './instagram'

export const SOCIAL_BUCKET = 'gaveho-social'
export const ACCOUNT_PUBLIC_COLUMNS = 'id,platform,api_host,label,ig_user_id,username,caption_voice,token_expires_at,token_refreshed_at,is_active,created_at,updated_at'

export function socialMediaPrefix() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  return url ? `${url}/storage/v1/object/public/${SOCIAL_BUCKET}/` : ''
}

type AccountRow = { id: string; platform: string; api_host: ApiHost; ig_user_id: string | null; access_token_encrypted: string; is_active: boolean }

async function loadAccountWithToken(accountId: string) {
  const { data, error } = await supabaseAdmin()
    .from('gaveho_social_accounts')
    .select('id,platform,api_host,ig_user_id,access_token_encrypted,is_active')
    .eq('id', accountId)
    .maybeSingle<AccountRow>()
  if (error || !data) throw new Error('Social account not found.')
  if (!data.is_active) throw new Error('Social account is disabled.')
  if (data.platform !== 'instagram' || !data.ig_user_id) throw new Error(`Publishing to ${data.platform} is not supported yet.`)
  return { ...data, token: decryptToken(data.access_token_encrypted) }
}

export type ClaimedPost = {
  id: string
  account_id: string
  caption: string
  media_urls: string[]
  media_type?: 'image' | 'reel' | string | null
  cover_url?: string | null
  thumb_offset?: number | null
  share_to_feed?: boolean | null
  container_id?: string | null
  container_created_at?: string | null
}

export type PublishResult =
  | { id: string; status: 'published'; permalink: string | null; mediaId: string }
  | { id: string; status: 'publishing'; containerId: string; message: string }
  | { id: string; status: 'failed'; error: string }

/** Meta media containers expire after 24 h. */
const CONTAINER_TTL_MS = 23 * 60 * 60 * 1000
export const REEL_INLINE_WAIT_MS = 40_000

/**
 * Publishes a post that the caller has already moved to status 'publishing'
 * (claimed atomically), then records the outcome. Reels that are still processing at Meta
 * after `reelWaitMs` stay in 'publishing' with their container_id; the cron resumes them.
 */
export async function publishClaimedPost(post: ClaimedPost, opts: { reelWaitMs?: number } = {}): Promise<PublishResult> {
  const db = supabaseAdmin()
  try {
    const account = await loadAccountWithToken(post.account_id)
    const api = { token: account.token, host: account.api_host ?? 'instagram' }
    let result: { mediaId: string; permalink: string | null }
    if (post.media_type === 'reel') {
      let containerId = post.container_id ?? null
      if (containerId && post.container_created_at && Date.now() - new Date(post.container_created_at).getTime() > CONTAINER_TTL_MS) {
        throw new Error('Instagram media container expired before the video finished processing. Retry to upload again.')
      }
      if (!containerId) {
        containerId = await createReelContainer({
          ...api,
          igUserId: account.ig_user_id!,
          videoUrl: post.media_urls[0],
          caption: post.caption,
          coverUrl: post.cover_url,
          thumbOffset: post.thumb_offset,
          shareToFeed: post.share_to_feed ?? true,
        })
        const { error } = await db
          .from('gaveho_social_posts')
          .update({ container_id: containerId, container_created_at: new Date().toISOString() })
          .eq('id', post.id)
          .eq('status', 'publishing')
        if (error) throw error
      }
      const state = await waitForReelContainer(api, containerId, opts.reelWaitMs ?? REEL_INLINE_WAIT_MS)
      if (state === 'in_progress') {
        await db.from('gaveho_social_posts').update({ last_attempt_at: new Date().toISOString() }).eq('id', post.id).eq('status', 'publishing')
        return { id: post.id, status: 'publishing', containerId, message: 'Instagram is still processing the video; the publisher cron will finish it (runs every 15 minutes).' }
      }
      result = await publishReelContainer({ ...api, igUserId: account.ig_user_id!, containerId })
    } else {
      result = await publishInstagramMedia({ ...api, igUserId: account.ig_user_id!, imageUrls: post.media_urls, caption: post.caption })
    }
    const { error } = await db
      .from('gaveho_social_posts')
      .update({ status: 'published', published_media_id: result.mediaId, published_permalink: result.permalink, published_at: new Date().toISOString(), error: null })
      .eq('id', post.id)
      .eq('status', 'publishing')
    if (error) throw error
    return { id: post.id, status: 'published', permalink: result.permalink, mediaId: result.mediaId }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Publishing failed.'
    console.error('[social] publish failed', { postId: post.id, message })
    // Drop the container so a retry starts with a fresh one.
    await db
      .from('gaveho_social_posts')
      .update({ status: 'failed', error: message.slice(0, 1000), container_id: null, container_created_at: null })
      .eq('id', post.id)
      .eq('status', 'publishing')
    return { id: post.id, status: 'failed', error: message }
  }
}

export async function refreshAccountToken(accountId: string) {
  const db = supabaseAdmin()
  const account = await loadAccountWithToken(accountId)
  if (account.api_host === 'facebook') throw new Error('Facebook-login tokens are not refreshable here; paste a new token instead.')
  const fresh = await refreshLongLivedToken(account.token)
  const { error } = await db
    .from('gaveho_social_accounts')
    .update({ access_token_encrypted: encryptToken(fresh.accessToken), token_expires_at: fresh.expiresAt, token_refreshed_at: new Date().toISOString() })
    .eq('id', accountId)
  if (error) throw error
  return { expiresAt: fresh.expiresAt }
}

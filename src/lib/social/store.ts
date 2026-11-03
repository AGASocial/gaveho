import { supabaseAdmin } from '@/lib/supabase'
import { decryptToken, encryptToken } from './crypto'
import { type ApiHost, publishInstagramMedia, refreshLongLivedToken } from './instagram'

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

/**
 * Publishes a post that the caller has already moved to status 'publishing'
 * (claimed atomically), then records the outcome.
 */
export async function publishClaimedPost(post: { id: string; account_id: string; caption: string; media_urls: string[] }) {
  const db = supabaseAdmin()
  try {
    const account = await loadAccountWithToken(post.account_id)
    const result = await publishInstagramMedia({ token: account.token, host: account.api_host ?? 'instagram', igUserId: account.ig_user_id!, imageUrls: post.media_urls, caption: post.caption })
    const { error } = await db
      .from('gaveho_social_posts')
      .update({ status: 'published', published_media_id: result.mediaId, published_permalink: result.permalink, published_at: new Date().toISOString(), error: null })
      .eq('id', post.id)
      .eq('status', 'publishing')
    if (error) throw error
    return { id: post.id, status: 'published' as const, permalink: result.permalink, mediaId: result.mediaId }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Publishing failed.'
    console.error('[social] publish failed', { postId: post.id, message })
    await db.from('gaveho_social_posts').update({ status: 'failed', error: message.slice(0, 1000) }).eq('id', post.id).eq('status', 'publishing')
    return { id: post.id, status: 'failed' as const, error: message }
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

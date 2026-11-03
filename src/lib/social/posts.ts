import { supabaseAdmin } from '@/lib/supabase'
import { publishClaimedPost } from './store'
import type { CreatePostInput } from './validation'

export const POST_LIST_COLUMNS =
  'id,account_id,platform,caption,media_urls,media_type,cover_url,thumb_offset,share_to_feed,status,scheduled_at,published_at,published_media_id,published_permalink,error,created_at,account:gaveho_social_accounts(label,username)'

export class PostError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** Shared post creation (admin UI + agent API): draft / scheduled insert, or claim as 'publishing' and publish now. */
export async function createSocialPost(input: CreatePostInput, createdBy: string | null, opts: { reelWaitMs?: number } = {}) {
  const db = supabaseAdmin()
  const { data: account } = await db.from('gaveho_social_accounts').select('id,platform,is_active').eq('id', input.accountId).maybeSingle()
  if (!account?.is_active) throw new PostError(422, 'Account not found or disabled.')
  const status = input.mode === 'draft' ? 'draft' : input.mode === 'schedule' ? 'scheduled' : 'publishing'
  const { data: post, error } = await db
    .from('gaveho_social_posts')
    .insert({
      account_id: account.id,
      platform: account.platform,
      caption: input.caption,
      media_urls: input.mediaUrls,
      media_type: input.mediaType,
      cover_url: input.coverUrl,
      thumb_offset: input.thumbOffset,
      share_to_feed: input.shareToFeed,
      status,
      scheduled_at: input.scheduledAt,
      created_by: createdBy,
      publish_attempts: status === 'publishing' ? 1 : 0,
      last_attempt_at: status === 'publishing' ? new Date().toISOString() : null,
    })
    .select('id,account_id,caption,media_urls,media_type,cover_url,thumb_offset,share_to_feed,container_id,container_created_at,status,scheduled_at')
    .single()
  if (error || !post) throw new PostError(500, 'Could not save post.')
  if (status !== 'publishing') return { post, result: null }
  return { post, result: await publishClaimedPost(post, opts) }
}

export async function listSocialPosts(filter: { status?: string; accountId?: string; accountIds?: string[]; limit?: number } = {}) {
  if (filter.accountIds && filter.accountIds.length === 0) return []
  let q = supabaseAdmin().from('gaveho_social_posts').select(POST_LIST_COLUMNS).order('created_at', { ascending: false }).limit(filter.limit ?? 50)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.accountId) q = q.eq('account_id', filter.accountId)
  if (filter.accountIds) q = q.in('account_id', filter.accountIds)
  const { data, error } = await q
  if (error) throw new PostError(500, 'Could not load posts.')
  return data
}

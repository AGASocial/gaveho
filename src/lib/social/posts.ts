import { supabaseAdmin } from '@/lib/supabase'
import { type ClaimedPost, publishClaimedPost } from './store'
import type { CreatePostInput } from './validation'

export const POST_LIST_COLUMNS =
  'id,account_id,platform,caption,media_urls,media_type,cover_url,thumb_offset,share_to_feed,status,scheduled_at,published_at,published_media_id,published_permalink,error,created_at,account:gaveho_social_accounts(label,username)'

export class PostError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const BASE_POST_COLUMNS = 'id,account_id,platform,caption,media_urls,media_type,cover_url,thumb_offset,share_to_feed,container_id,container_created_at,status,scheduled_at'

export type CreateOptions = {
  reelWaitMs?: number
  /** Queue instead of publishing inline: the publisher cron picks it up within ~15 minutes. */
  enqueue?: boolean
}

/** Shared post creation (admin UI + agent API): draft / scheduled insert, or claim as 'publishing' and publish now. */
export async function createSocialPost(input: CreatePostInput, createdBy: string | null, opts: CreateOptions = {}) {
  const db = supabaseAdmin()
  const { data: account } = await db.from('gaveho_social_accounts').select('id,platform,is_active').eq('id', input.accountId).maybeSingle()
  if (!account?.is_active) throw new PostError(422, 'Account not found or disabled.')
  const tiktok = account.platform === 'tiktok'
  if (tiktok && input.mediaType !== 'reel') throw new PostError(422, 'TikTok accounts only take videos (type reel).')
  const queued = input.mode === 'now' && opts.enqueue
  const status = input.mode === 'draft' ? 'draft' : input.mode === 'schedule' || queued ? 'scheduled' : 'publishing'
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
      // Only TikTok rows touch tiktok_options, so Instagram keeps working before the TikTok migration is applied.
      ...(tiktok ? { tiktok_options: input.tiktok ?? {} } : {}),
      status,
      scheduled_at: queued ? new Date().toISOString() : input.scheduledAt,
      created_by: createdBy,
      publish_attempts: status === 'publishing' ? 1 : 0,
      last_attempt_at: status === 'publishing' ? new Date().toISOString() : null,
    })
    .select(tiktok ? `${BASE_POST_COLUMNS},tiktok_options` : BASE_POST_COLUMNS)
    .single<ClaimedPost & { status: string; scheduled_at: string | null }>()
  if (error || !post) throw new PostError(500, 'Could not save post.')
  if (queued) return { post, result: { id: post.id, status: 'scheduled' as const, message: 'Queued: the publisher cron publishes it within ~15 minutes.' } }
  if (status !== 'publishing') return { post, result: null }
  return { post, result: await publishClaimedPost(post, opts) }
}

export type AccountOutcome =
  | { accountId: string; ok: true; post: Awaited<ReturnType<typeof createSocialPost>>['post']; result: Awaited<ReturnType<typeof createSocialPost>>['result'] }
  | { accountId: string; ok: false; status: number; error: string }

/**
 * Creates the post for input.accountId and one copy per input.alsoAccountIds (e.g. the same video on
 * Instagram and TikTok). Every account is validated before anything is inserted; after that each account
 * succeeds or fails on its own (a failure never hides another account's success).
 * Extra accounts are always queued for the cron (no inline publish), so a request publishes inline at most
 * once and stays within the route's maxDuration. `enqueueTikTok` also queues a TikTok primary.
 */
export async function createSocialPosts(input: CreatePostInput, createdBy: string | null, opts: { reelWaitMs?: number; enqueueTikTok?: boolean } = {}): Promise<AccountOutcome[]> {
  const ids = [input.accountId, ...input.alsoAccountIds.filter((id) => id !== input.accountId)]
  const { data } = await supabaseAdmin().from('gaveho_social_accounts').select('id,platform,is_active').in('id', ids)
  for (const id of ids) {
    const a = data?.find((x) => x.id === id)
    if (!a?.is_active) throw new PostError(422, 'Account not found or disabled.')
    if (a.platform === 'tiktok' && input.mediaType !== 'reel') throw new PostError(422, 'TikTok accounts only take videos (type reel).')
  }
  const outcomes: AccountOutcome[] = []
  for (const [i, id] of ids.entries()) {
    const platform = data?.find((x) => x.id === id)?.platform
    const enqueue = i > 0 || (opts.enqueueTikTok === true && platform === 'tiktok')
    try {
      const { post, result } = await createSocialPost({ ...input, accountId: id, alsoAccountIds: [] }, createdBy, { reelWaitMs: opts.reelWaitMs, enqueue })
      outcomes.push({ accountId: id, ok: true, post, result })
    } catch (e) {
      if (i === 0 && ids.length === 1) throw e
      outcomes.push({ accountId: id, ok: false, status: e instanceof PostError ? e.status : 500, error: e instanceof Error ? e.message : 'Could not create post.' })
    }
  }
  return outcomes
}

/** HTTP status for a multi-account create: the single status when all agree, 207 when they differ. */
export function outcomeStatus(o: AccountOutcome, created = 200) {
  if (!o.ok) return o.status
  const s = o.result?.status
  return s === 'failed' ? 502 : s === 'publishing' || s === 'scheduled' ? 202 : created
}

export function multiStatus(codes: number[]) {
  return codes.every((c) => c === codes[0]) ? codes[0] : 207
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

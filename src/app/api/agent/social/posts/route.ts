import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { findAccount } from '@/lib/social/accounts'
import { requireAgentApi, scopeAllows } from '@/lib/social/agent-auth'
import { type ImageInput, ingestImage, ingestVideo, type VideoInput } from '@/lib/social/media'
import { createSocialPost, listSocialPosts, PostError } from '@/lib/social/posts'
import { socialMediaPrefix } from '@/lib/social/store'
import { MAX_MEDIA, parseCreatePost } from '@/lib/social/validation'

// Reel videos (≤ 300 MB) are downloaded and stored before the inline publish attempt.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed']
const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStoreHeaders })

// GET ?status=&account=&limit= — recent posts.
export async function GET(request: Request) {
  const scope = await requireAgentApi(request)
  if (scope instanceof NextResponse) return scope
  const params = new URL(request.url).searchParams
  const status = params.get('status') ?? undefined
  if (status && !STATUSES.includes(status)) return err(422, `status must be one of ${STATUSES.join(', ')}.`)
  let accountId: string | undefined
  const accountRef = params.get('account')
  if (accountRef) {
    const account = await findAccount(accountRef)
    if (!account) return err(404, 'Account not found.')
    if (!scopeAllows(scope, account.id)) return err(403, 'This API key is not allowed to access that account.')
    accountId = account.id
  }
  const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), 100)
  try {
    return NextResponse.json({ posts: await listSocialPosts({ status, accountId, accountIds: scope.accountIds ?? undefined, limit }) }, { headers: noStoreHeaders })
  } catch (e) {
    return err(e instanceof PostError ? e.status : 500, 'Could not load posts.')
  }
}

// POST { account, caption, mode?: draft|schedule|publish_now, scheduled_at?,
//        type?: 'image' (default) | 'reel',
//        images: [url | {data, contentType}]                          (type 'image')
//        video | video_url: url | {data, contentType}, cover?, thumb_offset?, share_to_feed?  (type 'reel') }
export async function POST(request: Request) {
  const scope = await requireAgentApi(request)
  if (scope instanceof NextResponse) return scope
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return err(400, 'Body must be JSON.')
  if (typeof body.account !== 'string') return err(422, 'account is required (username or id).')
  const account = await findAccount(body.account)
  if (!account) return err(404, 'Account not found.')
  if (!scopeAllows(scope, account.id)) return err(403, 'This API key is not allowed to post to that account.')
  if (!account.is_active) return err(422, 'Account is disabled.')
  const type = body.type ?? body.media_type ?? 'image'
  if (type !== 'image' && type !== 'reel') return err(422, "type must be 'image' or 'reel'.")
  const reel = type === 'reel'
  const images = Array.isArray(body.images) ? (body.images as ImageInput[]) : []
  const video = (body.video ?? body.video_url) as VideoInput | undefined
  const cover = (body.cover ?? body.cover_url ?? null) as ImageInput | null
  if (reel) {
    if (!video) return err(422, 'video (https URL or {data, contentType}) is required for reels.')
    if (images.length) return err(422, 'Reels take one video, not images (use cover for a cover image).')
  } else if (images.length < 1 || images.length > MAX_MEDIA) return err(422, `images must have 1–${MAX_MEDIA} items.`)
  const modeRaw = body.mode ?? 'draft'
  const mode = modeRaw === 'publish_now' ? 'now' : modeRaw
  const candidate = {
    accountId: account.id,
    caption: body.caption ?? '',
    mode,
    scheduledAt: body.scheduled_at ?? body.scheduledAt ?? null,
    mediaType: type,
    thumbOffset: body.thumb_offset ?? null,
    shareToFeed: body.share_to_feed ?? true,
  }
  const prefix = socialMediaPrefix()
  // Validate everything except the media first, so bad requests do not upload anything.
  const placeholders = reel ? [`${prefix}pending-0.mp4`] : images.map((_, i) => `${prefix}pending-${i}.jpg`)
  const precheck = parseCreatePost({ ...candidate, mediaUrls: placeholders, coverUrl: cover ? `${prefix}pending-cover.jpg` : null }, prefix)
  if (!precheck.ok) return err(422, precheck.error.replace('Invalid mode.', "mode must be 'draft', 'schedule' or 'publish_now'.").replace('thumbOffset', 'thumb_offset').replace('shareToFeed', 'share_to_feed'))

  const mediaUrls: string[] = []
  let coverUrl: string | null = null
  let warnings: string[] = []
  if (reel) {
    try {
      const stored = await ingestVideo(video!)
      mediaUrls.push(stored.mediaUrl)
      warnings = stored.info.warnings
    } catch (e) {
      return err(422, `video: ${e instanceof Error ? e.message : 'invalid video'}`)
    }
    if (cover) {
      try {
        coverUrl = (await ingestImage(cover)).mediaUrl
      } catch (e) {
        return err(422, `cover: ${e instanceof Error ? e.message : 'invalid image'}`)
      }
    }
  } else {
    for (const [i, image] of images.entries()) {
      try {
        mediaUrls.push((await ingestImage(image)).mediaUrl)
      } catch (e) {
        return err(422, `images[${i}]: ${e instanceof Error ? e.message : 'invalid image'}`)
      }
    }
  }
  const parsed = parseCreatePost({ ...candidate, mediaUrls, coverUrl }, prefix)
  if (!parsed.ok) return err(422, parsed.error)
  try {
    const { post, result } = await createSocialPost(parsed.value, null, { reelWaitMs: 60_000 })
    const payload = {
      id: post.id,
      account: account.username ?? account.label,
      type: post.media_type,
      status: result?.status ?? post.status,
      scheduled_at: post.scheduled_at,
      media_urls: post.media_urls,
      ...(reel ? { cover_url: post.cover_url, thumb_offset: post.thumb_offset, share_to_feed: post.share_to_feed } : {}),
      ...(warnings.length ? { warnings } : {}),
      ...(result?.status === 'published' ? { permalink: result.permalink, media_id: result.mediaId } : {}),
      ...(result?.status === 'publishing' ? { container_id: result.containerId, message: result.message } : {}),
      ...(result?.status === 'failed' ? { error: result.error } : {}),
    }
    const status = result?.status === 'failed' ? 502 : result?.status === 'publishing' ? 202 : 201
    return NextResponse.json(payload, { status, headers: noStoreHeaders })
  } catch (e) {
    return err(e instanceof PostError ? e.status : 500, e instanceof Error ? e.message : 'Could not create post.')
  }
}

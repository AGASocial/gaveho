import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { findAccount } from '@/lib/social/accounts'
import { requireAgentApi, scopeAllows } from '@/lib/social/agent-auth'
import { checkAgentMediaPath, conflictingMediaSources, isOwnAgentUploadUrl, mediaPathOf, mediaUrlOf, type MediaPathCheck } from '@/lib/social/agent-uploads'
import { type ImageInput, ingestImage, ingestUploadedImage, ingestUploadedVideo, ingestVideo, removeAgentOriginals, type VideoInput } from '@/lib/social/media'
import { createSocialPosts, listSocialPosts, PostError } from '@/lib/social/posts'
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
//        images: [url | {data, contentType} | {media_path}] | image_url | media_path   (type 'image')
//        video | video_url: url | {data, contentType} | {media_path}, or media_path,
//        cover? | cover_url? | cover_media_path?, thumb_offset?, share_to_feed?  (type 'reel'),
//        also_accounts?: [username | id]   — same video also posted to these accounts (e.g. TikTok),
//        tiktok?: { privacy_level, disable_comment, disable_duet, disable_stitch, is_aigc, brand_content_toggle, brand_organic_toggle } }
// TikTok accounts only take videos; `type` defaults to 'reel' when `account` is a TikTok account.
// media_path comes from POST /api/agent/social/uploads and must be under agent/<this account id>/.
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
  const alsoRaw = body.also_accounts ?? body.also_post_to ?? []
  if (!Array.isArray(alsoRaw) || alsoRaw.length > 5 || alsoRaw.some((r) => typeof r !== 'string')) return err(422, 'also_accounts must be a list of up to 5 account usernames or ids.')
  const alsoAccounts: NonNullable<Awaited<ReturnType<typeof findAccount>>>[] = []
  for (const ref of alsoRaw as string[]) {
    const extra = await findAccount(ref)
    if (!extra) return err(404, `also_accounts: account ${ref} not found.`)
    if (!scopeAllows(scope, extra.id)) return err(403, `also_accounts: this API key is not allowed to post to ${ref}.`)
    if (!extra.is_active) return err(422, `also_accounts: ${ref} is disabled.`)
    if (extra.id !== account.id && !alsoAccounts.some((a) => a.id === extra.id)) alsoAccounts.push(extra)
  }
  const type = body.type ?? body.media_type ?? (account.platform === 'tiktok' ? 'reel' : 'image')
  if (type !== 'image' && type !== 'reel') return err(422, "type must be 'image' or 'reel'.")
  const reel = type === 'reel'
  if (!reel && [account, ...alsoAccounts].some((a) => a.platform === 'tiktok')) return err(422, "TikTok accounts only take videos (type 'reel').")
  const conflict = conflictingMediaSources(body, reel)
  if (conflict) return err(422, `Give only one media source; got ${conflict.join(' and ')}.`)
  const topPath = body.media_path ?? body.mediaPath
  let images: ImageInput[] = Array.isArray(body.images) ? (body.images as ImageInput[]) : []
  if (!reel && !images.length && typeof body.image_url === 'string') images = [body.image_url]
  if (!reel && !images.length && topPath !== undefined) images = [{ media_path: topPath } as ImageInput]
  const video = (body.video ?? body.video_url ?? (reel && topPath !== undefined ? { media_path: topPath } : undefined)) as VideoInput | undefined
  const coverPath = body.cover_media_path
  const cover = (body.cover ?? body.cover_url ?? (coverPath !== undefined ? { media_path: coverPath } : null)) as ImageInput | null
  if (reel) {
    if (!video) return err(422, 'video (https URL, {data, contentType} or media_path) is required for reels.')
    if (images.length) return err(422, 'Reels take one video, not images (use cover for a cover image).')
  } else if (images.length < 1 || images.length > MAX_MEDIA) return err(422, `images must have 1–${MAX_MEDIA} items.`)
  // Our own agent/ uploads must come in as media_path (ownership check), never as a URL.
  const urlInputs: [string, unknown][] = reel ? [['video', video], ['cover', cover]] : [...images.map((im, i) => [`images[${i}]`, im] as [string, unknown]), ['cover', cover]]
  for (const [label, input] of urlInputs) {
    if (isOwnAgentUploadUrl(mediaUrlOf(input))) return err(422, `${label}: URLs to direct uploads are not accepted; pass the upload's media_path instead.`)
  }
  // media_path inputs: check format and account prefix before touching storage.
  const pathCheck = (input: unknown, kind: 'image' | 'video'): MediaPathCheck | null => {
    const p = typeof input === 'object' ? mediaPathOf(input) : undefined
    return p === undefined ? null : checkAgentMediaPath(p, account.id, kind)
  }
  const videoCheck = reel ? pathCheck(video, 'video') : null
  const coverCheck = cover ? pathCheck(cover, 'image') : null
  const imageChecks = images.map((image) => pathCheck(image, 'image'))
  for (const [label, c] of [['video', videoCheck], ['cover', coverCheck], ...imageChecks.map((c, i) => [`images[${i}]`, c] as const)] as const) {
    if (c && !c.ok) return err(c.status, `${label}: ${c.error}`)
  }
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
    tiktok: body.tiktok ?? null,
    alsoAccountIds: alsoAccounts.map((a) => a.id),
  }
  const prefix = socialMediaPrefix()
  // Validate everything except the media first, so bad requests do not upload anything.
  const placeholders = reel ? [`${prefix}pending-0.mp4`] : images.map((_, i) => `${prefix}pending-${i}.jpg`)
  const precheck = parseCreatePost({ ...candidate, mediaUrls: placeholders, coverUrl: cover ? `${prefix}pending-cover.jpg` : null }, prefix)
  if (!precheck.ok) return err(422, precheck.error.replace('Invalid mode.', "mode must be 'draft', 'schedule' or 'publish_now'.").replace('thumbOffset', 'thumb_offset').replace('shareToFeed', 'share_to_feed'))

  const mediaUrls: string[] = []
  let coverUrl: string | null = null
  let warnings: string[] = []
  // Re-encoded agent/ image originals: deleted only after the post is created.
  const originals: string[] = []
  if (reel) {
    try {
      const stored = videoCheck?.ok ? await ingestUploadedVideo(videoCheck) : await ingestVideo(video!)
      mediaUrls.push(stored.mediaUrl)
      warnings = stored.info.warnings
    } catch (e) {
      return err(422, `video: ${e instanceof Error ? e.message : 'invalid video'}`)
    }
    if (cover) {
      try {
        if (coverCheck?.ok) {
          const stored = await ingestUploadedImage(coverCheck)
          originals.push(stored.sourcePath)
          coverUrl = stored.mediaUrl
        } else coverUrl = (await ingestImage(cover)).mediaUrl
      } catch (e) {
        return err(422, `cover: ${e instanceof Error ? e.message : 'invalid image'}`)
      }
    }
  } else {
    for (const [i, image] of images.entries()) {
      const check = imageChecks[i]
      try {
        if (check?.ok) {
          const stored = await ingestUploadedImage(check)
          originals.push(stored.sourcePath)
          mediaUrls.push(stored.mediaUrl)
        } else mediaUrls.push((await ingestImage(image)).mediaUrl)
      } catch (e) {
        return err(422, `images[${i}]: ${e instanceof Error ? e.message : 'invalid image'}`)
      }
    }
  }
  const parsed = parseCreatePost({ ...candidate, mediaUrls, coverUrl }, prefix)
  if (!parsed.ok) return err(422, parsed.error)
  try {
    const waitMs = alsoAccounts.length ? 30_000 : 60_000
    const created = await createSocialPosts(parsed.value, null, { reelWaitMs: waitMs })
    await removeAgentOriginals(originals)
    const describe = ({ post, result }: (typeof created)[number]) => ({
      id: post.id,
      account: [account, ...alsoAccounts].find((a) => a.id === post.account_id)?.username ?? post.account_id,
      platform: post.platform,
      type: post.media_type,
      status: result?.status ?? post.status,
      scheduled_at: post.scheduled_at,
      media_urls: post.media_urls,
      ...(reel ? { cover_url: post.cover_url, thumb_offset: post.thumb_offset, share_to_feed: post.share_to_feed } : {}),
      ...(result?.status === 'published' ? { permalink: result.permalink, media_id: result.mediaId } : {}),
      ...(result?.status === 'publishing' ? { container_id: result.containerId, message: result.message } : {}),
      ...(result?.status === 'failed' ? { error: result.error } : {}),
    })
    const payload = { ...describe(created[0]), ...(warnings.length ? { warnings } : {}), ...(created.length > 1 ? { also: created.slice(1).map(describe) } : {}) }
    const { result } = created[0]
    const status = result?.status === 'failed' ? 502 : result?.status === 'publishing' ? 202 : 201
    return NextResponse.json(payload, { status, headers: noStoreHeaders })
  } catch (e) {
    return err(e instanceof PostError ? e.status : 500, e instanceof Error ? e.message : 'Could not create post.')
  }
}

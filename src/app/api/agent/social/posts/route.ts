import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { findAccount } from '@/lib/social/accounts'
import { requireAgentApi } from '@/lib/social/agent-auth'
import { type ImageInput, ingestImage } from '@/lib/social/media'
import { createSocialPost, listSocialPosts, PostError } from '@/lib/social/posts'
import { socialMediaPrefix } from '@/lib/social/store'
import { MAX_MEDIA, parseCreatePost } from '@/lib/social/validation'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed']
const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStoreHeaders })

// GET ?status=&account=&limit= — recent posts.
export async function GET(request: Request) {
  const denied = requireAgentApi(request)
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const status = params.get('status') ?? undefined
  if (status && !STATUSES.includes(status)) return err(422, `status must be one of ${STATUSES.join(', ')}.`)
  let accountId: string | undefined
  const accountRef = params.get('account')
  if (accountRef) {
    const account = await findAccount(accountRef)
    if (!account) return err(404, 'Account not found.')
    accountId = account.id
  }
  const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), 100)
  try {
    return NextResponse.json({ posts: await listSocialPosts({ status, accountId, limit }) }, { headers: noStoreHeaders })
  } catch (e) {
    return err(e instanceof PostError ? e.status : 500, 'Could not load posts.')
  }
}

// POST { account, caption, images: [url | {data, contentType}], mode?: draft|schedule|publish_now, scheduled_at? }
export async function POST(request: Request) {
  const denied = requireAgentApi(request)
  if (denied) return denied
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return err(400, 'Body must be JSON.')
  if (typeof body.account !== 'string') return err(422, 'account is required (username or id).')
  const account = await findAccount(body.account)
  if (!account) return err(404, 'Account not found.')
  if (!account.is_active) return err(422, 'Account is disabled.')
  const images = Array.isArray(body.images) ? (body.images as ImageInput[]) : []
  if (images.length < 1 || images.length > MAX_MEDIA) return err(422, `images must have 1–${MAX_MEDIA} items.`)
  const modeRaw = body.mode ?? 'draft'
  const mode = modeRaw === 'publish_now' ? 'now' : modeRaw
  const candidate = {
    accountId: account.id,
    caption: body.caption ?? '',
    mode,
    scheduledAt: body.scheduled_at ?? body.scheduledAt ?? null,
  }
  const prefix = socialMediaPrefix()
  // Validate everything except the images first, so bad requests do not upload anything.
  const precheck = parseCreatePost({ ...candidate, mediaUrls: images.map((_, i) => `${prefix}pending-${i}.jpg`) }, prefix)
  if (!precheck.ok) return err(422, precheck.error.replace('Invalid mode.', "mode must be 'draft', 'schedule' or 'publish_now'."))

  const mediaUrls: string[] = []
  for (const [i, image] of images.entries()) {
    try {
      mediaUrls.push((await ingestImage(image)).mediaUrl)
    } catch (e) {
      return err(422, `images[${i}]: ${e instanceof Error ? e.message : 'invalid image'}`)
    }
  }
  const parsed = parseCreatePost({ ...candidate, mediaUrls }, prefix)
  if (!parsed.ok) return err(422, parsed.error)
  try {
    const { post, result } = await createSocialPost(parsed.value, null)
    const payload = {
      id: post.id,
      account: account.username ?? account.label,
      status: result?.status ?? post.status,
      scheduled_at: post.scheduled_at,
      media_urls: post.media_urls,
      ...(result?.status === 'published' ? { permalink: result.permalink, media_id: result.mediaId } : {}),
      ...(result?.status === 'failed' ? { error: result.error } : {}),
    }
    return NextResponse.json(payload, { status: result?.status === 'failed' ? 502 : 201, headers: noStoreHeaders })
  } catch (e) {
    return err(e instanceof PostError ? e.status : 500, e instanceof Error ? e.message : 'Could not create post.')
  }
}

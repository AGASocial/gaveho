export const MAX_CAPTION = 2200
export const MAX_MEDIA = 10
export type PostMode = 'draft' | 'schedule' | 'now'
export type MediaType = 'image' | 'reel'
export const MAX_THUMB_OFFSET_MS = 15 * 60 * 1000

export type CreatePostInput = {
  accountId: string
  caption: string
  mediaUrls: string[]
  mode: PostMode
  scheduledAt: string | null
  mediaType: MediaType
  /** Reels only: optional cover image (stored JPEG), thumbnail offset in ms, share to main feed. */
  coverUrl: string | null
  thumbOffset: number | null
  shareToFeed: boolean
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validates a compose request. mediaUrls must live under the given public storage prefix. */
export function parseCreatePost(
  body: unknown,
  mediaPrefix: string,
  now = new Date()
): { ok: true; value: CreatePostInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body.' }
  const b = body as Record<string, unknown>
  const accountId = typeof b.accountId === 'string' ? b.accountId : ''
  if (!uuidRe.test(accountId)) return { ok: false, error: 'Pick an account.' }
  const caption = typeof b.caption === 'string' ? b.caption.trim() : ''
  if (caption.length > MAX_CAPTION) return { ok: false, error: `Caption must be ≤ ${MAX_CAPTION} characters.` }
  const mediaType = b.mediaType ?? 'image'
  if (mediaType !== 'image' && mediaType !== 'reel') return { ok: false, error: "mediaType must be 'image' or 'reel'." }
  const reel = mediaType === 'reel'
  const mediaUrls = Array.isArray(b.mediaUrls) ? b.mediaUrls.filter((u): u is string => typeof u === 'string') : []
  if (reel && mediaUrls.length !== 1) return { ok: false, error: 'A reel needs exactly one video.' }
  if (mediaUrls.length < 1 || mediaUrls.length > MAX_MEDIA) return { ok: false, error: `Add 1–${MAX_MEDIA} images.` }
  if (!mediaPrefix || mediaUrls.some((u) => !u.startsWith(mediaPrefix))) return { ok: false, error: 'Media must be uploaded here first.' }
  if (reel && !/\.(mp4|mov)$/i.test(mediaUrls[0])) return { ok: false, error: 'A reel needs an MP4 or MOV video.' }
  if (!reel && mediaUrls.some((u) => /\.(mp4|mov)$/i.test(u))) return { ok: false, error: "Videos must be posted with mediaType 'reel'." }
  let coverUrl: string | null = null
  let thumbOffset: number | null = null
  let shareToFeed = true
  if (reel) {
    if (b.coverUrl != null && b.coverUrl !== '') {
      if (typeof b.coverUrl !== 'string' || !b.coverUrl.startsWith(mediaPrefix) || !/\.jpg$/i.test(b.coverUrl)) {
        return { ok: false, error: 'Cover image must be uploaded here first.' }
      }
      coverUrl = b.coverUrl
    }
    if (b.thumbOffset != null && b.thumbOffset !== '') {
      const n = Number(b.thumbOffset)
      if (!Number.isInteger(n) || n < 0 || n > MAX_THUMB_OFFSET_MS) return { ok: false, error: 'thumbOffset must be milliseconds between 0 and 900000.' }
      thumbOffset = n
    }
    if (b.shareToFeed != null) {
      if (typeof b.shareToFeed !== 'boolean') return { ok: false, error: 'shareToFeed must be true or false.' }
      shareToFeed = b.shareToFeed
    }
  }
  const mode = b.mode
  if (mode !== 'draft' && mode !== 'schedule' && mode !== 'now') return { ok: false, error: 'Invalid mode.' }
  let scheduledAt: string | null = null
  if (mode === 'schedule') {
    const d = typeof b.scheduledAt === 'string' ? new Date(b.scheduledAt) : null
    if (!d || Number.isNaN(d.getTime())) return { ok: false, error: 'Pick a schedule date/time.' }
    if (d.getTime() < now.getTime() + 60_000) return { ok: false, error: 'Schedule time must be in the future.' }
    scheduledAt = d.toISOString()
  }
  if (mode !== 'draft' && !caption) return { ok: false, error: 'Caption is required to publish.' }
  return { ok: true, value: { accountId, caption, mediaUrls, mode, scheduledAt, mediaType, coverUrl, thumbOffset, shareToFeed } }
}

export const MAX_CAPTION = 2200
export const MAX_MEDIA = 10
export type PostMode = 'draft' | 'schedule' | 'now'

export type CreatePostInput = {
  accountId: string
  caption: string
  mediaUrls: string[]
  mode: PostMode
  scheduledAt: string | null
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
  const mediaUrls = Array.isArray(b.mediaUrls) ? b.mediaUrls.filter((u): u is string => typeof u === 'string') : []
  if (mediaUrls.length < 1 || mediaUrls.length > MAX_MEDIA) return { ok: false, error: `Add 1–${MAX_MEDIA} images.` }
  if (!mediaPrefix || mediaUrls.some((u) => !u.startsWith(mediaPrefix))) return { ok: false, error: 'Images must be uploaded here first.' }
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
  return { ok: true, value: { accountId, caption, mediaUrls, mode, scheduledAt } }
}

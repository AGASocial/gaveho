import { randomUUID } from 'node:crypto'

// Direct-to-Storage uploads for the agent API. Vercel caps function bodies at ~4.5 MB, so agents ask
// POST /api/agent/social/uploads for a signed upload URL, PUT the file straight to Supabase Storage,
// then reference it in POST /posts as `media_path`. Paths are server-chosen: agent/<account_id>/<uuid>.<ext>.

/** Content types the gaveho-social bucket accepts (PNG is not in the bucket's allowed_mime_types). */
export const AGENT_UPLOAD_TYPES = {
  'image/jpeg': 'jpg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
} as const
export type AgentUploadType = keyof typeof AGENT_UPLOAD_TYPES
export type AgentUploadExt = (typeof AGENT_UPLOAD_TYPES)[AgentUploadType]
export const EXT_CONTENT_TYPES: Record<AgentUploadExt, AgentUploadType> = { jpg: 'image/jpeg', mp4: 'video/mp4', mov: 'video/quicktime' }

export const MAX_AGENT_UPLOAD_BYTES = 300 * 1024 * 1024
/** Images are re-encoded server-side, which reads them in memory: keep the source under 25 MB. */
export const MAX_AGENT_IMAGE_BYTES = 25 * 1024 * 1024

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const pathRe = /^agent\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|mp4|mov)$/

export type UploadRequest = { account: string; filename: string; contentType: AgentUploadType; sizeBytes: number; ext: AgentUploadExt }

/** Validates { account, filename, content_type, size_bytes }. */
export function parseUploadRequest(body: unknown): { ok: true; value: UploadRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be JSON.' }
  const b = body as Record<string, unknown>
  if (typeof b.account !== 'string' || !b.account.trim()) return { ok: false, error: 'account is required (username or id).' }
  const filename = typeof b.filename === 'string' ? b.filename.trim() : ''
  if (!filename || filename.length > 255) return { ok: false, error: 'filename is required (≤ 255 chars).' }
  const contentType = typeof b.content_type === 'string' ? b.content_type.toLowerCase().trim() : ''
  if (!(contentType in AGENT_UPLOAD_TYPES)) return { ok: false, error: `content_type must be one of ${Object.keys(AGENT_UPLOAD_TYPES).join(', ')}.` }
  const type = contentType as AgentUploadType
  const sizeBytes = Number(b.size_bytes)
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return { ok: false, error: 'size_bytes must be a positive integer.' }
  const max = type.startsWith('image/') ? MAX_AGENT_IMAGE_BYTES : MAX_AGENT_UPLOAD_BYTES
  if (sizeBytes > max) return { ok: false, error: `${type.startsWith('image/') ? 'Images' : 'Videos'} must be ${max / 1024 / 1024} MB or smaller.` }
  return { ok: true, value: { account: b.account, filename, contentType: type, sizeBytes, ext: AGENT_UPLOAD_TYPES[type] } }
}

export const agentUploadPrefix = (accountId: string) => `agent/${accountId.toLowerCase()}/`

export function newAgentUploadPath(accountId: string, ext: AgentUploadExt) {
  if (!uuidRe.test(accountId)) throw new Error('Invalid account id.')
  return `${agentUploadPrefix(accountId)}${randomUUID()}.${ext}`
}

export type MediaPathCheck =
  | { ok: true; path: string; ext: AgentUploadExt; contentType: AgentUploadType; kind: 'image' | 'video' }
  | { ok: false; status: 403 | 422; error: string }

/**
 * Checks that a media_path is a well-formed agent upload under agent/<accountId>/ and of the expected kind.
 * Another account's prefix is 403 (a key must not use other accounts' uploads); anything malformed is 422.
 */
export function checkAgentMediaPath(value: unknown, accountId: string, expected: 'image' | 'video'): MediaPathCheck {
  const path = typeof value === 'string' ? value.trim() : ''
  const m = pathRe.exec(path)
  if (!m) return { ok: false, status: 422, error: 'media_path must be a path returned by POST /api/agent/social/uploads.' }
  if (m[1].toLowerCase() !== accountId.toLowerCase()) return { ok: false, status: 403, error: 'media_path belongs to another account.' }
  const ext = m[2] as AgentUploadExt
  const contentType = EXT_CONTENT_TYPES[ext]
  const kind = contentType.startsWith('image/') ? 'image' : 'video'
  if (kind !== expected) return { ok: false, status: 422, error: `media_path must be ${expected === 'image' ? 'a JPEG image' : 'an MP4 or MOV video'}.` }
  return { ok: true, path, ext, contentType, kind }
}

/** Extracts a media_path from `{ media_path }` / `{ mediaPath }` objects; undefined otherwise. */
export function mediaPathOf(input: unknown): unknown {
  if (!input || typeof input !== 'object') return undefined
  const o = input as Record<string, unknown>
  return o.media_path ?? o.mediaPath
}

// ── Hardening ────────────────────────────────────────────────────────────────

/** Max signed upload URLs per API key per rolling hour. */
export const AGENT_UPLOADS_PER_HOUR = 30
export const AGENT_UPLOAD_WINDOW_MS = 3600 * 1000

/**
 * Rate-limit decision from the number of uploads the key requested in the last hour. When blocked,
 * Retry-After is the time until the oldest upload in the window ages out (at least 1 s).
 */
export function uploadRateLimit(
  recentCount: number,
  limit = AGENT_UPLOADS_PER_HOUR,
  oldestInWindow: string | null = null,
  now = Date.now()
): { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number } {
  if (recentCount < limit) return { ok: true, remaining: limit - recentCount - 1 }
  return { ok: false, retryAfterSeconds: retryAfterSeconds(oldestInWindow, now) }
}

/** Seconds until an upload made at `oldest` leaves the rolling window; the full window when unknown. */
export function retryAfterSeconds(oldest: string | null, now = Date.now(), windowMs = AGENT_UPLOAD_WINDOW_MS): number {
  const t = oldest ? Date.parse(oldest) : NaN
  if (!Number.isFinite(t)) return Math.ceil(windowMs / 1000)
  return Math.min(Math.ceil(windowMs / 1000), Math.max(1, Math.ceil((t + windowMs - now) / 1000)))
}

/** Uploads older than this are refused at post time: the cleanup cron deletes unreferenced ones after 24 h. */
export const AGENT_UPLOAD_MAX_USE_AGE_MS = 20 * 3600 * 1000
export const AGENT_UPLOAD_ORPHAN_AGE_MS = 24 * 3600 * 1000

/** True when an upload stored at `storedAt` (HTTP date or ISO) is too old to attach to a new post. */
export function uploadTooOld(storedAt: string | null | undefined, now = Date.now(), maxAgeMs = AGENT_UPLOAD_MAX_USE_AGE_MS): boolean {
  const t = storedAt ? Date.parse(storedAt) : NaN
  return Number.isFinite(t) && now - t > maxAgeMs
}

/**
 * True when `value` is a URL pointing at the agent/ prefix of our own bucket (public, signed or
 * authenticated object routes, or image render routes). Those must be passed as media_path so the
 * account-prefix ownership check applies.
 */
export function isOwnAgentUploadUrl(value: unknown, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, bucket = 'gaveho-social'): boolean {
  if (typeof value !== 'string' || !supabaseUrl) return false
  let url: URL, base: URL
  try {
    url = new URL(value.trim())
    base = new URL(supabaseUrl)
  } catch {
    return false
  }
  if (url.hostname.toLowerCase() !== base.hostname.toLowerCase()) return false
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return true // malformed escapes on our own host: refuse
  }
  path = path.replace(/\/{2,}/g, '/')
  const m = /^\/storage\/v1\/(?:object|render\/image)\/(?:(?:public|sign|authenticated)\/)?([^/]+)\/(.*)$/i.exec(path)
  if (!m || m[1] !== bucket) return false
  const rest = m[2].split('/').filter((s) => s && s !== '.')
  return rest[0]?.toLowerCase() === 'agent' || rest.includes('..')
}

/** Extracts the URL of a URL-style media input (string or `{ url }`); undefined otherwise. */
export function mediaUrlOf(input: unknown): unknown {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object') return (input as Record<string, unknown>).url
  return undefined
}

const present = (v: unknown) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)

/**
 * Names of the conflicting media sources in a POST /posts body, or null when at most one source is given
 * for the main media and for the cover. Main media: images | image_url | media_path (images) or
 * video | video_url | media_path (reels). Cover: cover | cover_url | cover_media_path.
 */
export function conflictingMediaSources(body: Record<string, unknown>, reel: boolean): string[] | null {
  const mainKeys = reel ? ['video', 'video_url', 'media_path', 'mediaPath'] : ['images', 'image_url', 'media_path', 'mediaPath']
  const main = mainKeys.filter((k) => present(body[k]))
  if (main.length > 1) return main
  const cover = ['cover', 'cover_url', 'cover_media_path'].filter((k) => present(body[k]))
  if (cover.length > 1) return cover
  return null
}

/** Storage object as listed by the cleanup job. */
export type StoredAgentObject = { path: string; createdAt: string | null }

/**
 * Agent uploads safe to delete: older than `maxAgeMs` and not referenced by any post's media_urls / cover_url.
 * `referenced` holds full public URLs or bare storage paths.
 */
export function orphanAgentObjects(objects: StoredAgentObject[], referenced: Iterable<string>, now = Date.now(), maxAgeMs = AGENT_UPLOAD_ORPHAN_AGE_MS, bucket = 'gaveho-social'): string[] {
  const refs = new Set<string>()
  for (const r of referenced) {
    const p = referencedStoragePath(r, bucket)
    if (p) refs.add(p)
  }
  return objects
    .filter((o) => o.path.startsWith('agent/'))
    .filter((o) => {
      const t = o.createdAt ? Date.parse(o.createdAt) : NaN
      return Number.isFinite(t) && now - t > maxAgeMs
    })
    .filter((o) => !refs.has(o.path))
    .map((o) => o.path)
}

/**
 * Storage path (inside `bucket`) of a post reference: a bare path is returned as-is; for a URL the
 * pathname is percent-decoded and everything after the first `/<bucket>/` segment is returned.
 * Null when it cannot be resolved.
 */
export function referencedStoragePath(ref: string | null | undefined, bucket = 'gaveho-social'): string | null {
  if (!ref) return null
  const raw = ref.trim()
  if (!raw) return null
  let path: string
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = decodeURIComponent(new URL(raw).pathname)
    } catch {
      return null
    }
  } else {
    path = raw.split(/[?#]/)[0]
    try {
      path = decodeURIComponent(path)
    } catch {
      /* keep as-is */
    }
    if (!path.startsWith('/')) return path.replace(/\/{2,}/g, '/')
  }
  path = path.replace(/\/{2,}/g, '/')
  const marker = `/${bucket}/`
  const i = path.indexOf(marker)
  return i >= 0 ? path.slice(i + marker.length) : null
}

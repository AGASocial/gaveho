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

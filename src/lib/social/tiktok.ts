// TikTok Login Kit (OAuth v2) + Content Posting API (Direct Post). Server-only.
// Docs: https://developers.tiktok.com/doc/login-kit-web, /doc/oauth-user-access-token-management,
// /doc/content-posting-api-reference-direct-post, /doc/content-posting-api-reference-get-video-status.
// Never log tokens: errors carry only TikTok's error code/message and log_id.

export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
export const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const API = 'https://open.tiktokapis.com/v2'
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'] as const

export const TIKTOK_PRIVACY_LEVELS = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'] as const
export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number]
export const isTikTokPrivacyLevel = (v: unknown): v is TikTokPrivacyLevel => typeof v === 'string' && (TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(v)

/** Unaudited TikTok apps can only post SELF_ONLY; override with TIKTOK_DEFAULT_PRIVACY_LEVEL once audited. */
export function defaultTikTokPrivacy(): TikTokPrivacyLevel {
  const v = process.env.TIKTOK_DEFAULT_PRIVACY_LEVEL
  return isTikTokPrivacyLevel(v) ? v : 'SELF_ONLY'
}

/** Per-post TikTok settings, stored in gaveho_social_posts.tiktok_options. */
export type TikTokOptions = {
  privacy_level?: TikTokPrivacyLevel
  disable_comment?: boolean
  disable_duet?: boolean
  disable_stitch?: boolean
  is_aigc?: boolean
  brand_content_toggle?: boolean
  brand_organic_toggle?: boolean
}

const BOOL_KEYS = ['disable_comment', 'disable_duet', 'disable_stitch', 'is_aigc', 'brand_content_toggle', 'brand_organic_toggle'] as const
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

/** Accepts snake_case or camelCase keys. Returns null when absent. */
export function parseTikTokOptions(raw: unknown): { ok: true; value: TikTokOptions | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'tiktok must be an object.' }
  const r = raw as Record<string, unknown>
  const out: TikTokOptions = {}
  const privacy = r.privacy_level ?? r.privacyLevel
  if (privacy != null && privacy !== '') {
    if (!isTikTokPrivacyLevel(privacy)) return { ok: false, error: `tiktok.privacy_level must be one of ${TIKTOK_PRIVACY_LEVELS.join(', ')}.` }
    out.privacy_level = privacy
  }
  for (const key of BOOL_KEYS) {
    const v = r[key] ?? r[camel(key)]
    if (v == null) continue
    if (typeof v !== 'boolean') return { ok: false, error: `tiktok.${key} must be true or false.` }
    out[key] = v
  }
  return { ok: true, value: out }
}

export class TikTokApiError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0) {
    super(`TikTok API error ${code}: ${message}`)
    this.name = 'TikTokApiError'
  }
}

type Envelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string; logid?: string } }

async function api<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Envelope<T>
  const code = json.error?.code ?? (res.ok ? 'ok' : `http_${res.status}`)
  if (!res.ok || code !== 'ok') {
    const logId = json.error?.log_id ?? json.error?.logid
    throw new TikTokApiError(code, `${json.error?.message || 'Request failed'}${logId ? ` (log_id ${logId})` : ''}`, res.status)
  }
  return json.data as T
}

// ---------- OAuth ----------

export function tiktokConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://gaveho.com'
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${site}/api/admin/social/tiktok/callback`
  return { clientKey, clientSecret, redirectUri, configured: Boolean(clientKey && clientSecret) }
}

export function buildAuthorizeUrl(input: { clientKey: string; redirectUri: string; state: string }) {
  const url = new URL(TIKTOK_AUTHORIZE_URL)
  url.searchParams.set('client_key', input.clientKey)
  url.searchParams.set('scope', TIKTOK_SCOPES.join(','))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  // Always show the consent screen so the admin can pick which TikTok account to connect.
  url.searchParams.set('disable_auto_auth', '1')
  return url.toString()
}

export type TikTokTokens = {
  accessToken: string
  refreshToken: string
  openId: string
  scope: string
  expiresAt: string
  refreshExpiresAt: string | null
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  open_id?: string
  scope?: string
  expires_in?: number
  refresh_expires_in?: number
  error?: string
  error_description?: string
  log_id?: string
}

async function tokenRequest(params: Record<string, string>): Promise<TikTokTokens> {
  const { clientKey, clientSecret } = tiktokConfig()
  if (!clientKey || !clientSecret) throw new Error('TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET are not configured.')
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, ...params }),
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || data.error || !data.access_token || !data.refresh_token || !data.open_id) {
    throw new TikTokApiError(data.error ?? `http_${res.status}`, data.error_description || 'Token request failed', res.status)
  }
  const now = Date.now()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    openId: data.open_id,
    scope: data.scope ?? '',
    expiresAt: new Date(now + (data.expires_in ?? 7200) * 1000).toISOString(),
    refreshExpiresAt: data.refresh_expires_in ? new Date(now + data.refresh_expires_in * 1000).toISOString() : null,
  }
}

export const exchangeTikTokCode = (code: string, redirectUri: string) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })

/** TikTok rotates refresh tokens: always store the returned refresh token. */
export const refreshTikTokToken = (refreshToken: string) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })

export async function fetchTikTokUser(token: string) {
  const data = await api<{ user?: { open_id?: string; display_name?: string; avatar_url?: string } }>(
    token,
    '/user/info/?fields=open_id,display_name,avatar_url',
    { method: 'GET' }
  )
  return { openId: data.user?.open_id ?? null, displayName: data.user?.display_name ?? null }
}

// ---------- Content Posting (Direct Post) ----------

export type CreatorInfo = {
  creator_username?: string
  creator_nickname?: string
  privacy_level_options: TikTokPrivacyLevel[]
  comment_disabled?: boolean
  duet_disabled?: boolean
  stitch_disabled?: boolean
  max_video_post_duration_sec?: number
}

export async function queryCreatorInfo(token: string): Promise<CreatorInfo> {
  const data = await api<CreatorInfo>(token, '/post/publish/creator_info/query/')
  return { ...data, privacy_level_options: (data?.privacy_level_options ?? []).filter(isTikTokPrivacyLevel) }
}

/** Builds post_info honoring creator_info (privacy must be one of the creator's options; creator-disabled interactions stay disabled). */
export function buildPostInfo(input: { caption: string; options: TikTokOptions | null; creator: CreatorInfo; coverTimestampMs?: number | null }) {
  const o = input.options ?? {}
  const privacy = o.privacy_level ?? defaultTikTokPrivacy()
  if (!input.creator.privacy_level_options.includes(privacy)) {
    throw new TikTokApiError(
      'privacy_level_option_mismatch',
      `privacy_level ${privacy} is not available for this creator (allowed: ${input.creator.privacy_level_options.join(', ') || 'none'}). Unaudited apps can only post SELF_ONLY.`
    )
  }
  if (o.brand_content_toggle && privacy === 'SELF_ONLY') {
    throw new TikTokApiError('invalid_param', 'Branded content (brand_content_toggle) cannot be posted with privacy_level SELF_ONLY.')
  }
  return {
    title: input.caption,
    privacy_level: privacy,
    disable_comment: Boolean(o.disable_comment || input.creator.comment_disabled),
    disable_duet: Boolean(o.disable_duet || input.creator.duet_disabled),
    disable_stitch: Boolean(o.disable_stitch || input.creator.stitch_disabled),
    brand_content_toggle: Boolean(o.brand_content_toggle),
    brand_organic_toggle: Boolean(o.brand_organic_toggle),
    is_aigc: Boolean(o.is_aigc),
    ...(input.coverTimestampMs != null ? { video_cover_timestamp_ms: input.coverTimestampMs } : {}),
  }
}

const MIN_CHUNK = 5 * 1024 * 1024
const CHUNK = 10 * 1024 * 1024

/** FILE_UPLOAD chunk plan: chunks of 10 MB, the last chunk absorbs the remainder; files < 5 MB go in one chunk. */
export function chunkPlan(size: number, chunkSize = CHUNK) {
  if (size <= 0) throw new Error('Video is empty.')
  if (size < MIN_CHUNK || size <= chunkSize) return { chunkSize: size, totalChunkCount: 1 }
  return { chunkSize, totalChunkCount: Math.floor(size / chunkSize) }
}

export function chunkRanges(size: number, plan: { chunkSize: number; totalChunkCount: number }) {
  const ranges: { start: number; end: number }[] = []
  for (let i = 0; i < plan.totalChunkCount; i++) {
    const start = i * plan.chunkSize
    const end = i === plan.totalChunkCount - 1 ? size - 1 : start + plan.chunkSize - 1
    ranges.push({ start, end })
  }
  return ranges
}

type InitResult = { publish_id: string; upload_url?: string }

export type TikTokTransfer = 'PULL_FROM_URL' | 'FILE_UPLOAD'

/** TIKTOK_UPLOAD_MODE: 'pull' (PULL_FROM_URL only), 'file' (FILE_UPLOAD only) or 'auto' (default: pull, fall back to file upload when the URL prefix is not verified). */
export function tiktokUploadMode(): 'pull' | 'file' | 'auto' {
  const v = process.env.TIKTOK_UPLOAD_MODE
  return v === 'pull' || v === 'file' ? v : 'auto'
}

async function initFileUpload(token: string, postInfo: object, videoUrl: string) {
  const head = await fetch(videoUrl, { method: 'HEAD', cache: 'no-store' })
  const size = Number(head.headers.get('content-length'))
  if (!head.ok || !Number.isFinite(size) || size <= 0) throw new Error('Could not read the stored video size for TikTok upload.')
  const contentType = head.headers.get('content-type')?.startsWith('video/quicktime') ? 'video/quicktime' : 'video/mp4'
  const plan = chunkPlan(size)
  const init = await api<InitResult>(token, '/post/publish/video/init/', {
    body: { post_info: postInfo, source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount } },
  })
  if (!init.upload_url) throw new Error('TikTok did not return an upload_url.')
  for (const { start, end } of chunkRanges(size, plan)) {
    const part = await fetch(videoUrl, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store' })
    if (part.status !== 206 && !(part.status === 200 && start === 0 && end === size - 1)) throw new Error('Could not read the stored video for TikTok upload.')
    const bytes = new Uint8Array(await part.arrayBuffer())
    if (bytes.byteLength !== end - start + 1) throw new Error('Stored video changed while uploading to TikTok.')
    const put = await fetch(init.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.byteLength), 'Content-Range': `bytes ${start}-${end}/${size}` },
      body: bytes,
      cache: 'no-store',
    })
    if (put.status !== 206 && put.status !== 201 && put.status !== 200) throw new Error(`TikTok video upload failed (HTTP ${put.status}).`)
  }
  return init.publish_id
}

/** Starts a Direct Post. Returns TikTok's publish_id (track with fetchPublishStatus). */
export async function initVideoPost(input: { token: string; videoUrl: string; postInfo: object }): Promise<{ publishId: string; transfer: TikTokTransfer }> {
  const mode = tiktokUploadMode()
  if (mode !== 'file') {
    try {
      const init = await api<InitResult>(input.token, '/post/publish/video/init/', {
        body: { post_info: input.postInfo, source_info: { source: 'PULL_FROM_URL', video_url: input.videoUrl } },
      })
      return { publishId: init.publish_id, transfer: 'PULL_FROM_URL' }
    } catch (e) {
      if (mode === 'pull' || !(e instanceof TikTokApiError) || e.code !== 'url_ownership_unverified') throw e
    }
  }
  return { publishId: await initFileUpload(input.token, input.postInfo, input.videoUrl), transfer: 'FILE_UPLOAD' }
}

export type PublishStatus = { status: string; failReason: string | null; postIds: string[] }

export async function fetchPublishStatus(token: string, publishId: string): Promise<PublishStatus> {
  const data = await api<{ status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>(token, '/post/publish/status/fetch/', {
    body: { publish_id: publishId },
  })
  return { status: data?.status ?? 'UNKNOWN', failReason: data?.fail_reason ?? null, postIds: (data?.publicaly_available_post_id ?? []).map(String) }
}

/** Polls until PUBLISH_COMPLETE / FAILED or the budget runs out ('in_progress'). Status fetch is limited to 30 req/min per token. */
export async function waitForTikTokPublish(token: string, publishId: string, budgetMs: number, intervalMs = 5000) {
  const deadline = Date.now() + budgetMs
  for (;;) {
    const s = await fetchPublishStatus(token, publishId)
    if (s.status === 'PUBLISH_COMPLETE') return { state: 'complete' as const, postIds: s.postIds }
    if (s.status === 'FAILED') throw new TikTokApiError(s.failReason ?? 'failed', 'TikTok could not publish the video.')
    if (Date.now() + intervalMs > deadline) return { state: 'in_progress' as const, postIds: [] }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

export const tiktokPermalink = (username: string | null, postId: string) =>
  `https://www.tiktok.com/@${username ? encodeURIComponent(username) : '_'}/video/${encodeURIComponent(postId)}`

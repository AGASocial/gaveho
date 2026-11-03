// Instagram Graph API. Server-only.
// Every call takes the per-account access token and API host: GAVEHO supports multiple
// accounts, each added by pasting a token that belongs either to the Instagram API with
// Instagram Login (graph.instagram.com, tokens usually start with "IG") or with
// Facebook Login (graph.facebook.com, tokens usually start with "EA").

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || process.env.INSTAGRAM_GRAPH_API_VERSION || 'v23.0'
export type ApiHost = 'instagram' | 'facebook'
const graphBase = (host: ApiHost) => `https://graph.${host}.com/${GRAPH_VERSION}`
type MetaError = { error?: { message?: string; code?: number }; error_message?: string }

export class MetaApiError extends Error {
  constructor(readonly code: number, message: string) {
    super(`Meta API error ${code}: ${message}`)
    this.name = 'MetaApiError'
  }
}

async function parse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & MetaError
  if (!response.ok) {
    throw new MetaApiError(data.error?.code ?? response.status, data.error?.message ?? data.error_message ?? 'Request failed')
  }
  return data
}

/** Long-lived tokens (≥24h old, not expired) can be refreshed for another 60 days. */
export async function refreshLongLivedToken(accessToken: string) {
  const url = new URL('https://graph.instagram.com/refresh_access_token')
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', accessToken)
  const data = await parse<{ access_token: string; expires_in: number }>(await fetch(url, { cache: 'no-store' }))
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() }
}

type Api = { token: string; host: ApiHost }

async function metaRequest<T>(api: Api, path: string, body?: URLSearchParams) {
  const { token } = api
  const response = await fetch(`${graphBase(api.host)}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body,
    cache: 'no-store',
  })
  return parse<T>(response)
}

export type ResolvedIgAccount = { host: ApiHost; igUserId: string; username: string | null }

async function resolveViaInstagram(token: string): Promise<ResolvedIgAccount[]> {
  const me = await metaRequest<{ user_id?: string | number; id?: string; username?: string }>(
    { token, host: 'instagram' },
    'me?fields=user_id,username,profile_picture_url,account_type'
  )
  const igUserId = String(me.user_id ?? me.id ?? '')
  if (!igUserId) throw new Error('Token did not return an Instagram user id.')
  return [{ host: 'instagram', igUserId, username: me.username ?? null }]
}

async function resolveViaFacebook(token: string): Promise<ResolvedIgAccount[]> {
  const api: Api = { token, host: 'facebook' }
  const pages = await metaRequest<{ data?: { instagram_business_account?: { id: string; username?: string } }[] }>(
    api,
    'me/accounts?fields=instagram_business_account{id,username,profile_picture_url}&limit=100'
  )
  const found = (pages.data ?? []).flatMap((p) => (p.instagram_business_account ? [p.instagram_business_account] : []))
  if (!found.length) {
    // Page access tokens: "me" is the Page itself.
    const page = await metaRequest<{ instagram_business_account?: { id: string; username?: string } }>(
      api,
      'me?fields=instagram_business_account{id,username,profile_picture_url}'
    ).catch(() => null)
    if (page?.instagram_business_account) found.push(page.instagram_business_account)
  }
  if (!found.length) throw new Error('No Instagram business account is linked to this Facebook token.')
  return found.map((a) => ({ host: 'facebook' as const, igUserId: String(a.id), username: a.username ?? null }))
}

/** Validates a pasted token and returns the Instagram account(s) it can publish to. */
export async function resolveTokenAccounts(token: string): Promise<ResolvedIgAccount[]> {
  const order = token.startsWith('EA') ? [resolveViaFacebook, resolveViaInstagram] : [resolveViaInstagram, resolveViaFacebook]
  let firstError: unknown
  for (const attempt of order) {
    try {
      return await attempt(token)
    } catch (err) {
      firstError ??= err
    }
  }
  throw firstError instanceof Error ? firstError : new Error('Token validation failed.')
}

async function waitForContainer(token: Api, containerId: string) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const c = await metaRequest<{ status_code?: string; status?: string }>(token, `${containerId}?fields=status_code,status`)
    if (c.status_code === 'FINISHED' || c.status_code === 'PUBLISHED') return
    if (c.status_code === 'ERROR' || c.status_code === 'EXPIRED') {
      throw new Error(`Meta media container ${c.status_code}: ${c.status ?? 'Processing failed'}`)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('Meta media container timed out while processing.')
}

async function publishContainer(token: Api, igUserId: string, containerId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await metaRequest<{ id: string }>(token, `${igUserId}/media_publish`, new URLSearchParams({ creation_id: containerId }))
    } catch (error) {
      // 9007 = media not ready yet
      if (!(error instanceof MetaApiError) || error.code !== 9007 || attempt === 4) throw error
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  throw new Error('Instagram publishing retry limit reached.')
}

/** Publishes a single image or a carousel (2–10 images). */
export async function publishInstagramMedia(input: { token: string; host: ApiHost; igUserId: string; imageUrls: string[]; caption: string }) {
  const { igUserId, imageUrls, caption } = input
  const token: Api = { token: input.token, host: input.host }
  let containerId: string
  if (imageUrls.length === 1) {
    containerId = (await metaRequest<{ id: string }>(token, `${igUserId}/media`, new URLSearchParams({ image_url: imageUrls[0], caption }))).id
  } else {
    const children: string[] = []
    for (const imageUrl of imageUrls) {
      const child = await metaRequest<{ id: string }>(token, `${igUserId}/media`, new URLSearchParams({ image_url: imageUrl, is_carousel_item: 'true' }))
      await waitForContainer(token, child.id)
      children.push(child.id)
    }
    containerId = (
      await metaRequest<{ id: string }>(token, `${igUserId}/media`, new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption }))
    ).id
  }
  await waitForContainer(token, containerId)
  const published = await publishContainer(token, igUserId, containerId)
  const media = await metaRequest<{ id: string; permalink?: string }>(token, `${published.id}?fields=id,permalink`).catch(() => ({ id: published.id, permalink: undefined }))
  return { mediaId: published.id, permalink: media.permalink ?? null }
}

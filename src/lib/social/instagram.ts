// Instagram API with Instagram Login (graph.instagram.com). Server-only.
// Every call takes the per-account access token: gaveho supports multiple accounts.

const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_API_VERSION || 'v23.0'
const GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`
export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish']

type MetaError = { error?: { message?: string; code?: number }; error_message?: string }

export class MetaApiError extends Error {
  constructor(readonly code: number, message: string) {
    super(`Meta API error ${code}: ${message}`)
    this.name = 'MetaApiError'
  }
}

export function getInstagramOAuthConfig() {
  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || (site ? `${site}/api/admin/social/instagram/callback` : '')
  return { appId, appSecret, redirectUri, configured: Boolean(appId && appSecret && redirectUri) }
}

export function buildInstagramAuthorizeUrl(state: string) {
  const { appId, redirectUri } = getInstagramOAuthConfig()
  const url = new URL('https://www.instagram.com/oauth/authorize')
  url.searchParams.set('client_id', appId ?? '')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', INSTAGRAM_SCOPES.join(','))
  url.searchParams.set('state', state)
  return url.toString()
}

async function parse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & MetaError
  if (!response.ok) {
    throw new MetaApiError(data.error?.code ?? response.status, data.error?.message ?? data.error_message ?? 'Request failed')
  }
  return data
}

/** code -> short-lived token -> long-lived (60 day) token. */
export async function exchangeCodeForLongLivedToken(code: string) {
  const { appId, appSecret, redirectUri } = getInstagramOAuthConfig()
  if (!appId || !appSecret) throw new Error('Instagram app is not configured.')
  const short = await parse<{ access_token: string; user_id: string | number }>(
    await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
      cache: 'no-store',
    })
  )
  const url = new URL('https://graph.instagram.com/access_token')
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('access_token', short.access_token)
  const long = await parse<{ access_token: string; expires_in: number }>(await fetch(url, { cache: 'no-store' }))
  return { accessToken: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString() }
}

/** Long-lived tokens (≥24h old, not expired) can be refreshed for another 60 days. */
export async function refreshLongLivedToken(accessToken: string) {
  const url = new URL('https://graph.instagram.com/refresh_access_token')
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', accessToken)
  const data = await parse<{ access_token: string; expires_in: number }>(await fetch(url, { cache: 'no-store' }))
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() }
}

async function metaRequest<T>(token: string, path: string, body?: URLSearchParams) {
  const response = await fetch(`${GRAPH}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body,
    cache: 'no-store',
  })
  return parse<T>(response)
}

export async function getInstagramProfile(token: string) {
  return metaRequest<{ user_id: string; username: string; id: string }>(token, 'me?fields=user_id,username,id')
}

async function waitForContainer(token: string, containerId: string) {
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

async function publishContainer(token: string, igUserId: string, containerId: string) {
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
export async function publishInstagramMedia(input: { token: string; igUserId: string; imageUrls: string[]; caption: string }) {
  const { token, igUserId, imageUrls, caption } = input
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

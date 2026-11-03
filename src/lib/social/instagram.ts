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

type IgRef = { id: string; username?: string }

async function igProfile(api: Api, igUserId: string): Promise<ResolvedIgAccount> {
  const ig = await metaRequest<{ id: string; username?: string }>(api, `${encodeURIComponent(igUserId)}?fields=id,username,profile_picture_url`)
  return { host: 'facebook', igUserId: String(ig.id), username: ig.username ?? null }
}

async function resolveViaFacebook(token: string, igUserIdHint?: string): Promise<ResolvedIgAccount[]> {
  const api: Api = { token, host: 'facebook' }
  if (igUserIdHint) return [await igProfile(api, igUserIdHint)]

  const found: IgRef[] = []
  // 1. User tokens with Pages: IG accounts linked to each Page.
  const pages = await metaRequest<{ data?: { instagram_business_account?: IgRef }[] }>(
    api,
    'me/accounts?fields=instagram_business_account{id,username,profile_picture_url}&limit=100'
  ).catch(() => null)
  for (const p of pages?.data ?? []) if (p.instagram_business_account) found.push(p.instagram_business_account)

  // 2. Page access tokens: "me" is the Page itself.
  if (!found.length) {
    const page = await metaRequest<{ instagram_business_account?: IgRef }>(api, 'me?fields=instagram_business_account{id,username,profile_picture_url}').catch(() => null)
    if (page?.instagram_business_account) found.push(page.instagram_business_account)
  }

  // 3. System user tokens (Unified login setup, no Page): IG ids are the granular scope targets.
  if (!found.length) {
    const url = `debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
    const debug = await metaRequest<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(api, url).catch(() => null)
    const ids = new Set<string>()
    for (const g of debug?.data?.granular_scopes ?? []) {
      if (g.scope === 'instagram_basic' || g.scope === 'instagram_content_publish') g.target_ids?.forEach((id) => ids.add(String(id)))
    }
    for (const id of ids) found.push({ id })
  }

  // 4. Last resort: IG accounts owned by the system user's business portfolio(s).
  if (!found.length) {
    const businesses = await metaRequest<{ data?: { id: string }[] }>(api, 'me/businesses?fields=id&limit=25').catch(() => null)
    for (const b of businesses?.data ?? []) {
      const owned = await metaRequest<{ data?: IgRef[] }>(api, `${b.id}/owned_instagram_accounts?fields=id,username&limit=100`).catch(() => null)
      found.push(...(owned?.data ?? []))
    }
  }

  if (!found.length) {
    throw new Error('No se encontró una cuenta de Instagram para este token de Facebook. Escribe el Instagram account ID manualmente.')
  }
  const unique = [...new Map(found.map((a) => [String(a.id), a])).values()]
  const resolved: ResolvedIgAccount[] = []
  for (const a of unique) {
    // Also confirms the token can actually read the IG account.
    resolved.push(a.username ? { host: 'facebook', igUserId: String(a.id), username: a.username } : await igProfile(api, String(a.id)))
  }
  return resolved
}

/** Validates a pasted token and returns the Instagram account(s) it can publish to. */
export async function resolveTokenAccounts(token: string, igUserIdHint?: string): Promise<ResolvedIgAccount[]> {
  const viaFacebook = (t: string) => resolveViaFacebook(t, igUserIdHint)
  const viaInstagram = async (t: string) => {
    const accounts = await resolveViaInstagram(t)
    if (igUserIdHint && accounts[0].igUserId !== igUserIdHint) throw new Error('El Instagram account ID no coincide con el token.')
    return accounts
  }
  const order = token.startsWith('EA') ? [viaFacebook, viaInstagram] : [viaInstagram, viaFacebook]
  let firstError: unknown
  for (const attempt of order) {
    try {
      return await attempt(token)
    } catch (err) {
      firstError ??= err
    }
  }
  // Report the error from the host the token most likely belongs to.
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

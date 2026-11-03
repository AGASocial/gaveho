import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { findAccount } from '@/lib/social/accounts'
import { requireAgentApi, scopeAllows } from '@/lib/social/agent-auth'
import { AGENT_UPLOAD_WINDOW_MS, AGENT_UPLOADS_PER_HOUR, newAgentUploadPath, parseUploadRequest, uploadRateLimit } from '@/lib/social/agent-uploads'
import { SOCIAL_BUCKET } from '@/lib/social/store'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStoreHeaders })

// POST { account, filename, content_type, size_bytes } → signed Supabase Storage upload URL.
// The client PUTs the file straight to Storage (bypassing Vercel's ~4.5 MB body limit), then passes
// `media_path` to POST /api/agent/social/posts. Signed upload URLs are valid for 2 hours.
export async function POST(request: Request) {
  const scope = await requireAgentApi(request)
  if (scope instanceof NextResponse) return scope
  const parsed = parseUploadRequest(await request.json().catch(() => null))
  if (!parsed.ok) return err(parsed.error === 'Body must be JSON.' ? 400 : 422, parsed.error)
  const { account: ref, contentType, sizeBytes, ext } = parsed.value
  const account = await findAccount(ref)
  if (!account) return err(404, 'Account not found.')
  if (!scopeAllows(scope, account.id)) return err(403, 'This API key is not allowed to upload for that account.')
  if (!account.is_active) return err(422, 'Account is disabled.')
  const db = supabaseAdmin()
  // Per-key rate limit (rolling hour), counted from the upload log. Legacy env key = key_id null.
  const since = new Date(Date.now() - AGENT_UPLOAD_WINDOW_MS).toISOString()
  const countQuery = db.from('gaveho_social_agent_uploads').select('id', { count: 'exact', head: true }).gte('created_at', since)
  const { count, error: countError } = await (scope.keyId ? countQuery.eq('key_id', scope.keyId) : countQuery.is('key_id', null))
  if (countError) {
    console.error('[agent/uploads] rate-limit count failed:', countError.message)
    return err(503, 'Uploads are temporarily unavailable.')
  }
  const limit = uploadRateLimit(count ?? 0)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit: at most ${AGENT_UPLOADS_PER_HOUR} uploads per hour per API key.` },
      { status: 429, headers: { ...noStoreHeaders, 'retry-after': String(limit.retryAfterSeconds) } }
    )
  }
  const mediaPath = newAgentUploadPath(account.id, ext)
  const { error: logError } = await db.from('gaveho_social_agent_uploads').insert({ key_id: scope.keyId, account_id: account.id, media_path: mediaPath })
  if (logError) {
    console.error('[agent/uploads] upload log insert failed:', logError.message)
    return err(503, 'Uploads are temporarily unavailable.')
  }
  const { data, error } = await db.storage.from(SOCIAL_BUCKET).createSignedUploadUrl(mediaPath)
  if (error || !data) {
    console.error('[agent/uploads] createSignedUploadUrl failed:', error?.message)
    return err(500, 'Could not prepare the upload.')
  }
  return NextResponse.json(
    {
      media_path: mediaPath,
      upload_url: data.signedUrl,
      token: data.token,
      method: 'PUT',
      headers: { 'content-type': contentType },
      content_type: contentType,
      max_bytes: sizeBytes,
      expires_in: 7200,
    },
    { status: 201, headers: { ...noStoreHeaders, 'x-ratelimit-limit': String(AGENT_UPLOADS_PER_HOUR), 'x-ratelimit-remaining': String(limit.remaining) } }
  )
}

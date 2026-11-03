import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { findAccount } from '@/lib/social/accounts'
import { requireAgentApi, scopeAllows } from '@/lib/social/agent-auth'
import { newAgentUploadPath, parseUploadRequest } from '@/lib/social/agent-uploads'
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
  const mediaPath = newAgentUploadPath(account.id, ext)
  const { data, error } = await supabaseAdmin().storage.from(SOCIAL_BUCKET).createSignedUploadUrl(mediaPath)
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
    { status: 201, headers: noStoreHeaders }
  )
}

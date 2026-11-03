import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { newVideoPath, videoPathRe } from '@/lib/social/media'
import { SOCIAL_BUCKET } from '@/lib/social/store'
import { httpReader, inspectVideo, MAX_VIDEO_BYTES, VideoError } from '@/lib/social/video'

export const maxDuration = 60

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStoreHeaders })

// Videos are too large for a function body (~4.5 MB on Vercel), so the browser uploads straight to
// Supabase Storage with a signed upload URL, then asks us to verify the file (format, duration, size).
//   { action: 'sign', contentType, size }  → { path, token }
//   { action: 'verify', path }             → { mediaPath, mediaUrl, info }  (invalid files are deleted)
export async function POST(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const body = (await request.json().catch(() => null)) as { action?: unknown; contentType?: unknown; size?: unknown; path?: unknown } | null
  const db = supabaseAdmin()
  const bucket = db.storage.from(SOCIAL_BUCKET)

  if (body?.action === 'sign') {
    const container = body.contentType === 'video/mp4' ? 'mp4' : body.contentType === 'video/quicktime' ? 'mov' : null
    if (!container) return fail(422, 'Video must be an MP4 or MOV file.')
    const size = Number(body.size)
    if (!size || size > MAX_VIDEO_BYTES) return fail(422, 'Video must be 300 MB or smaller.')
    const path = newVideoPath(container)
    const { data, error } = await bucket.createSignedUploadUrl(path)
    if (error || !data) return fail(500, 'Could not prepare the upload.')
    return NextResponse.json({ path, token: data.token }, { headers: noStoreHeaders })
  }

  if (body?.action === 'verify') {
    const path = typeof body.path === 'string' ? body.path : ''
    if (!videoPathRe.test(path)) return fail(422, 'Invalid video path.')
    const mediaUrl = bucket.getPublicUrl(path).data.publicUrl
    try {
      const info = await inspectVideo(await httpReader(mediaUrl))
      return NextResponse.json({ mediaPath: path, mediaUrl, info }, { headers: noStoreHeaders })
    } catch (e) {
      await bucket.remove([path])
      return fail(422, e instanceof VideoError ? e.message : 'Could not read the uploaded video.')
    }
  }

  return fail(400, "action must be 'sign' or 'verify'.")
}

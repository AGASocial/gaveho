import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { SOCIAL_BUCKET } from '@/lib/social/store'

const MAX_BYTES = 4 * 1024 * 1024 // client compresses to JPEG < 4MB (Vercel body limit ~4.5MB)

export async function POST(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const form = await request.formData().catch(() => null)
  const file = form?.get('image')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Select an image.' }, { status: 422, headers: noStoreHeaders })
  if (file.size <= 0 || file.size > MAX_BYTES || file.type !== 'image/jpeg') {
    return NextResponse.json({ error: 'Image must be a JPEG under 4 MB.' }, { status: 422, headers: noStoreHeaders })
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return NextResponse.json({ error: 'Not a JPEG.' }, { status: 422, headers: noStoreHeaders })
  const now = new Date()
  const mediaPath = `posts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.jpg`
  const db = supabaseAdmin()
  const { error } = await db.storage.from(SOCIAL_BUCKET).upload(mediaPath, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (error) {
    console.error('[social/upload] failed:', error.message)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500, headers: noStoreHeaders })
  }
  const mediaUrl = db.storage.from(SOCIAL_BUCKET).getPublicUrl(mediaPath).data.publicUrl
  return NextResponse.json({ mediaUrl, mediaPath }, { headers: noStoreHeaders })
}

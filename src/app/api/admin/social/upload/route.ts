import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { isJpeg, storeJpeg } from '@/lib/social/media'

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
  if (!isJpeg(bytes)) return NextResponse.json({ error: 'Not a JPEG.' }, { status: 422, headers: noStoreHeaders })
  try {
    return NextResponse.json(await storeJpeg(bytes), { headers: noStoreHeaders })
  } catch {
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500, headers: noStoreHeaders })
  }
}

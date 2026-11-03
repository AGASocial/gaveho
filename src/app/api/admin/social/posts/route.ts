import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { createSocialPost, listSocialPosts, PostError } from '@/lib/social/posts'
import { socialMediaPrefix } from '@/lib/social/store'
import { parseCreatePost } from '@/lib/social/validation'

export const maxDuration = 60

export async function GET() {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  try {
    return NextResponse.json({ posts: await listSocialPosts() }, { headers: noStoreHeaders })
  } catch {
    return NextResponse.json({ error: 'Could not load posts.' }, { status: 500, headers: noStoreHeaders })
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminApi()
  if (admin instanceof NextResponse) return admin
  const parsed = parseCreatePost(await request.json().catch(() => null), socialMediaPrefix())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422, headers: noStoreHeaders })
  try {
    const { post, result } = await createSocialPost(parsed.value, admin.id)
    if (!result) return NextResponse.json({ post }, { headers: noStoreHeaders })
    return NextResponse.json({ post: { ...post, ...result } }, { status: result.status === 'published' ? 200 : 502, headers: noStoreHeaders })
  } catch (e) {
    const status = e instanceof PostError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save post.' }, { status, headers: noStoreHeaders })
  }
}

// DELETE ?id= — only drafts, scheduled or failed posts can be removed.
export async function DELETE(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 422, headers: noStoreHeaders })
  const { data, error } = await supabaseAdmin().from('gaveho_social_posts').delete().eq('id', id).in('status', ['draft', 'scheduled', 'failed']).select('id')
  if (error || !data?.length) return NextResponse.json({ error: 'Could not delete post.' }, { status: 409, headers: noStoreHeaders })
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSecretFromRequest, isValidAdminSecret } from '@/lib/admin-auth'
import { publishPost } from '@/lib/drafts'

export async function POST(req: NextRequest) {
  const secret = getAdminSecretFromRequest(req)
  if (!isValidAdminSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { postId } = await req.json()

    if (!postId) {
      return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
    }

    const post = await publishPost(postId)

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        title: post.title,
        slug: post.slug,
        published: post.published,
      },
    })
  } catch (err) {
    console.error('[admin/publish] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

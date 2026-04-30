import { NextResponse } from 'next/server'
import { getPublishedPosts } from '@/lib/posts'

export async function GET() {
  try {
    const posts = await getPublishedPosts()
    return NextResponse.json(posts)
  } catch (err) {
    console.error('[posts] error:', err)
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
  }
}

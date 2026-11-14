import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { BlogAgentError, createAgentBlogPost, toAgentPostResponse } from '@/lib/blog/agent-posts'
import { checkBlogAgentRateLimit } from '@/lib/blog/agent-ratelimit'
import { parseCreateBlogPost } from '@/lib/blog/validation'
import { requireAgentPermission } from '@/lib/social/agent-auth'

export const dynamic = 'force-dynamic'

const err = (status: number, error: string, headers?: Record<string, string>) =>
  NextResponse.json({ error }, { status, headers: { ...noStoreHeaders, ...headers } })

// POST { title, content, slug?, excerpt?, tags?, cover_image?, sources?, language?, mode? }
export async function POST(request: Request) {
  const scope = await requireAgentPermission(request, 'blog:write')
  if (scope instanceof NextResponse) return scope

  const limit = await checkBlogAgentRateLimit(scope)
  if (!limit.ok) return err(429, limit.error, limit.headers)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err(400, 'Body must be JSON.')

  const parsed = parseCreateBlogPost(body)
  if (!parsed.ok) return err(422, parsed.error)

  try {
    const { post, created } = await createAgentBlogPost(parsed.value, scope.keyId)
    return NextResponse.json(toAgentPostResponse(post), {
      status: created ? 201 : 200,
      headers: { ...noStoreHeaders, ...limit.headers },
    })
  } catch (e) {
    if (e instanceof BlogAgentError) return err(e.status, e.message)
    console.error('[agent/blog/posts] POST failed:', e)
    return err(500, 'Could not create post.')
  }
}

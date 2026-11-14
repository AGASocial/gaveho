import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { BlogAgentError, findPostById, patchAgentBlogPost, toAgentPostResponse } from '@/lib/blog/agent-posts'
import { checkBlogAgentRateLimit } from '@/lib/blog/agent-ratelimit'
import { parsePatchBlogPost } from '@/lib/blog/validation'
import { requireAgentPermission } from '@/lib/social/agent-auth'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const err = (status: number, error: string, headers?: Record<string, string>) =>
  NextResponse.json({ error }, { status, headers: { ...noStoreHeaders, ...headers } })

type Ctx = { params: Promise<{ id: string }> }

// GET — id, slug, title, status, url, timestamps (requires blog:read or blog:write)
export async function GET(request: Request, ctx: Ctx) {
  const scope = await requireAgentPermission(request, 'blog:read')
  if (scope instanceof NextResponse) return scope

  const limit = await checkBlogAgentRateLimit(scope)
  if (!limit.ok) return err(429, limit.error, limit.headers)

  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return err(422, 'id must be a UUID.')

  try {
    const post = await findPostById(id)
    if (!post) return err(404, 'Post not found.')
    return NextResponse.json(toAgentPostResponse(post, { detail: true }), {
      headers: { ...noStoreHeaders, ...limit.headers },
    })
  } catch (e) {
    if (e instanceof BlogAgentError) return err(e.status, e.message)
    console.error('[agent/blog/posts] GET failed:', e)
    return err(500, 'Could not load post.')
  }
}

// PATCH { action: "publish" | mode: "publish_now" } and/or draft field updates
export async function PATCH(request: Request, ctx: Ctx) {
  const scope = await requireAgentPermission(request, 'blog:write')
  if (scope instanceof NextResponse) return scope

  const limit = await checkBlogAgentRateLimit(scope)
  if (!limit.ok) return err(429, limit.error, limit.headers)

  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return err(422, 'id must be a UUID.')

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err(400, 'Body must be JSON.')

  const parsed = parsePatchBlogPost(body)
  if (!parsed.ok) return err(422, parsed.error)

  try {
    const post = await patchAgentBlogPost(id, parsed.value)
    return NextResponse.json(toAgentPostResponse(post, { detail: true }), {
      headers: { ...noStoreHeaders, ...limit.headers },
    })
  } catch (e) {
    if (e instanceof BlogAgentError) return err(e.status, e.message)
    console.error('[agent/blog/posts] PATCH failed:', e)
    return err(500, 'Could not update post.')
  }
}

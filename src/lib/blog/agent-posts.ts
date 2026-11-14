import { revalidatePath } from 'next/cache'
import { isUndefinedColumnError } from '@/lib/supabase-errors'
import { supabaseAdmin } from '@/lib/supabase'
import type { Language, Post } from '@/types'
import { blogPostPublicUrl, fingerprintsMatch, type ParsedCreateBlogPost, type ParsedPatchBlogPost } from './validation'

const AGENT_KEY_ID_MIGRATION_MSG =
  'Database migration required: agent_key_id column is missing on gaveho_posts. Apply migrations and retry.'

export const PUBLISHED_POSTS_LOCKED_MSG = 'Published posts cannot be edited via the agent API.'

type AdminClient = ReturnType<typeof supabaseAdmin>
let getAdmin: () => AdminClient = supabaseAdmin

/** Test-only: swap the Supabase admin client used by agent blog writes. */
export function setBlogAgentAdminForTests(factory: (() => AdminClient) | null) {
  getAdmin = factory ?? supabaseAdmin
}

export class BlogAgentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'BlogAgentError'
  }
}

export type BlogAgentPostRow = Post & { agent_key_id?: string | null }

export type BlogAgentPostResponse = {
  id: string
  slug: string
  title?: string
  status: 'draft' | 'published'
  url: string
  created_at?: string
  updated_at?: string
}

export function toAgentPostResponse(post: BlogAgentPostRow, opts?: { detail?: boolean }): BlogAgentPostResponse {
  const base: BlogAgentPostResponse = {
    id: post.id,
    slug: post.slug,
    status: post.published ? 'published' : 'draft',
    url: blogPostPublicUrl(post.slug),
  }
  if (opts?.detail) {
    base.title = post.title
    base.created_at = post.created_at
    base.updated_at = post.updated_at
  }
  return base
}

/** Agent API may only see/edit posts owned by the same key; NULL (human/admin) posts are never exposed. */
export function isOwnedByAgent(post: BlogAgentPostRow, agentKeyId: string | null | undefined): boolean {
  return agentKeyId != null && post.agent_key_id === agentKeyId
}

function throwIfAgentKeyColumnMissing(error: { code?: string; message?: string } | null | undefined): void {
  if (error && isUndefinedColumnError(error)) {
    throw new BlogAgentError(AGENT_KEY_ID_MIGRATION_MSG, 503)
  }
}

/** Invalidate blog index, post page, sitemap and RSS after a publish. */
export function revalidateBlogSurfaces(slug: string) {
  revalidatePath('/blog')
  revalidatePath(`/blog/${slug}`)
  revalidatePath('/sitemap.xml')
  revalidatePath('/feed.xml')
}

let revalidateSurfaces: (slug: string) => void = revalidateBlogSurfaces

/** Test-only: stub path revalidation (next/cache is unavailable under plain node:test). */
export function setBlogRevalidateForTests(fn: ((slug: string) => void) | null) {
  revalidateSurfaces = fn ?? revalidateBlogSurfaces
}

export async function findPostBySlug(slug: string): Promise<BlogAgentPostRow | null> {
  const { data, error } = await getAdmin().from('gaveho_posts').select('*').eq('slug', slug).maybeSingle<BlogAgentPostRow>()
  throwIfAgentKeyColumnMissing(error)
  if (error) throw new BlogAgentError('Could not look up post.', 500)
  return data
}

export async function findPostById(id: string): Promise<BlogAgentPostRow | null> {
  const { data, error } = await getAdmin().from('gaveho_posts').select('*').eq('id', id).maybeSingle<BlogAgentPostRow>()
  throwIfAgentKeyColumnMissing(error)
  if (error) throw new BlogAgentError('Could not look up post.', 500)
  return data
}

/**
 * Create a blog post for an agent key, or return the existing one on idempotent retry.
 * Returns `{ post, created }`. Requires a database-backed key id (legacy env key denied).
 */
export async function createAgentBlogPost(
  input: ParsedCreateBlogPost,
  agentKeyId: string | null,
): Promise<{ post: BlogAgentPostRow; created: boolean }> {
  if (agentKeyId == null) {
    throw new BlogAgentError('Blog posts require a database-backed API key with a key id.', 403)
  }

  const existing = await findPostBySlug(input.slug)
  if (existing) {
    if (isOwnedByAgent(existing, agentKeyId) && fingerprintsMatch(existing, input)) {
      return { post: existing, created: false }
    }
    throw new BlogAgentError('A post with this slug already exists.', 409)
  }

  const row = {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    content: input.content,
    tags: input.tags,
    cover_image: input.cover_image,
    language: input.language as Language,
    published: input.mode === 'publish_now',
    agent_key_id: agentKeyId,
  }

  const { data, error } = await getAdmin().from('gaveho_posts').insert(row).select('*').single<BlogAgentPostRow>()
  if (error) {
    throwIfAgentKeyColumnMissing(error)
    // Unique violation race → re-check idempotency.
    if (error.code === '23505') {
      const again = await findPostBySlug(input.slug)
      if (again && isOwnedByAgent(again, agentKeyId) && fingerprintsMatch(again, input)) {
        return { post: again, created: false }
      }
      throw new BlogAgentError('A post with this slug already exists.', 409)
    }
    console.error('[agent/blog] insert failed:', error.message)
    throw new BlogAgentError('Could not create post.', 500)
  }

  if (data.published) revalidateSurfaces(data.slug)
  return { post: data, created: true }
}

export async function patchAgentBlogPost(
  id: string,
  patch: ParsedPatchBlogPost,
  agentKeyId: string | null,
): Promise<BlogAgentPostRow> {
  const existing = await findPostById(id)
  if (!existing || !isOwnedByAgent(existing, agentKeyId)) throw new BlogAgentError('Post not found.', 404)

  const updates: Partial<BlogAgentPostRow> = {}
  if (patch.title !== undefined) updates.title = patch.title
  if (patch.content !== undefined) updates.content = patch.content
  if (patch.excerpt !== undefined) updates.excerpt = patch.excerpt
  if (patch.tags !== undefined) updates.tags = patch.tags

  if (Object.keys(updates).length) {
    // Atomic: only drafts owned by this key; concurrent publish → 0 rows → 422.
    updates.updated_at = new Date().toISOString()
    const { data, error } = await getAdmin()
      .from('gaveho_posts')
      .update(updates)
      .eq('id', id)
      .eq('agent_key_id', agentKeyId as string)
      .eq('published', false)
      .select('*')
      .maybeSingle<BlogAgentPostRow>()
    if (error) {
      throwIfAgentKeyColumnMissing(error)
      console.error('[agent/blog] update failed:', error.message)
      throw new BlogAgentError('Could not update post.', 500)
    }
    if (!data) throw new BlogAgentError(PUBLISHED_POSTS_LOCKED_MSG, 422)
    Object.assign(existing, data)
  }

  if (patch.action === 'publish') {
    if (existing.published) return existing
    // Atomic false→true for the owning key only (idempotent if already published).
    const { data, error } = await getAdmin()
      .from('gaveho_posts')
      .update({ published: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('agent_key_id', agentKeyId as string)
      .eq('published', false)
      .select('*')
      .maybeSingle<BlogAgentPostRow>()
    if (error) {
      throwIfAgentKeyColumnMissing(error)
      console.error('[agent/blog] publish failed:', error.message)
      throw new BlogAgentError('Could not update post.', 500)
    }
    if (!data) {
      const again = await findPostById(id)
      if (again && isOwnedByAgent(again, agentKeyId) && again.published) return again
      throw new BlogAgentError(PUBLISHED_POSTS_LOCKED_MSG, 422)
    }
    revalidateSurfaces(data.slug)
    return data
  }

  return existing
}

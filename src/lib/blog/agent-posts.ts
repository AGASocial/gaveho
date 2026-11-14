import { revalidatePath } from 'next/cache'
import { publishPost } from '@/lib/drafts'
import { supabaseAdmin } from '@/lib/supabase'
import type { Language, Post } from '@/types'
import { blogPostPublicUrl, fingerprintsMatch, type ParsedCreateBlogPost, type ParsedPatchBlogPost } from './validation'

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

/** Invalidate blog index, post page, sitemap and RSS after a publish. */
export function revalidateBlogSurfaces(slug: string) {
  revalidatePath('/blog')
  revalidatePath(`/blog/${slug}`)
  revalidatePath('/sitemap.xml')
  revalidatePath('/feed.xml')
}

export async function findPostBySlug(slug: string): Promise<BlogAgentPostRow | null> {
  const { data, error } = await supabaseAdmin().from('gaveho_posts').select('*').eq('slug', slug).maybeSingle<BlogAgentPostRow>()
  if (error) throw new BlogAgentError('Could not look up post.', 500)
  return data
}

export async function findPostById(id: string): Promise<BlogAgentPostRow | null> {
  const { data, error } = await supabaseAdmin().from('gaveho_posts').select('*').eq('id', id).maybeSingle<BlogAgentPostRow>()
  if (error) throw new BlogAgentError('Could not look up post.', 500)
  return data
}

/**
 * Create a blog post for an agent key, or return the existing one on idempotent retry.
 * Returns `{ post, created }`.
 */
export async function createAgentBlogPost(
  input: ParsedCreateBlogPost,
  agentKeyId: string | null,
): Promise<{ post: BlogAgentPostRow; created: boolean }> {
  const existing = await findPostBySlug(input.slug)
  if (existing) {
    const sameKey = agentKeyId != null && existing.agent_key_id === agentKeyId
    if (sameKey && fingerprintsMatch(existing, input)) {
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

  const { data, error } = await supabaseAdmin().from('gaveho_posts').insert(row).select('*').single<BlogAgentPostRow>()
  if (error) {
    // Unique violation race → re-check idempotency.
    if (error.code === '23505') {
      const again = await findPostBySlug(input.slug)
      if (again && agentKeyId != null && again.agent_key_id === agentKeyId && fingerprintsMatch(again, input)) {
        return { post: again, created: false }
      }
      throw new BlogAgentError('A post with this slug already exists.', 409)
    }
    console.error('[agent/blog] insert failed:', error.message)
    throw new BlogAgentError('Could not create post.', 500)
  }

  if (data.published) revalidateBlogSurfaces(data.slug)
  return { post: data, created: true }
}

export async function patchAgentBlogPost(
  id: string,
  patch: ParsedPatchBlogPost,
): Promise<BlogAgentPostRow> {
  const existing = await findPostById(id)
  if (!existing) throw new BlogAgentError('Post not found.', 404)

  const updates: Partial<BlogAgentPostRow> = {}
  if (patch.title !== undefined) updates.title = patch.title
  if (patch.content !== undefined) updates.content = patch.content
  if (patch.excerpt !== undefined) updates.excerpt = patch.excerpt
  if (patch.tags !== undefined) updates.tags = patch.tags

  if (Object.keys(updates).length) {
    if (existing.published) throw new BlogAgentError('Published posts cannot be edited via the agent API.', 422)
    updates.updated_at = new Date().toISOString()
    const { data, error } = await supabaseAdmin()
      .from('gaveho_posts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single<BlogAgentPostRow>()
    if (error || !data) {
      console.error('[agent/blog] update failed:', error?.message)
      throw new BlogAgentError('Could not update post.', 500)
    }
    Object.assign(existing, data)
  }

  if (patch.action === 'publish') {
    if (existing.published) return existing
    const published = await publishPost(id)
    revalidateBlogSurfaces(published.slug)
    return published as BlogAgentPostRow
  }

  return existing
}

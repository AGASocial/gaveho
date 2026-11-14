import slugify from 'slugify'
import type { Language } from '@/types'
import { appendFuentesSection, isHttpsUrl, sanitizeMarkdown, type SourceInput } from './sanitize'

export const MAX_TITLE = 200
export const MAX_SLUG = 120
export const MAX_EXCERPT = 500
export const MAX_CONTENT = 100_000
export const MAX_TAGS = 20
export const MAX_TAG_LEN = 40
export const MAX_SOURCES = 20
export const MAX_COVER_URL = 2048

export type BlogPostMode = 'draft' | 'publish_now'

export type ParsedCreateBlogPost = {
  title: string
  slug: string
  content: string
  excerpt: string
  tags: string[]
  cover_image: string | null
  language: Language
  mode: BlogPostMode
  /** Content fingerprint used for idempotency (post-sanitize, post-Fuentes). */
  contentFingerprint: string
}

export type ParsedPatchBlogPost = {
  action: 'publish' | 'update'
  title?: string
  content?: string
  excerpt?: string
  tags?: string[]
}

function fingerprint(parts: { title: string; content: string; excerpt: string; tags: string[]; cover_image: string | null; language: Language }) {
  return JSON.stringify({
    title: parts.title,
    content: parts.content,
    excerpt: parts.excerpt,
    tags: [...parts.tags].sort(),
    cover_image: parts.cover_image,
    language: parts.language,
  })
}

export function makeSlug(title: string, slug?: string): string {
  const raw = (slug?.trim() || title).trim()
  return slugify(raw, { lower: true, strict: true }).slice(0, MAX_SLUG)
}

function parseTags(value: unknown): { ok: true; tags: string[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, tags: [] }
  if (!Array.isArray(value)) return { ok: false, error: 'tags must be an array of strings.' }
  if (value.length > MAX_TAGS) return { ok: false, error: `tags: at most ${MAX_TAGS} items.` }
  const tags: string[] = []
  for (const t of value) {
    if (typeof t !== 'string') return { ok: false, error: 'tags must be an array of strings.' }
    const tag = t.trim()
    if (!tag) continue
    if (tag.length > MAX_TAG_LEN) return { ok: false, error: `tags: each tag must be ≤ ${MAX_TAG_LEN} characters.` }
    if (!tags.includes(tag)) tags.push(tag)
  }
  return { ok: true, tags }
}

function parseSources(value: unknown): { ok: true; sources: SourceInput[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, sources: [] }
  if (!Array.isArray(value)) return { ok: false, error: 'sources must be an array.' }
  if (value.length > MAX_SOURCES) return { ok: false, error: `sources: at most ${MAX_SOURCES} items.` }
  const sources: SourceInput[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (!isHttpsUrl(item)) return { ok: false, error: 'sources URLs must be https.' }
      sources.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const url = typeof (item as { url?: unknown }).url === 'string' ? (item as { url: string }).url : ''
      if (!isHttpsUrl(url)) return { ok: false, error: 'sources[].url must be an https URL.' }
      const title = typeof (item as { title?: unknown }).title === 'string' ? (item as { title: string }).title : undefined
      sources.push({ title, url: url.trim() })
      continue
    }
    return { ok: false, error: 'sources items must be https URLs or { title, url } objects.' }
  }
  return { ok: true, sources }
}

export function parseCreateBlogPost(body: Record<string, unknown>): { ok: true; value: ParsedCreateBlogPost } | { ok: false; error: string } {
  if (typeof body.title !== 'string' || !body.title.trim()) return { ok: false, error: 'title is required.' }
  const title = body.title.trim()
  if (title.length > MAX_TITLE) return { ok: false, error: `title must be ≤ ${MAX_TITLE} characters.` }

  if (body.slug !== undefined && body.slug !== null && typeof body.slug !== 'string') return { ok: false, error: 'slug must be a string.' }
  const slug = makeSlug(title, typeof body.slug === 'string' ? body.slug : undefined)
  if (!slug) return { ok: false, error: 'slug could not be generated from title.' }

  if (typeof body.content !== 'string' || !body.content.trim()) return { ok: false, error: 'content is required.' }
  if (body.content.length > MAX_CONTENT) return { ok: false, error: `content must be ≤ ${MAX_CONTENT} characters.` }

  const excerptRaw = body.excerpt === undefined || body.excerpt === null ? '' : body.excerpt
  if (typeof excerptRaw !== 'string') return { ok: false, error: 'excerpt must be a string.' }
  if (excerptRaw.length > MAX_EXCERPT) return { ok: false, error: `excerpt must be ≤ ${MAX_EXCERPT} characters.` }

  const tagsParsed = parseTags(body.tags)
  if (!tagsParsed.ok) return tagsParsed

  let cover_image: string | null = null
  if (body.cover_image !== undefined && body.cover_image !== null && body.cover_image !== '') {
    if (typeof body.cover_image !== 'string') return { ok: false, error: 'cover_image must be a string URL.' }
    if (body.cover_image.length > MAX_COVER_URL) return { ok: false, error: 'cover_image URL is too long.' }
    if (!isHttpsUrl(body.cover_image)) return { ok: false, error: 'cover_image must be an https URL.' }
    cover_image = body.cover_image.trim()
  }

  const languageRaw = body.language ?? 'es'
  if (languageRaw !== 'es' && languageRaw !== 'en') return { ok: false, error: "language must be 'es' or 'en'." }
  const language = languageRaw as Language

  const modeRaw = body.mode ?? 'draft'
  if (modeRaw !== 'draft' && modeRaw !== 'publish_now') return { ok: false, error: "mode must be 'draft' or 'publish_now'." }

  const sourcesParsed = parseSources(body.sources)
  if (!sourcesParsed.ok) return sourcesParsed

  const sanitized = sanitizeMarkdown(body.content)
  const content = appendFuentesSection(sanitized, sourcesParsed.sources)
  const excerpt = sanitizeMarkdown(excerptRaw.trim())

  const value: ParsedCreateBlogPost = {
    title,
    slug,
    content,
    excerpt,
    tags: tagsParsed.tags,
    cover_image,
    language,
    mode: modeRaw,
    contentFingerprint: fingerprint({ title, content, excerpt, tags: tagsParsed.tags, cover_image, language }),
  }
  return { ok: true, value }
}

export function parsePatchBlogPost(body: Record<string, unknown>): { ok: true; value: ParsedPatchBlogPost } | { ok: false; error: string } {
  const publish =
    body.action === 'publish' || body.mode === 'publish_now' || body.action === 'publish_now'
  const hasUpdate =
    body.title !== undefined || body.content !== undefined || body.excerpt !== undefined || body.tags !== undefined

  if (!publish && !hasUpdate) {
    return { ok: false, error: 'Provide action/mode publish, or fields to update (title, content, excerpt, tags).' }
  }

  const out: ParsedPatchBlogPost = { action: publish && !hasUpdate ? 'publish' : publish ? 'publish' : 'update' }

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) return { ok: false, error: 'title must be a non-empty string.' }
    if (body.title.trim().length > MAX_TITLE) return { ok: false, error: `title must be ≤ ${MAX_TITLE} characters.` }
    out.title = body.title.trim()
  }
  if (body.content !== undefined) {
    if (typeof body.content !== 'string' || !body.content.trim()) return { ok: false, error: 'content must be a non-empty string.' }
    if (body.content.length > MAX_CONTENT) return { ok: false, error: `content must be ≤ ${MAX_CONTENT} characters.` }
    out.content = sanitizeMarkdown(body.content)
  }
  if (body.excerpt !== undefined) {
    if (typeof body.excerpt !== 'string') return { ok: false, error: 'excerpt must be a string.' }
    if (body.excerpt.length > MAX_EXCERPT) return { ok: false, error: `excerpt must be ≤ ${MAX_EXCERPT} characters.` }
    out.excerpt = sanitizeMarkdown(body.excerpt.trim())
  }
  if (body.tags !== undefined) {
    const tagsParsed = parseTags(body.tags)
    if (!tagsParsed.ok) return tagsParsed
    out.tags = tagsParsed.tags
  }

  // If both publish and field updates: apply updates then publish (still action publish).
  if (publish) out.action = 'publish'
  return { ok: true, value: out }
}

export function fingerprintsMatch(stored: {
  title: string
  content: string
  excerpt: string | null
  tags: string[] | null
  cover_image?: string | null
  language: Language
}, incoming: ParsedCreateBlogPost): boolean {
  return (
    fingerprint({
      title: stored.title,
      content: stored.content,
      excerpt: stored.excerpt ?? '',
      tags: stored.tags ?? [],
      cover_image: stored.cover_image ?? null,
      language: stored.language,
    }) === incoming.contentFingerprint
  )
}

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gaveho.com').replace(/\/$/, '')
}

export function blogPostPublicUrl(slug: string): string {
  return `${siteBaseUrl()}/blog/${slug}`
}

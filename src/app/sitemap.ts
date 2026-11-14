import type { MetadataRoute } from 'next'
import { getPublishedPosts } from '@/lib/posts'
import { siteBaseUrl } from '@/lib/blog/validation'

export const dynamic = 'force-dynamic'
export const revalidate = 60

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl()
  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  let posts: Awaited<ReturnType<typeof getPublishedPosts>> = []
  try {
    posts = await getPublishedPosts()
  } catch (err) {
    console.error('[sitemap] failed to load posts:', err instanceof Error ? err.message : err)
  }

  return [
    ...staticEntries,
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at || post.created_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}

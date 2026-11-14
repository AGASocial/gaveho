import { getPublishedPosts } from '@/lib/posts'
import { siteBaseUrl } from '@/lib/blog/validation'

export const dynamic = 'force-dynamic'
export const revalidate = 60

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const base = siteBaseUrl()
  let posts: Awaited<ReturnType<typeof getPublishedPosts>> = []
  try {
    posts = await getPublishedPosts()
  } catch (err) {
    console.error('[feed] failed to load posts:', err instanceof Error ? err.message : err)
  }

  const items = posts
    .map((post) => {
      const url = `${base}/blog/${post.slug}`
      const date = new Date(post.updated_at || post.created_at).toUTCString()
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${date}</pubDate>
      <description>${escapeXml(post.excerpt ?? '')}</description>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>GAVEHO Blog</title>
    <link>${escapeXml(`${base}/blog`)}</link>
    <description>Thoughts on AI, TypeScript, full-stack engineering, and building things.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}

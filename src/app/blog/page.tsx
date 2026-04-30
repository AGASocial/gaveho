import { getPublishedPosts } from '@/lib/posts'
import { PostCard } from '@/components/blog/post-card'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Thoughts on AI, TypeScript, full-stack engineering, and building things.',
}

export const dynamic = 'force-dynamic'
export const revalidate = 60

export default async function BlogPage() {
  const posts = await getPublishedPosts()

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Blog</h1>
        <p className="text-muted-foreground">
          Thoughts on AI, TypeScript, full-stack engineering, and things I&apos;m building.
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No posts yet — check back soon.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

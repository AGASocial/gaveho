import { notFound } from 'next/navigation'
import { getPostBySlug } from '@/lib/posts'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDate } from '@/lib/utils'
import { MDXRemote } from 'next-mdx-remote/rsc'
import type { Metadata } from 'next'

// Fully dynamic — posts are fetched at request time, revalidated every 60s
export const dynamic = 'force-dynamic'
export const revalidate = 60

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.excerpt,
  }
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  return (
    <article className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {post.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
        <h1 className="text-3xl font-bold tracking-tight leading-tight">{post.title}</h1>
        <p className="text-muted-foreground">{formatDate(post.created_at)}</p>
        <p className="text-lg text-muted-foreground leading-relaxed">{post.excerpt}</p>
      </div>

      <Separator />

      {/* Content */}
      <div className="prose prose-neutral dark:prose-invert max-w-none
        prose-headings:font-semibold prose-headings:tracking-tight
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
        prose-pre:bg-muted prose-pre:border prose-pre:border-border">
        <MDXRemote source={post.content} />
      </div>
    </article>
  )
}

import { notFound } from 'next/navigation'
import { getPostBySlug } from '@/lib/posts'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDate } from '@/lib/utils'
import { MDXRemote } from 'next-mdx-remote/rsc'
import type { Metadata } from 'next'

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
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { slug } = await params
  const { preview } = await searchParams

  const isPreview = preview === process.env.AGENT_SECRET

  const post = await getPostBySlug(slug, isPreview)
  if (!post) notFound()

  return (
    <article className="space-y-8">
      {/* Draft banner */}
      {!post.published && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-md">
          📝 <strong>Draft</strong> — this post is not published yet.
        </div>
      )}

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
        prose-headings:font-semibold prose-headings:tracking-tight prose-headings:scroll-mt-20
        prose-p:leading-relaxed prose-p:text-foreground/90
        prose-a:text-primary prose-a:no-underline prose-a:font-medium hover:prose-a:underline
        prose-strong:text-foreground prose-strong:font-semibold
        prose-blockquote:border-l-primary/40 prose-blockquote:text-muted-foreground prose-blockquote:not-italic
        prose-code:before:content-none prose-code:after:content-none
        prose-code:bg-zinc-900 prose-code:text-emerald-300 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:font-mono prose-code:font-normal
        prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-lg prose-pre:shadow-md
        prose-pre:text-zinc-100
        [&_pre_code]:bg-transparent [&_pre_code]:text-zinc-100 [&_pre_code]:p-0
        prose-hr:border-border
        prose-li:text-foreground/90
        prose-img:rounded-lg prose-img:shadow-sm">
        <MDXRemote source={post.content} />
      </div>
    </article>
  )
}

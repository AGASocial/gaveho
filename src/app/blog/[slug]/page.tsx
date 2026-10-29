import { notFound } from 'next/navigation'
import { getPostBySlug } from '@/lib/posts'
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
      {!post.published && (
        <div className="bg-amber-900/30 border-2 border-amber-500/50 text-amber-300 text-sm px-4 py-3 font-mono">
          <span className="text-amber-500">▸</span> DRAFT — this post is not published yet.
        </div>
      )}

      <div className="space-y-5">
        <div className="text-sm text-cyan-500 font-mono">
          <span className="text-emerald-500">▸</span> cat blog/{post.slug}.md
        </div>
        
        <div className="flex flex-wrap gap-2">
          {post.tags?.map((tag) => (
            <span key={tag} className="text-xs px-2 py-1 border-2 border-cyan-500/40 text-cyan-400">
              #{tag}
            </span>
          ))}
        </div>
        
        <h1 className="text-3xl font-bold leading-tight text-gray-100">{post.title}</h1>
        
        <div className="flex items-center gap-2 text-sm text-emerald-500">
          <span>▸</span>
          <span>{formatDate(post.created_at)}</span>
        </div>
        
        <p className="text-lg text-gray-300 leading-relaxed">{post.excerpt}</p>
      </div>

      <div className="border-t border-emerald-500/30" />

      <div className="prose prose-invert max-w-none
        prose-headings:font-bold prose-headings:text-gray-100 prose-headings:tracking-tight prose-headings:scroll-mt-20
        prose-p:leading-relaxed prose-p:text-gray-300
        prose-a:text-cyan-400 prose-a:no-underline prose-a:font-medium hover:prose-a:underline
        prose-strong:text-emerald-400 prose-strong:font-bold
        prose-blockquote:border-l-4 prose-blockquote:border-cyan-500/50 prose-blockquote:text-gray-400 prose-blockquote:not-italic prose-blockquote:pl-4
        prose-code:before:content-none prose-code:after:content-none
        prose-code:bg-emerald-950 prose-code:text-emerald-300 prose-code:px-2 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono
        prose-pre:bg-black prose-pre:border-2 prose-pre:border-emerald-500/30 prose-pre:rounded-none prose-pre:shadow-lg
        prose-pre:text-gray-100
        [&_pre_code]:bg-transparent [&_pre_code]:text-gray-100 [&_pre_code]:p-0
        prose-hr:border-emerald-500/30
        prose-li:text-gray-300
        prose-ul:list-disc prose-ul:list-inside
        prose-ol:list-decimal prose-ol:list-inside
        prose-img:rounded-none prose-img:border-2 prose-img:border-cyan-500/30">
        <MDXRemote source={post.content} />
      </div>
    </article>
  )
}

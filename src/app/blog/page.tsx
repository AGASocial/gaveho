import { getPublishedPosts } from '@/lib/posts'
import { PostCard } from '@/components/blog/post-card'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Metadata } from 'next'
import type { Language } from '@/types'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Thoughts on AI, TypeScript, full-stack engineering, and building things.',
}

export const dynamic = 'force-dynamic'
export const revalidate = 60

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang } = await searchParams
  const language = (lang === 'es' ? 'es' : lang === 'en' ? 'en' : undefined) as Language | undefined

  const posts = await getPublishedPosts(language)

  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Blog</h1>
          <p className="text-muted-foreground leading-relaxed">
            Thoughts on AI, TypeScript, full-stack engineering, and things I&apos;m building.
          </p>
        </div>

        {/* Language toggle */}
        <div className="flex gap-1.5 text-sm">
          <Link
            href="/blog"
            className={cn(
              'px-3 py-1.5 rounded-lg border transition-colors font-medium',
              !language
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            All
          </Link>
          <Link
            href="/blog?lang=en"
            className={cn(
              'px-3 py-1.5 rounded-lg border transition-colors font-medium',
              language === 'en'
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            🇺🇸 English
          </Link>
          <Link
            href="/blog?lang=es"
            className={cn(
              'px-3 py-1.5 rounded-lg border transition-colors font-medium',
              language === 'es'
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            🇪🇸 Español
          </Link>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-muted-foreground text-sm">
            {language === 'es' ? 'No hay artículos aún — vuelve pronto.' : 'No posts yet — check back soon.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

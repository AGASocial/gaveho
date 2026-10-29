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
      <div className="space-y-6">
        <div className="text-sm text-cyan-700 dark:text-cyan-500 font-mono">
          <span className="text-emerald-600 dark:text-emerald-500">▸</span> cat blog/index.md
        </div>
        
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Blog</h1>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed max-w-2xl">
            Thoughts, technical deep dives, and reflections on building software with minimal friction and maximum intent.
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <Link
            href="/blog"
            className={cn(
              'px-4 py-2 border-2 transition-colors font-semibold',
              !language
                ? 'bg-emerald-700 text-white dark:bg-emerald-600 dark:text-black border-emerald-700 dark:border-emerald-600'
                : 'border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-600 dark:hover:border-emerald-500/50'
            )}
          >
            All
          </Link>
          <Link
            href="/blog?lang=en"
            className={cn(
              'px-4 py-2 border-2 transition-colors font-semibold',
              language === 'en'
                ? 'bg-cyan-700 text-white dark:bg-cyan-600 dark:text-black border-cyan-700 dark:border-cyan-600'
                : 'border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:text-cyan-700 dark:hover:text-cyan-400 hover:border-cyan-600 dark:hover:border-cyan-500/50'
            )}
          >
            🇺🇸 English
          </Link>
          <Link
            href="/blog?lang=es"
            className={cn(
              'px-4 py-2 border-2 transition-colors font-semibold',
              language === 'es'
                ? 'bg-cyan-700 text-white dark:bg-cyan-600 dark:text-black border-cyan-700 dark:border-cyan-600'
                : 'border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:text-cyan-700 dark:hover:text-cyan-400 hover:border-cyan-600 dark:hover:border-cyan-500/50'
            )}
          >
            🇪🇸 Español
          </Link>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
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

import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import type { Post } from '@/types'

export function PostCard({ post }: { post: Post }) {
  const category = post.tags?.[0]?.toUpperCase() ?? 'ENGINEERING'

  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <div className="border-2 border-emerald-600/30 dark:border-emerald-500/30 bg-gray-50 dark:bg-black/40 hover:border-cyan-600/60 dark:hover:border-cyan-500/60 transition-all cursor-pointer h-full flex flex-col p-5">
        <div className="flex flex-col flex-1 gap-3">
          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-500">
            [{category}]
          </p>
          <h2 className="text-lg font-semibold leading-snug text-gray-900 dark:text-gray-100 group-hover:text-cyan-700 dark:group-hover:text-cyan-400 transition-colors">
            {post.title}
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3 flex-1">
            {post.excerpt}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-5 text-xs text-emerald-700 dark:text-emerald-500">
          <span>▸</span>
          <span>{formatDate(post.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}

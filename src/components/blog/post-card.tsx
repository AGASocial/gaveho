import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import type { Post } from '@/types'

export function PostCard({ post }: { post: Post }) {
  const category = post.tags?.[0]?.toUpperCase() ?? 'ENGINEERING'

  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <div className="group-hover:shadow-md group-hover:border-foreground/20 transition-all duration-200 cursor-pointer h-full flex flex-col border border-border bg-card p-6">
        <div className="flex flex-col flex-1 gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            {category}
          </p>
          <h2 className="text-lg font-semibold leading-snug group-hover:text-primary transition-colors duration-150">
            {post.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
            {post.excerpt}
          </p>
        </div>
        <p className="text-xs text-muted-foreground/60 tabular-nums font-mono mt-5">
          {formatDate(post.created_at)}
        </p>
      </div>
    </Link>
  )
}

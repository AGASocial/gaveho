import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { Post } from '@/types'

export function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <Card className="group-hover:shadow-lg group-hover:border-border/80 transition-all duration-200 cursor-pointer h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-1 mb-3">
            {post.tags?.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
          </div>
          <h2 className="text-lg font-semibold leading-snug group-hover:text-primary transition-colors duration-150">
            {post.title}
          </h2>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 justify-between gap-4">
          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
            {post.excerpt}
          </p>
          <p className="text-xs text-muted-foreground/70 tabular-nums">
            {formatDate(post.created_at)}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}

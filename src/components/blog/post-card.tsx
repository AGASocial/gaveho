import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { Post } from '@/types'

export function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap gap-1 mb-2">
            {post.tags?.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <h2 className="text-xl font-semibold leading-tight hover:text-primary transition-colors">
            {post.title}
          </h2>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm leading-relaxed mb-3">
            {post.excerpt}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(post.created_at)}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export type PreviewPost = {
  id: string
  caption: string
  media_urls: string[]
  media_type?: 'image' | 'reel'
  cover_url?: string | null
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
  scheduled_at: string | null
  published_at: string | null
  published_permalink: string | null
  error: string | null
  account: { label: string; username: string | null } | null
}

export function postKind(p: Pick<PreviewPost, 'media_type' | 'media_urls'>): 'reel' | 'carousel' | 'image' {
  if (p.media_type === 'reel') return 'reel'
  return p.media_urls.length > 1 ? 'carousel' : 'image'
}

/** Modal preview of a post: native <dialog> (showModal gives Esc, inert background and top-layer). */
export function PostPreviewDialog({
  post,
  statusClass,
  onClose,
}: {
  post: PreviewPost | null
  statusClass: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (post) {
      if (!d.open) d.showModal()
      closeRef.current?.focus()
    } else if (d.open) d.close()
  }, [post])

  const count = post?.media_urls.length ?? 0
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count])
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count])

  // Keep Tab focus within the dialog (explicit trap on top of the native inert background).
  function onKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    const kind = post ? postKind(post) : null
    if (kind === 'carousel' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const t = e.target as HTMLElement
      if (t.tagName !== 'VIDEO') {
        e.preventDefault()
        if (e.key === 'ArrowLeft') prev()
        else next()
      }
    }
    if (e.key !== 'Tab' || !ref.current) return
    const els = Array.from(
      ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])'),
    )
    if (els.length === 0) return
    const first = els[0]
    const last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const kind = post ? postKind(post) : null
  const titleId = 'post-preview-title'

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // backdrop click
      }}
      className="m-auto w-[min(92vw,48rem)] max-h-[92vh] rounded-lg border border-border bg-background p-0 text-foreground font-mono backdrop:bg-black/80"
    >
      {post ? (
        <div className="flex max-h-[92vh] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <h2 id={titleId} className="text-sm font-semibold truncate">
              {post.account?.username ? `@${post.account.username}` : post.account?.label ?? 'Post'} · {kind}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto">
            <div className="relative flex items-center justify-center bg-black">
              {kind === 'reel' ? (
                <video
                  key={post.media_urls[0]}
                  src={post.media_urls[0]}
                  poster={post.cover_url ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[60vh] w-auto"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.media_urls[kind === 'carousel' ? index : 0]}
                  alt={kind === 'carousel' ? `Image ${index + 1} of ${count}` : 'Post image'}
                  className="max-h-[60vh] w-auto object-contain"
                />
              )}
              {kind === 'carousel' ? (
                <>
                  <button
                    type="button"
                    onClick={prev}
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <span aria-live="polite" className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                    {index + 1} / {count}
                  </span>
                </>
              ) : null}
            </div>

            <div className="space-y-3 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusClass}>{post.status}</Badge>
                <Badge variant="outline">{kind}</Badge>
                <span className="text-muted-foreground">{post.account?.label}</span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {post.scheduled_at ? (
                  <>
                    <dt className="text-muted-foreground">scheduled</dt>
                    <dd>{new Date(post.scheduled_at).toLocaleString()}</dd>
                  </>
                ) : null}
                {post.published_at ? (
                  <>
                    <dt className="text-muted-foreground">published</dt>
                    <dd>{new Date(post.published_at).toLocaleString()}</dd>
                  </>
                ) : null}
                {post.published_permalink ? (
                  <>
                    <dt className="text-muted-foreground">instagram</dt>
                    <dd>
                      <a href={post.published_permalink} target="_blank" rel="noreferrer" className="underline break-all">
                        {post.published_permalink}
                      </a>
                    </dd>
                  </>
                ) : null}
              </dl>
              {post.error ? (
                <p role="alert" className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-500 whitespace-pre-wrap">
                  {post.error}
                </p>
              ) : null}
              <div>
                <p className="mb-1 text-xs text-muted-foreground">caption</p>
                {post.caption ? (
                  <p className="whitespace-pre-wrap break-words">{post.caption}</p>
                ) : (
                  <em className="text-muted-foreground">no caption</em>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  )
}

'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Film, Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { prepareInstagramJpeg } from '@/lib/social/image-upload'
import { supabase } from '@/lib/supabase'
import { PostPreviewDialog } from './post-preview-dialog'

type Account = {
  id: string
  platform: string
  api_host: 'instagram' | 'facebook'
  label: string
  username: string | null
  caption_voice: string | null
  token_expires_at: string | null
  is_active: boolean
}
type Post = {
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
  created_at: string
  account: { label: string; username: string | null } | null
}
type Media = { mediaUrl: string; mediaPath: string }
type VideoMedia = Media & { info: { durationSeconds: number; width: number; height: number; sizeBytes: number; warnings: string[] } }
const MAX_VIDEO_BYTES = 300 * 1024 * 1024

const statusColor: Record<Post['status'], string> = {
  draft: 'bg-zinc-600',
  scheduled: 'bg-blue-600',
  publishing: 'bg-yellow-600',
  published: 'bg-green-600',
  failed: 'bg-red-600',
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  return data as T
}

const TIKTOK_PRIVACY = [
  ['SELF_ONLY', 'Only me (required until the TikTok app is audited)'],
  ['MUTUAL_FOLLOW_FRIENDS', 'Friends'],
  ['FOLLOWER_OF_CREATOR', 'Followers'],
  ['PUBLIC_TO_EVERYONE', 'Everyone'],
] as const

export function SocialPublisher({ encryptionConfigured, tiktokConfigured = false }: { encryptionConfigured: boolean; tiktokConfigured?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newToken, setNewToken] = useState('')
  const [newIgId, setNewIgId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [media, setMedia] = useState<Media[]>([])
  const [postType, setPostType] = useState<'image' | 'reel'>('image')
  const [video, setVideo] = useState<VideoMedia | null>(null)
  const [cover, setCover] = useState<Media | null>(null)
  const [thumbSeconds, setThumbSeconds] = useState('')
  const [shareToFeed, setShareToFeed] = useState(true)
  const [caption, setCaption] = useState('')
  const [preview, setPreview] = useState<Post | null>(null)
  const [hint, setHint] = useState('')
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [scheduledAt, setScheduledAt] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [alsoIds, setAlsoIds] = useState<string[]>([])
  const [ttPrivacy, setTtPrivacy] = useState<string>('SELF_ONLY')
  const [ttOptions, setTtOptions] = useState<string[]>([])
  const [ttFlags, setTtFlags] = useState({ disable_comment: false, disable_duet: false, disable_stitch: false, is_aigc: false })

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        fetch('/api/admin/social/accounts').then((r) => json<{ accounts: Account[] }>(r)),
        fetch('/api/admin/social/posts').then((r) => json<{ posts: Post[] }>(r)),
      ])
      setAccounts(a.accounts)
      setPosts(p.posts)
      setAccountId((cur) => cur || a.accounts.find((x) => x.is_active)?.id || '')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Load failed')
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('tiktok') === 'connected'
    const ttError = params.get('tiktok_error')
    if (connected || ttError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage(connected ? 'TikTok account connected.' : `TikTok connection failed: ${ttError}`)
      window.history.replaceState(null, '', window.location.pathname)
    }
    load()
  }, [load])

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setMessage(null)
    try {
      await fn()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const onFiles = (files: FileList | null) =>
    run('upload', async () => {
      for (const file of Array.from(files ?? []).slice(0, 10 - media.length)) {
        const body = new FormData()
        body.set('image', await prepareInstagramJpeg(file))
        const uploaded = await json<Media>(await fetch('/api/admin/social/upload', { method: 'POST', body }))
        setMedia((m) => [...m, uploaded])
      }
    })

  // Videos go browser → Supabase Storage via a signed upload URL (too big for a function body), then get verified.
  const onVideo = (file: File | undefined) =>
    run('video', async () => {
      if (!file) return
      if (!['video/mp4', 'video/quicktime'].includes(file.type)) throw new Error('Reels must be MP4 or MOV.')
      if (file.size > MAX_VIDEO_BYTES) throw new Error('Video must be 300 MB or smaller.')
      const post = (body: object) =>
        fetch('/api/admin/social/upload-video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const signed = await json<{ path: string; token: string }>(await post({ action: 'sign', contentType: file.type, size: file.size }))
      const { error } = await supabase().storage.from('gaveho-social').uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type })
      if (error) throw new Error(`Upload failed: ${error.message}`)
      setVideo(await json<VideoMedia>(await post({ action: 'verify', path: signed.path })))
    })

  const onCover = (file: File | undefined) =>
    run('cover', async () => {
      if (!file) return
      const body = new FormData()
      body.set('image', await prepareInstagramJpeg(file))
      setCover(await json<Media>(await fetch('/api/admin/social/upload', { method: 'POST', body })))
    })

  const platformOf = (id: string) => accounts.find((a) => a.id === id)?.platform
  const primaryTikTok = platformOf(accountId) === 'tiktok'
  const isReel = postType === 'reel' || primaryTikTok
  const targets = [accountId, ...alsoIds.filter((id) => id !== accountId)]
  const hasTikTok = targets.some((id) => platformOf(id) === 'tiktok')
  const tiktokTarget = targets.find((id) => platformOf(id) === 'tiktok')

  // Load the TikTok creator's allowed privacy levels when a TikTok account is targeted.
  useEffect(() => {
    if (!tiktokTarget) return
    let cancelled = false
    fetch(`/api/admin/social/tiktok/creator-info?accountId=${tiktokTarget}`)
      .then((r) => json<{ creator: { privacy_level_options: string[] } }>(r))
      .then((r) => {
        if (cancelled) return
        setTtOptions(r.creator.privacy_level_options)
        setTtPrivacy((cur) => (r.creator.privacy_level_options.includes(cur) ? cur : r.creator.privacy_level_options.includes('SELF_ONLY') ? 'SELF_ONLY' : r.creator.privacy_level_options[0] ?? cur))
      })
      .catch(() => !cancelled && setTtOptions([]))
    return () => {
      cancelled = true
    }
  }, [tiktokTarget])
  const hasMedia = isReel ? !!video : media.length > 0
  const captionSource = isReel ? cover : media[0]

  const genCaption = () =>
    run('caption', async () => {
      if (!captionSource) throw new Error(isReel ? 'Add a cover image to generate a caption.' : 'Upload an image first.')
      const r = await json<{ caption: string }>(
        await fetch('/api/admin/social/caption', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mediaPath: captionSource.mediaPath, hint, language, accountId }),
        })
      )
      setCaption(r.caption)
    })

  const submit = (mode: 'draft' | 'schedule' | 'now') =>
    run(mode, async () => {
      const names = targets.map((id) => accounts.find((a) => a.id === id)).map((a) => (a ? `${a.platform} @${a.username ?? a.label}` : '?'))
      if (mode === 'now' && !confirm(`Publish now to ${names.join(' and ')}?`)) return
      const res = await json<{ result?: { status: string; message?: string } }>(
        await fetch('/api/admin/social/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accountId,
            caption,
            mediaType: isReel ? 'reel' : 'image',
            ...(isReel && alsoIds.length ? { alsoAccountIds: alsoIds.filter((id) => id !== accountId) } : {}),
            ...(hasTikTok ? { tiktok: { privacy_level: ttPrivacy, ...ttFlags } } : {}),
            mediaUrls: isReel ? (video ? [video.mediaUrl] : []) : media.map((m) => m.mediaUrl),
            ...(isReel
              ? { coverUrl: cover?.mediaUrl ?? null, thumbOffset: thumbSeconds ? Math.round(Number(thumbSeconds) * 1000) : null, shareToFeed }
              : {}),
            mode,
            scheduledAt: mode === 'schedule' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          }),
        })
      )
      setMedia([])
      setVideo(null)
      setCover(null)
      setThumbSeconds('')
      setShareToFeed(true)
      setAlsoIds([])
      setCaption('')
      setHint('')
      setScheduledAt('')
      setMessage(res.result?.status === 'publishing' ? res.result.message ?? 'Processing…' : mode === 'now' ? 'Published.' : mode === 'schedule' ? 'Scheduled.' : 'Draft saved.')
      await load()
    })

  const publishExisting = (id: string) =>
    run(`pub-${id}`, async () => {
      if (!confirm('Publish this post now?')) return
      const r = await json<{ status?: string; message?: string }>(await fetch(`/api/admin/social/posts/${id}/publish`, { method: 'POST' }))
      if (r.status === 'publishing') setMessage(r.message ?? 'The platform is still processing the video.')
      await load()
    })

  const removePost = (id: string) =>
    run(`del-${id}`, async () => {
      if (!confirm('Delete this post?')) return
      await json(await fetch(`/api/admin/social/posts?id=${id}`, { method: 'DELETE' }))
      await load()
    })

  const refreshToken = (id: string) =>
    run(`ref-${id}`, async () => {
      await json(await fetch(`/api/admin/social/accounts/${id}/refresh`, { method: 'POST' }))
      await load()
    })

  const toggleAccount = (a: Account) =>
    run(`tog-${a.id}`, async () => {
      await json(
        await fetch('/api/admin/social/accounts', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: a.id, isActive: !a.is_active }),
        })
      )
      await load()
    })

  const addAccount = (e: FormEvent) => {
    e.preventDefault()
    return run('add', async () => {
      const r = await json<{ accounts: Account[]; replaced: number }>(
        await fetch('/api/admin/social/accounts/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ label: newLabel, token: newToken, igUserId: newIgId }),
        })
      )
      setNewToken('')
      setNewIgId('')
      setNewLabel('')
      await load()
      setMessage(
        `${r.replaced ? 'Token actualizado' : 'Cuenta agregada'}: ${r.accounts.map((a) => `@${a.username ?? a.label}`).join(', ')}`
      )
    })
  }

  const removeAccount = (a: Account) =>
    run(`rm-${a.id}`, async () => {
      if (!confirm(`¿Eliminar ${a.label} (@${a.username})? También se borran sus posts guardados.`)) return
      await json(await fetch(`/api/admin/social/accounts?id=${a.id}`, { method: 'DELETE' }))
      setAccountId((cur) => (cur === a.id ? '' : cur))
      await load()
    })

  const editVoice = (a: Account) => {
    const next = prompt(`Voz para captions de IA (@${a.username ?? a.label}). Vacío = voz por defecto.`, a.caption_voice ?? '')
    if (next === null) return
    return run(`voice-${a.id}`, async () => {
      await json(
        await fetch('/api/admin/social/accounts', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: a.id, captionVoice: next }),
        })
      )
      await load()
      setMessage('Voz actualizada.')
    })
  }

  const activeAccounts = accounts.filter((a) => a.is_active)

  return (
    <div className="space-y-6">
      {message ? <p className="text-sm border border-border rounded p-3">{message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.length === 0 ? <p className="text-sm text-muted-foreground">No accounts connected yet.</p> : null}
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="outline">{a.platform}</Badge>
                <span className="font-semibold">{a.label}</span>
                <span className="text-muted-foreground">@{a.username}</span>
                <span className="text-muted-foreground">
                  {a.platform === 'tiktok' ? 'open.tiktokapis.com · access token auto-refreshes' : a.api_host === 'facebook' ? 'graph.facebook.com' : 'graph.instagram.com'}
                  {a.platform === 'tiktok' ? null : <> · token expires {a.token_expires_at ? new Date(a.token_expires_at).toLocaleDateString() : 'never / unknown'}</>}
                </span>
                {!a.is_active ? <Badge className="bg-zinc-600">disabled</Badge> : null}
                <span className="ml-auto flex gap-2">
                  {(a.api_host === 'instagram' && a.token_expires_at) || a.platform === 'tiktok' ? (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => refreshToken(a.id)}>
                      refresh token
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => toggleAccount(a)}>
                    {a.is_active ? 'disable' : 'enable'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => editVoice(a)} title={a.caption_voice ?? ''}>
                    {a.caption_voice ? 'edit voice' : 'set voice'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => removeAccount(a)}>
                    remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {encryptionConfigured && tiktokConfigured ? (
            <div className="border-t border-border pt-4">
              <a href="/api/admin/social/tiktok/connect" className="inline-flex items-center rounded border border-border px-3 py-1.5 text-sm hover:bg-muted">
                Connect TikTok
              </a>
              <p className="text-xs text-muted-foreground mt-1">Opens TikTok to authorize posting; reconnecting the same TikTok user updates its tokens.</p>
            </div>
          ) : null}
          {encryptionConfigured ? (
            <form onSubmit={addAccount} className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-semibold">Agregar cuenta</p>
              <p className="text-xs text-muted-foreground">
                Pega un token de acceso de Instagram (Meta → Instagram API → Generar tokens de acceso). Si la cuenta ya existe, se
                reemplaza su token. Si no se detecta la cuenta automáticamente, escribe su Instagram account ID.
              </p>
              <div className="grid gap-2 md:grid-cols-[180px_1fr_200px_auto] items-end">
                <div className="space-y-1">
                  <Label htmlFor="label">Nombre (opcional)</Label>
                  <Input id="label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="GAVEHO AI" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="token">Token de acceso</Label>
                  <Input
                    id="token"
                    type="password"
                    autoComplete="off"
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    placeholder="IG… o EA…"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="igid">Instagram account ID (opcional)</Label>
                  <Input
                    id="igid"
                    inputMode="numeric"
                    value={newIgId}
                    onChange={(e) => setNewIgId(e.target.value.replace(/\D/g, ''))}
                    placeholder="1784…"
                  />
                </div>
                <Button type="submit" disabled={busy !== null || !newToken.trim()}>
                  {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Agregar cuenta
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-yellow-500">
              Falta SOCIAL_TOKEN_ENCRYPTION_KEY (32 bytes en base64: openssl rand -base64 32). Configúrala en Vercel para agregar cuentas.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="account">Account</Label>
            <select
              id="account"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">— pick an account —</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} (@{a.username})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2" role="radiogroup" aria-label="post type">
            {(['image', 'reel'] as const).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={(t === 'reel') === isReel ? 'default' : 'outline'}
                disabled={t === 'image' && primaryTikTok}
                onClick={() => setPostType(t)}
              >
                {t === 'image' ? 'Image / carousel' : primaryTikTok ? 'Video' : 'Reel'}
              </Button>
            ))}
          </div>

          {isReel ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Video (MP4/MOV, 3 s–15 min, ≤ 300 MB, 9:16 recommended)</Label>
                {video ? (
                  <div className="flex gap-3 items-start">
                    <video src={video.mediaUrl} controls muted className="h-48 rounded border border-border" />
                    <div className="text-xs space-y-1">
                      <p>
                        {video.info.durationSeconds.toFixed(1)} s · {video.info.width}×{video.info.height} · {(video.info.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      </p>
                      {video.info.warnings.map((w) => (
                        <p key={w} className="text-yellow-500">{w}</p>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => setVideo(null)}>
                        <Trash2 className="h-3 w-3" /> remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label className="h-24 w-40 flex flex-col items-center justify-center border border-dashed border-border rounded cursor-pointer text-xs text-muted-foreground">
                    {busy === 'video' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                    {busy === 'video' ? 'uploading…' : 'add video'}
                    <input type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => onVideo(e.target.files?.[0])} />
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                  <Label>Cover image (optional)</Label>
                  {cover ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover.mediaUrl} alt="cover" className="h-24 w-16 object-cover rounded border border-border" />
                      <button type="button" className="absolute top-1 right-1 bg-black/70 rounded p-1" onClick={() => setCover(null)} aria-label="remove cover">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="h-24 w-16 flex flex-col items-center justify-center border border-dashed border-border rounded cursor-pointer text-xs text-muted-foreground">
                      {busy === 'cover' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
                    </label>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="thumb">Thumbnail at (seconds, if no cover)</Label>
                  <Input id="thumb" type="number" min={0} step={0.1} className="w-32" value={thumbSeconds} disabled={!!cover} onChange={(e) => setThumbSeconds(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={shareToFeed} onChange={(e) => setShareToFeed(e.target.checked)} /> Also share to feed
                </label>
              </div>
              {activeAccounts.filter((a) => a.id !== accountId).length ? (
                <div className="space-y-1">
                  <Label>Also post this video to</Label>
                  <div className="flex flex-wrap gap-4">
                    {activeAccounts
                      .filter((a) => a.id !== accountId)
                      .map((a) => (
                        <label key={a.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={alsoIds.includes(a.id)}
                            onChange={(e) => setAlsoIds((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((x) => x !== a.id)))}
                          />
                          {a.platform} · {a.label} (@{a.username})
                        </label>
                      ))}
                  </div>
                </div>
              ) : null}
              {hasTikTok ? (
                <div className="space-y-2 border border-border rounded p-3">
                  <p className="text-sm font-semibold">TikTok</p>
                  <div className="space-y-1">
                    <Label htmlFor="tt-privacy">Who can view</Label>
                    <select id="tt-privacy" className="bg-background border border-border rounded px-3 py-2 text-sm" value={ttPrivacy} onChange={(e) => setTtPrivacy(e.target.value)}>
                      {TIKTOK_PRIVACY.filter(([v]) => !ttOptions.length || ttOptions.includes(v)).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {(
                      [
                        ['disable_comment', 'Disable comments'],
                        ['disable_duet', 'Disable duet'],
                        ['disable_stitch', 'Disable stitch'],
                        ['is_aigc', 'AI-generated content'],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={ttFlags[k]} onChange={(e) => setTtFlags((cur) => ({ ...cur, [k]: e.target.checked }))} /> {label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Cover images are Instagram-only; TikTok uses the thumbnail time.</p>
                </div>
              ) : null}
            </div>
          ) : (
          <div className="space-y-2">
            <Label>Images (1 = single post, 2–10 = carousel)</Label>
            <div className="flex flex-wrap gap-2">
              {media.map((m, i) => (
                <div key={m.mediaPath} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.mediaUrl} alt={`upload ${i + 1}`} className="h-24 w-24 object-cover rounded border border-border" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-black/70 rounded p-1"
                    onClick={() => setMedia((all) => all.filter((x) => x.mediaPath !== m.mediaPath))}
                    aria-label="remove"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {media.length < 10 ? (
                <label className="h-24 w-24 flex flex-col items-center justify-center border border-dashed border-border rounded cursor-pointer text-xs text-muted-foreground">
                  {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  add
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
                </label>
              ) : null}
            </div>
          </div>
          )}

          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] items-end">
            <div className="space-y-1">
              <Label htmlFor="hint">Notes for AI caption (optional)</Label>
              <Input id="hint" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="what's this about?" />
            </div>
            <select
              className="bg-background border border-border rounded px-3 py-2 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'es')}
              aria-label="caption language"
            >
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
            <Button variant="outline" onClick={genCaption} disabled={busy !== null || !captionSource}>
              {busy === 'caption' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI caption
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="caption">Caption ({caption.length}/2200)</Label>
            <Textarea id="caption" rows={8} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <Button variant="outline" onClick={() => submit('draft')} disabled={busy !== null || !accountId || !hasMedia}>
              Save draft
            </Button>
            <div className="space-y-1">
              <Label htmlFor="when">Schedule for (your local time)</Label>
              <Input id="when" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => submit('schedule')} disabled={busy !== null || !accountId || !hasMedia || !scheduledAt}>
              Schedule
            </Button>
            <Button onClick={() => submit('now')} disabled={busy !== null || !accountId || !hasMedia || !caption.trim()}>
              {busy === 'now' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Publish now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posts</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts yet.</p> : null}
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id} className="flex gap-3 border-b border-border pb-3">
                <button
                  type="button"
                  onClick={() => setPreview(p)}
                  aria-label="Preview post"
                  className="shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {p.media_type === 'reel' && !p.cover_url ? (
                    <video src={p.media_urls[0]} muted preload="metadata" className="h-16 w-16 object-cover rounded" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.media_type === 'reel' ? p.cover_url! : p.media_urls[0]} alt="" className="h-16 w-16 object-cover rounded" />
                  )}
                </button>
                <div className="flex-1 min-w-0 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusColor[p.status]}>{p.status}</Badge>
                    {p.media_type === 'reel' ? <Badge className="bg-purple-600">reel</Badge> : null}
                    <span className="text-muted-foreground">{p.account?.label}</span>
                    {p.media_urls.length > 1 ? <span className="text-muted-foreground">{p.media_urls.length} images</span> : null}
                    {p.scheduled_at && p.status === 'scheduled' ? (
                      <span className="text-muted-foreground">→ {new Date(p.scheduled_at).toLocaleString()}</span>
                    ) : null}
                    {p.published_permalink ? (
                      <a href={p.published_permalink} target="_blank" rel="noreferrer" className="underline">
                        view
                      </a>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreview(p)}
                    className="block w-full truncate text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {p.caption || <em className="text-muted-foreground">no caption</em>}
                  </button>
                  {p.error ? <p className="text-red-500 text-xs">{p.error}</p> : null}
                </div>
                {['draft', 'scheduled', 'failed'].includes(p.status) ? (
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => publishExisting(p.id)}>
                      {p.status === 'failed' ? 'retry' : 'publish now'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => removePost(p.id)}>
                      delete
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <PostPreviewDialog key={preview?.id ?? 'none'} post={preview} statusClass={preview ? statusColor[preview.status] : ''} onClose={() => setPreview(null)} />
        </CardContent>
      </Card>
    </div>
  )
}

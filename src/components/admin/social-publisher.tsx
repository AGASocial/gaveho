'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { prepareInstagramJpeg } from '@/lib/social/image-upload'

type Account = {
  id: string
  platform: string
  api_host: 'instagram' | 'facebook'
  label: string
  username: string | null
  token_expires_at: string | null
  is_active: boolean
}
type Post = {
  id: string
  caption: string
  media_urls: string[]
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
  scheduled_at: string | null
  published_at: string | null
  published_permalink: string | null
  error: string | null
  created_at: string
  account: { label: string; username: string | null } | null
}
type Media = { mediaUrl: string; mediaPath: string }

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

export function SocialPublisher({ encryptionConfigured }: { encryptionConfigured: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newToken, setNewToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [media, setMedia] = useState<Media[]>([])
  const [caption, setCaption] = useState('')
  const [hint, setHint] = useState('')
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [scheduledAt, setScheduledAt] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const genCaption = () =>
    run('caption', async () => {
      if (!media[0]) throw new Error('Upload an image first.')
      const r = await json<{ caption: string }>(
        await fetch('/api/admin/social/caption', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mediaPath: media[0].mediaPath, hint, language }),
        })
      )
      setCaption(r.caption)
    })

  const submit = (mode: 'draft' | 'schedule' | 'now') =>
    run(mode, async () => {
      if (mode === 'now' && !confirm('Publish to Instagram now?')) return
      await json(
        await fetch('/api/admin/social/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accountId,
            caption,
            mediaUrls: media.map((m) => m.mediaUrl),
            mode,
            scheduledAt: mode === 'schedule' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          }),
        })
      )
      setMedia([])
      setCaption('')
      setHint('')
      setScheduledAt('')
      setMessage(mode === 'now' ? 'Published.' : mode === 'schedule' ? 'Scheduled.' : 'Draft saved.')
      await load()
    })

  const publishExisting = (id: string) =>
    run(`pub-${id}`, async () => {
      if (!confirm('Publish this post now?')) return
      await json(await fetch(`/api/admin/social/posts/${id}/publish`, { method: 'POST' }))
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
          body: JSON.stringify({ label: newLabel, token: newToken }),
        })
      )
      setNewToken('')
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
                  {a.api_host === 'facebook' ? 'graph.facebook.com' : 'graph.instagram.com'} · token expires{' '}
                  {a.token_expires_at ? new Date(a.token_expires_at).toLocaleDateString() : 'never / unknown'}
                </span>
                {!a.is_active ? <Badge className="bg-zinc-600">disabled</Badge> : null}
                <span className="ml-auto flex gap-2">
                  {a.api_host === 'instagram' && a.token_expires_at ? (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => refreshToken(a.id)}>
                      refresh token
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => toggleAccount(a)}>
                    {a.is_active ? 'disable' : 'enable'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => removeAccount(a)}>
                    remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {encryptionConfigured ? (
            <form onSubmit={addAccount} className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-semibold">Agregar cuenta</p>
              <p className="text-xs text-muted-foreground">
                Pega un token de acceso de Instagram (Meta → Instagram API → Generar tokens de acceso). Si la cuenta ya existe, se
                reemplaza su token.
              </p>
              <div className="grid gap-2 md:grid-cols-[200px_1fr_auto] items-end">
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
            <Button variant="outline" onClick={genCaption} disabled={busy !== null || !media.length}>
              {busy === 'caption' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI caption
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="caption">Caption ({caption.length}/2200)</Label>
            <Textarea id="caption" rows={8} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <Button variant="outline" onClick={() => submit('draft')} disabled={busy !== null || !accountId || !media.length}>
              Save draft
            </Button>
            <div className="space-y-1">
              <Label htmlFor="when">Schedule for (your local time)</Label>
              <Input id="when" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => submit('schedule')} disabled={busy !== null || !accountId || !media.length || !scheduledAt}>
              Schedule
            </Button>
            <Button onClick={() => submit('now')} disabled={busy !== null || !accountId || !media.length || !caption.trim()}>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.media_urls[0]} alt="" className="h-16 w-16 object-cover rounded" />
                <div className="flex-1 min-w-0 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusColor[p.status]}>{p.status}</Badge>
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
                  <p className="truncate">{p.caption || <em className="text-muted-foreground">no caption</em>}</p>
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
        </CardContent>
      </Card>
    </div>
  )
}

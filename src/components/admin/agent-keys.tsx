'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Copy, KeyRound } from 'lucide-react'

type Account = { id: string; label: string; username: string | null }
type AgentKey = {
  id: string
  name: string
  key_prefix: string
  allowed_account_ids: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  return data as T
}

/** Admin management of scoped agent API keys (/api/agent/social/*). */
export function AgentKeys() {
  const [keys, setKeys] = useState<AgentKey[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [created, setCreated] = useState<{ name: string; plaintext: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [k, a] = await Promise.all([
        fetch('/api/admin/social/agent-keys').then((r) => json<{ keys: AgentKey[] }>(r)),
        fetch('/api/admin/social/accounts').then((r) => json<{ accounts: Account[] }>(r)),
      ])
      setKeys(k.keys)
      setAccounts(a.accounts)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load API keys.')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load()
  }, [load])

  const accountName = (id: string) => {
    const a = accounts.find((x) => x.id === id)
    return a ? (a.username ? `@${a.username}` : a.label) : 'deleted account'
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const res = await json<{ key: AgentKey; plaintext: string }>(
        await fetch('/api/admin/social/agent-keys', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, accountIds: selected }),
        }),
      )
      setCreated({ name: res.key.name, plaintext: res.plaintext })
      setCopied(false)
      setName('')
      setSelected([])
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not create key.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(k: AgentKey) {
    if (!confirm(`Revoke "${k.name}" (${k.key_prefix}…)? Agents using it will get 401 immediately.`)) return
    setBusy(true)
    setMessage(null)
    try {
      await json(await fetch(`/api/admin/social/agent-keys?id=${encodeURIComponent(k.id)}`, { method: 'DELETE' }))
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not revoke key.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!created) return
    await navigator.clipboard.writeText(created.plaintext)
    setCopied(true)
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> Agent API keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p className="text-sm text-red-500">{message}</p> : null}
        {created ? (
          <div className="rounded-md border border-yellow-600 p-3 space-y-2 text-sm">
            <p>
              Key <strong>{created.name}</strong> created. Copy it now — it will not be shown again.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={created.plaintext} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={copy}>
                <Copy className="h-4 w-4 mr-1" /> {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}

        {keys.length === 0 ? <p className="text-sm text-muted-foreground">No API keys yet.</p> : null}
        <ul className="space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold">{k.name}</span>
              <code className="text-muted-foreground">{k.key_prefix}…</code>
              <span className="text-muted-foreground">{k.allowed_account_ids.map(accountName).join(', ') || 'no accounts'}</span>
              <span className="text-muted-foreground">last used {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}</span>
              {k.revoked_at ? <Badge className="bg-zinc-600">revoked</Badge> : <Badge className="bg-green-600">active</Badge>}
              {!k.revoked_at ? (
                <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => revoke(k)}>
                  revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        <form onSubmit={create} className="space-y-3 border-t pt-4">
          <div className="space-y-1">
            <Label htmlFor="agent-key-name">New key label</Label>
            <Input id="agent-key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. cadenza agent" maxLength={80} />
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Allowed accounts</legend>
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                />
                {a.label} {a.username ? <span className="text-muted-foreground">@{a.username}</span> : null}
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={busy || !name.trim() || selected.length === 0}>
            Create key
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AdminLoginForm() {
  const router = useRouter()
  const [pending, setPending] = useState<'password' | 'magic' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setPending('password')
    setError(null)
    const res = await fetch('/api/admin/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
    })
    setPending(null)
    if (!res.ok) return setError('Invalid credentials.')
    router.replace('/admin')
    router.refresh()
  }

  async function onMagic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setPending('magic')
    setError(null)
    const res = await fetch('/api/admin/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: data.get('email') }),
    })
    setPending(null)
    if (!res.ok) return setError('Could not send the link.')
    setSent(true)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onPassword} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" className="w-full" disabled={pending !== null}>
          {pending === 'password' ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="text-center text-xs text-muted-foreground">— or —</div>
      {sent ? (
        <p className="text-sm text-green-500">If that email is an admin, a sign-in link is on its way.</p>
      ) : (
        <form onSubmit={onMagic} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="magic-email">Email me a magic link</Label>
            <Input id="magic-email" name="email" type="email" autoComplete="email" required />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={pending !== null}>
            {pending === 'magic' ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      )}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  )
}

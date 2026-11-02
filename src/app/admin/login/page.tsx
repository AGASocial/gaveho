import { redirect } from 'next/navigation'
import { getActiveAdmin } from '@/lib/admin/auth'
import { AdminLoginForm } from '@/components/admin/login-form'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getActiveAdmin()) redirect('/admin')
  const { error } = await searchParams
  return (
    <main className="min-h-screen flex items-center justify-center p-4 font-mono">
      <section className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-xs text-muted-foreground">$ sudo gaveho admin</p>
          <h1 className="text-2xl font-bold mt-1">Admin login</h1>
        </div>
        {error ? <p className="text-sm text-red-500">Access denied. That account is not an active admin.</p> : null}
        <AdminLoginForm />
      </section>
    </main>
  )
}

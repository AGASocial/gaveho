import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getActiveAdmin } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await getActiveAdmin()
  if (!admin) redirect('/admin/login')
  return (
    <div className="min-h-screen font-mono">
      <header className="border-b border-border">
        <div className="container mx-auto max-w-6xl px-4 py-3 flex items-center gap-6 text-sm">
          <span className="text-green-500">~/admin</span>
          <nav className="flex gap-4">
            <Link href="/admin/ideas" className="hover:underline">ideas</Link>
            <Link href="/admin/social" className="hover:underline">social</Link>
          </nav>
          <span className="ml-auto text-muted-foreground">{admin.displayName}</span>
          <form action="/api/admin/auth/logout" method="post">
            <button type="submit" className="hover:underline text-muted-foreground">logout</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  )
}

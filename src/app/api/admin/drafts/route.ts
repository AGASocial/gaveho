import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/auth'
import { getDrafts } from '@/lib/drafts'

export async function GET() {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard

  try {
    const drafts = await getDrafts()
    return NextResponse.json({ drafts })
  } catch (err) {
    console.error('[admin/drafts] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

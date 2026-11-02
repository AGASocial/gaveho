import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { refreshAccountToken } from '@/lib/social/store'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  try {
    const result = await refreshAccountToken((await params).id)
    return NextResponse.json(result, { headers: noStoreHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refresh failed.'
    return NextResponse.json({ error: message }, { status: 502, headers: noStoreHeaders })
  }
}

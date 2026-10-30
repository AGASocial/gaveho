import { NextRequest, NextResponse } from 'next/server'
import { getAdminSecretFromRequest, isValidAdminSecret } from '@/lib/admin-auth'
import { getDrafts } from '@/lib/drafts'

export async function GET(req: NextRequest) {
  const secret = getAdminSecretFromRequest(req)
  if (!isValidAdminSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const drafts = await getDrafts()
    return NextResponse.json({ drafts })
  } catch (err) {
    console.error('[admin/drafts] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

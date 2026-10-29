import { NextRequest, NextResponse } from 'next/server'
import { getAdminSecretFromRequest, isValidAdminSecret, setAdminAuthCookie } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json()

    if (!secret || !isValidAdminSecret(secret)) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
    }

    await setAdminAuthCookie()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/login] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const secret = getAdminSecretFromRequest(req)

  return NextResponse.json({
    authenticated: isValidAdminSecret(secret),
  })
}

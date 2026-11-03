import { NextResponse } from 'next/server'
import { noStoreHeaders, requireAdminApi } from '@/lib/admin/auth'
import { queryCreatorInfo } from '@/lib/social/tiktok'
import { getTikTokAccessToken } from '@/lib/social/tiktok-store'

export const dynamic = 'force-dynamic'

// GET ?accountId= — the creator's current posting limits (privacy options, disabled interactions, max duration).
export async function GET(request: Request) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard
  const accountId = new URL(request.url).searchParams.get('accountId')
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 422, headers: noStoreHeaders })
  try {
    const { token } = await getTikTokAccessToken(accountId)
    return NextResponse.json({ creator: await queryCreatorInfo(token) }, { headers: noStoreHeaders })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load TikTok creator info.' }, { status: 502, headers: noStoreHeaders })
  }
}

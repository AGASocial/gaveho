import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'

/** Agent API auth: `Authorization: Bearer $SOCIAL_AGENT_API_KEY`. Returns a response on failure, else null. */
export function requireAgentApi(request: Request): NextResponse | null {
  const key = process.env.SOCIAL_AGENT_API_KEY
  if (!key) return NextResponse.json({ error: 'Agent API is not configured.' }, { status: 503, headers: noStoreHeaders })
  const header = request.headers.get('authorization') ?? ''
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Compare fixed-length digests so timing does not leak length or content.
  const a = createHash('sha256').update(supplied).digest()
  const b = createHash('sha256').update(key).digest()
  if (!supplied || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { ...noStoreHeaders, 'WWW-Authenticate': 'Bearer' } })
  }
  return null
}

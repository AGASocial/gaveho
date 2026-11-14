import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { AgentScope } from '@/lib/social/agent-keys'

/** Blog agent API: 60 requests per key per rolling hour (Upstash when configured). */
export const BLOG_AGENT_LIMIT = 60
export const BLOG_AGENT_WINDOW = '60 m' as const

let ratelimit: Ratelimit | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    ratelimit = new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(BLOG_AGENT_LIMIT, BLOG_AGENT_WINDOW),
      analytics: true,
      prefix: 'ratelimit:agent-blog',
    })
  }
} catch (err) {
  console.warn('[agent/blog] Rate limiting not configured:', err)
}

export type BlogRateLimitResult =
  | { ok: true; headers?: Record<string, string> }
  | { ok: false; status: 429; error: string; headers: Record<string, string> }

/** Rate-limit by agent key id (legacy env key shares one bucket). Gracefully no-ops without Upstash. */
export async function checkBlogAgentRateLimit(scope: AgentScope): Promise<BlogRateLimitResult> {
  if (!ratelimit) return { ok: true }
  const key = scope.keyId ?? 'legacy-social-env'
  const { success, limit, remaining, reset } = await ratelimit.limit(key)
  const headers = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  }
  if (!success) {
    return {
      ok: false,
      status: 429,
      error: 'Rate limit exceeded. Please try again later.',
      headers: { ...headers, 'Retry-After': String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) },
    }
  }
  return { ok: true, headers }
}

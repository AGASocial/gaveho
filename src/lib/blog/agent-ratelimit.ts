import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { AgentScope } from '@/lib/social/agent-keys'

/** Blog agent API: 60 requests per key per rolling hour (Upstash when configured, else in-memory). */
export const BLOG_AGENT_LIMIT = 60
export const BLOG_AGENT_WINDOW = '60 m' as const
export const BLOG_AGENT_WINDOW_MS = 60 * 60 * 1000

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
  console.warn('[agent/blog] Upstash rate limiting not configured:', err)
  ratelimit = null
}

/** In-memory sliding window timestamps per key (process-local fallback). */
const memoryBuckets = new Map<string, number[]>()

export type BlogRateLimitResult =
  | { ok: true; headers?: Record<string, string> }
  | { ok: false; status: 429; error: string; headers: Record<string, string> }

function rateHeaders(limit: number, remaining: number, reset: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  }
}

/** Sliding-window limiter used when Upstash is absent or errors. Exported for tests. */
export function checkMemoryBlogAgentRateLimit(key: string, now = Date.now()): BlogRateLimitResult {
  const windowStart = now - BLOG_AGENT_WINDOW_MS
  let stamps = (memoryBuckets.get(key) ?? []).filter((t) => t > windowStart)
  if (stamps.length >= BLOG_AGENT_LIMIT) {
    const oldest = stamps[0] ?? now
    const reset = oldest + BLOG_AGENT_WINDOW_MS
    const headers = {
      ...rateHeaders(BLOG_AGENT_LIMIT, 0, reset),
      'Retry-After': String(Math.max(1, Math.ceil((reset - now) / 1000))),
    }
    memoryBuckets.set(key, stamps)
    return {
      ok: false,
      status: 429,
      error: 'Rate limit exceeded. Please try again later.',
      headers,
    }
  }
  stamps = [...stamps, now]
  memoryBuckets.set(key, stamps)
  const reset = (stamps[0] ?? now) + BLOG_AGENT_WINDOW_MS
  return {
    ok: true,
    headers: rateHeaders(BLOG_AGENT_LIMIT, Math.max(0, BLOG_AGENT_LIMIT - stamps.length), reset),
  }
}

/** Test helper: clear in-memory buckets. */
export function resetMemoryBlogAgentRateLimit() {
  memoryBuckets.clear()
}

function rateLimitKey(scope: AgentScope): string {
  return scope.keyId ?? 'legacy-social-env'
}

/** Rate-limit by agent key id. Uses Upstash when configured; otherwise (or on Upstash error) in-memory. */
export async function checkBlogAgentRateLimit(scope: AgentScope): Promise<BlogRateLimitResult> {
  const key = rateLimitKey(scope)
  if (!ratelimit) return checkMemoryBlogAgentRateLimit(key)
  try {
    const { success, limit, remaining, reset } = await ratelimit.limit(key)
    const headers = rateHeaders(limit, remaining, reset)
    if (!success) {
      return {
        ok: false,
        status: 429,
        error: 'Rate limit exceeded. Please try again later.',
        headers: { ...headers, 'Retry-After': String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) },
      }
    }
    return { ok: true, headers }
  } catch (err) {
    console.warn('[agent/blog] Upstash rate limit failed; using in-memory fallback:', err)
    return checkMemoryBlogAgentRateLimit(key)
  }
}

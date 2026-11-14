import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOG_AGENT_LIMIT,
  BLOG_AGENT_WINDOW_MS,
  checkMemoryBlogAgentRateLimit,
  resetMemoryBlogAgentRateLimit,
} from './agent-ratelimit'

test('in-memory blog rate limit allows up to BLOG_AGENT_LIMIT then 429', () => {
  resetMemoryBlogAgentRateLimit()
  const key = 'test-key-memory'
  const t0 = Date.parse('2026-11-14T12:00:00Z')
  for (let i = 0; i < BLOG_AGENT_LIMIT; i++) {
    const r = checkMemoryBlogAgentRateLimit(key, t0 + i)
    assert.equal(r.ok, true, `request ${i + 1} should succeed`)
  }
  const blocked = checkMemoryBlogAgentRateLimit(key, t0 + BLOG_AGENT_LIMIT)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) {
    assert.equal(blocked.status, 429)
    assert.ok(blocked.headers['Retry-After'])
    assert.equal(blocked.headers['X-RateLimit-Remaining'], '0')
  }
})

test('in-memory blog rate limit slides after the window', () => {
  resetMemoryBlogAgentRateLimit()
  const key = 'test-key-slide'
  const t0 = Date.parse('2026-11-14T12:00:00Z')
  for (let i = 0; i < BLOG_AGENT_LIMIT; i++) {
    assert.equal(checkMemoryBlogAgentRateLimit(key, t0).ok, true)
  }
  assert.equal(checkMemoryBlogAgentRateLimit(key, t0 + 1).ok, false)
  assert.equal(checkMemoryBlogAgentRateLimit(key, t0 + BLOG_AGENT_WINDOW_MS + 1).ok, true)
})

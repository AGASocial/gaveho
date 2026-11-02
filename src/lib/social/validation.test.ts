import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCreatePost } from './validation'

const prefix = 'https://x.supabase.co/storage/v1/object/public/gaveho-social/'
const base = {
  accountId: '6f1c2b3a-1111-4222-8333-944455556666',
  caption: 'hello',
  mediaUrls: [prefix + 'posts/a.jpg'],
  mode: 'now',
}
const now = new Date('2026-11-02T12:00:00Z')

test('accepts a publish-now post', () => {
  assert.equal(parseCreatePost(base, prefix, now).ok, true)
})

test('rejects foreign media urls', () => {
  const r = parseCreatePost({ ...base, mediaUrls: ['https://evil.example/a.jpg'] }, prefix, now)
  assert.equal(r.ok, false)
})

test('requires future schedule time', () => {
  assert.equal(parseCreatePost({ ...base, mode: 'schedule', scheduledAt: '2026-11-01T00:00:00Z' }, prefix, now).ok, false)
  const r = parseCreatePost({ ...base, mode: 'schedule', scheduledAt: '2026-11-03T00:00:00Z' }, prefix, now)
  assert.ok(r.ok && r.value.scheduledAt === '2026-11-03T00:00:00.000Z')
})

test('draft allows empty caption but publish does not', () => {
  assert.equal(parseCreatePost({ ...base, caption: '', mode: 'draft' }, prefix, now).ok, true)
  assert.equal(parseCreatePost({ ...base, caption: '' }, prefix, now).ok, false)
})

test('rejects bad account id and too many images', () => {
  assert.equal(parseCreatePost({ ...base, accountId: 'nope' }, prefix, now).ok, false)
  assert.equal(parseCreatePost({ ...base, mediaUrls: Array(11).fill(prefix + 'a.jpg') }, prefix, now).ok, false)
})

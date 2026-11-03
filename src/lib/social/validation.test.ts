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

test('reels: one mp4/mov video, optional cover/thumb offset, share_to_feed default true', () => {
  const reel = { ...base, mediaType: 'reel', mediaUrls: [prefix + 'reels/2026/11/v.mp4'] }
  const ok = parseCreatePost(reel, prefix, now)
  assert.ok(ok.ok && ok.value.mediaType === 'reel' && ok.value.shareToFeed === true && ok.value.coverUrl === null)
  const full = parseCreatePost({ ...reel, coverUrl: prefix + 'posts/c.jpg', thumbOffset: 1500, shareToFeed: false }, prefix, now)
  assert.ok(full.ok && full.value.thumbOffset === 1500 && full.value.shareToFeed === false)
  assert.equal(parseCreatePost({ ...reel, mediaUrls: [prefix + 'a.mp4', prefix + 'b.mp4'] }, prefix, now).ok, false)
  assert.equal(parseCreatePost({ ...reel, mediaUrls: [prefix + 'posts/a.jpg'] }, prefix, now).ok, false)
  assert.equal(parseCreatePost({ ...reel, coverUrl: 'https://evil.example/c.jpg' }, prefix, now).ok, false)
  assert.equal(parseCreatePost({ ...reel, thumbOffset: -1 }, prefix, now).ok, false)
  assert.equal(parseCreatePost({ ...base, mediaUrls: [prefix + 'reels/v.mp4'] }, prefix, now).ok, false)
})

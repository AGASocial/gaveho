import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_UPLOADS_PER_HOUR, conflictingMediaSources, isOwnAgentUploadUrl, mediaUrlOf, orphanAgentObjects, referencedStoragePath, retryAfterSeconds, uploadRateLimit, uploadTooOld } from './agent-uploads'

const SB = 'https://abc.supabase.co'
const A = '11111111-2222-4333-8444-555555555555'
const F = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

test('uploadRateLimit allows up to 30 per hour, then 429', () => {
  assert.equal(AGENT_UPLOADS_PER_HOUR, 30)
  assert.deepEqual(uploadRateLimit(0), { ok: true, remaining: 29 })
  assert.deepEqual(uploadRateLimit(29), { ok: true, remaining: 0 })
  const r = uploadRateLimit(30)
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.retryAfterSeconds > 0)
  assert.equal(uploadRateLimit(99).ok, false)
})

test('isOwnAgentUploadUrl flags our bucket agent/ URLs in every route form', () => {
  for (const u of [
    `${SB}/storage/v1/object/public/gaveho-social/agent/${A}/${F}.mp4`,
    `${SB}/storage/v1/object/sign/gaveho-social/agent/${A}/${F}.jpg?token=x`,
    `${SB}/storage/v1/object/authenticated/gaveho-social/agent/${A}/${F}.jpg`,
    `${SB}/storage/v1/object/gaveho-social/agent/${A}/${F}.jpg`,
    `${SB}/storage/v1/render/image/public/gaveho-social/agent/${A}/${F}.jpg`,
    `https://ABC.supabase.co/storage/v1/object/public/gaveho-social/%61gent/${A}/${F}.mp4`,
    `${SB}//storage/v1/object/public/gaveho-social//agent/${A}/${F}.mp4`,
    `${SB}/storage/v1/object/public/gaveho-social/posts/../agent/${A}/${F}.mp4`,
  ]) assert.equal(isOwnAgentUploadUrl(u, SB), true, u)
})

test('isOwnAgentUploadUrl allows other paths, buckets and hosts', () => {
  for (const u of [
    `${SB}/storage/v1/object/public/gaveho-social/posts/2026/11/${F}.jpg`,
    `${SB}/storage/v1/object/public/other-bucket/agent/${A}/${F}.jpg`,
    `https://example.com/storage/v1/object/public/gaveho-social/agent/${A}/${F}.jpg`,
    'https://example.com/agent/x.jpg',
    'not a url',
    42,
  ]) assert.equal(isOwnAgentUploadUrl(u, SB), false, String(u))
  assert.equal(isOwnAgentUploadUrl(`${SB}/storage/v1/object/public/gaveho-social/agent/x`, undefined), false)
})

test('mediaUrlOf reads strings and { url }', () => {
  assert.equal(mediaUrlOf('https://x/y'), 'https://x/y')
  assert.equal(mediaUrlOf({ url: 'https://x/z' }), 'https://x/z')
  assert.equal(mediaUrlOf({ media_path: 'agent/a' }), undefined)
  assert.equal(mediaUrlOf(null), undefined)
})

test('conflictingMediaSources rejects more than one media source', () => {
  assert.equal(conflictingMediaSources({ images: ['https://x/a.jpg'] }, false), null)
  assert.equal(conflictingMediaSources({ media_path: 'agent/x' }, false), null)
  assert.equal(conflictingMediaSources({ images: [], image_url: 'https://x' }, false), null)
  assert.deepEqual(conflictingMediaSources({ images: ['a'], image_url: 'b' }, false), ['images', 'image_url'])
  assert.deepEqual(conflictingMediaSources({ image_url: 'b', media_path: 'agent/x' }, false), ['image_url', 'media_path'])
  assert.deepEqual(conflictingMediaSources({ video_url: 'b', media_path: 'agent/x' }, true), ['video_url', 'media_path'])
  assert.deepEqual(conflictingMediaSources({ video: { url: 'a' }, video_url: 'b' }, true), ['video', 'video_url'])
  assert.equal(conflictingMediaSources({ video_url: 'b', cover_url: 'c' }, true), null)
  assert.deepEqual(conflictingMediaSources({ video_url: 'b', cover_url: 'c', cover_media_path: 'agent/y' }, true), ['cover_url', 'cover_media_path'])
})

test('orphanAgentObjects keeps recent and referenced uploads', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  const old = '2026-11-02T10:00:00Z'
  const recent = '2026-11-03T11:00:00Z'
  const objects = [
    { path: `agent/${A}/old-unused.mp4`, createdAt: old },
    { path: `agent/${A}/old-used.mp4`, createdAt: old },
    { path: `agent/${A}/old-cover.jpg`, createdAt: old },
    { path: `agent/${A}/recent.mp4`, createdAt: recent },
    { path: `agent/${A}/no-date.mp4`, createdAt: null },
    { path: 'posts/2026/11/x.jpg', createdAt: old },
  ]
  const refs = [`${SB}/storage/v1/object/public/gaveho-social/agent/${A}/old-used.mp4`, `agent/${A}/old-cover.jpg`, `${SB}/storage/v1/object/public/gaveho-social/posts/2026/11/x.jpg`]
  assert.deepEqual(orphanAgentObjects(objects, refs, now), [`agent/${A}/old-unused.mp4`])
})

test('retry-after is computed from the oldest upload in the window', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  assert.equal(retryAfterSeconds('2026-11-03T11:10:00Z', now), 600)
  assert.equal(retryAfterSeconds('2026-11-03T11:00:00.500Z', now), 1)
  assert.equal(retryAfterSeconds('2026-11-03T10:00:00Z', now), 1)
  assert.equal(retryAfterSeconds(null, now), 3600)
  const r = uploadRateLimit(30, 30, '2026-11-03T11:30:00Z', now)
  assert.deepEqual(r, { ok: false, retryAfterSeconds: 1800 })
})

test('uploadTooOld refuses uploads older than 20 h', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  assert.equal(uploadTooOld('Mon, 02 Nov 2026 15:00:00 GMT', now), true)
  assert.equal(uploadTooOld('Mon, 02 Nov 2026 17:00:00 GMT', now), false)
  assert.equal(uploadTooOld(null, now), false)
})

test('referencedStoragePath decodes and extracts the path after /<bucket>/', () => {
  const P = `agent/${A}/${F}.mp4`
  assert.equal(referencedStoragePath(`${SB}/storage/v1/object/public/gaveho-social/${P}`), P)
  assert.equal(referencedStoragePath(`${SB}/storage/v1/object/public/gaveho-social/%61gent/${A}/${F}.mp4?v=1`), P)
  assert.equal(referencedStoragePath(`${SB}/storage/v1/object/public/gaveho-social//${P}`), P)
  assert.equal(referencedStoragePath(`https://cdn.example.com/x/agent/${A}/${F}.mp4`), null)
  assert.equal(referencedStoragePath(P), P)
  assert.equal(referencedStoragePath(''), null)
})

test('orphanAgentObjects honours percent-encoded references', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  const objects = [{ path: `agent/${A}/${F}.mp4`, createdAt: '2026-11-01T00:00:00Z' }]
  assert.deepEqual(orphanAgentObjects(objects, [`${SB}/storage/v1/object/public/gaveho-social/%61gent/${A}/${F}.mp4`], now), [])
  assert.deepEqual(orphanAgentObjects(objects, [], now), [`agent/${A}/${F}.mp4`])
})

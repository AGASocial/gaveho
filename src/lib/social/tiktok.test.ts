import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TikTokApiError, buildAuthorizeUrl, buildPostInfo, chunkPlan, chunkRanges, isTransientTikTokError, parseTikTokOptions, tiktokPermalink } from './tiktok'
import { parseCreatePost } from './validation'

const MB = 1024 * 1024
const creator = { creator_username: 'gaveho', privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'] as ('SELF_ONLY' | 'PUBLIC_TO_EVERYONE')[] }

test('chunkPlan: small files are one chunk; big files use 10 MB chunks with the remainder in the last', () => {
  assert.deepEqual(chunkPlan(3 * MB), { chunkSize: 3 * MB, totalChunkCount: 1 })
  assert.deepEqual(chunkPlan(10 * MB), { chunkSize: 10 * MB, totalChunkCount: 1 })
  const plan = chunkPlan(25 * MB)
  assert.deepEqual(plan, { chunkSize: 10 * MB, totalChunkCount: 2 })
  const ranges = chunkRanges(25 * MB, plan)
  assert.deepEqual(ranges, [{ start: 0, end: 10 * MB - 1 }, { start: 10 * MB, end: 25 * MB - 1 }])
  assert.throws(() => chunkPlan(0))
})

test('parseTikTokOptions accepts snake and camel case and rejects bad values', () => {
  assert.deepEqual(parseTikTokOptions(null), { ok: true, value: null })
  assert.deepEqual(parseTikTokOptions({ privacyLevel: 'SELF_ONLY', disable_comment: true, isAigc: true }), {
    ok: true,
    value: { privacy_level: 'SELF_ONLY', disable_comment: true, is_aigc: true },
  })
  assert.equal(parseTikTokOptions({ privacy_level: 'EVERYONE' }).ok, false)
  assert.equal(parseTikTokOptions({ disable_duet: 'yes' }).ok, false)
  assert.equal(parseTikTokOptions([]).ok, false)
})

test('buildPostInfo defaults to SELF_ONLY and honors creator restrictions', () => {
  const info = buildPostInfo({ caption: 'hola', options: null, creator: { ...creator, duet_disabled: true }, coverTimestampMs: 1500 })
  assert.equal(info.privacy_level, 'SELF_ONLY')
  assert.equal(info.disable_duet, true)
  assert.equal(info.video_cover_timestamp_ms, 1500)
  assert.throws(() => buildPostInfo({ caption: '', options: { privacy_level: 'FOLLOWER_OF_CREATOR' }, creator }), /not available/)
  assert.throws(() => buildPostInfo({ caption: '', options: { brand_content_toggle: true }, creator }), /Branded/)
})

test('authorize URL carries scopes, state and redirect uri', () => {
  const url = new URL(buildAuthorizeUrl({ clientKey: 'ck', redirectUri: 'https://gaveho.com/api/admin/social/tiktok/callback', state: 's1' }))
  assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/')
  assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.publish,video.upload')
  assert.equal(url.searchParams.get('state'), 's1')
  assert.equal(url.searchParams.get('response_type'), 'code')
})

test('permalink only with a username', () => {
  assert.equal(tiktokPermalink('gaveho', '123'), 'https://www.tiktok.com/@gaveho/video/123')
})

test('parseCreatePost keeps old payloads working and parses tiktok + alsoAccountIds', () => {
  const prefix = 'https://x.supabase.co/storage/v1/object/public/gaveho-social/'
  const base = { accountId: '11111111-1111-4111-8111-111111111111', caption: 'c', mode: 'draft', mediaType: 'reel', mediaUrls: [`${prefix}reels/a.mp4`] }
  const old = parseCreatePost(base, prefix)
  assert.ok(old.ok)
  if (old.ok) assert.deepEqual([old.value.tiktok, old.value.alsoAccountIds], [null, []])
  const both = parseCreatePost({ ...base, tiktok: { privacy_level: 'SELF_ONLY' }, alsoAccountIds: ['22222222-2222-4222-8222-222222222222', base.accountId] }, prefix)
  assert.ok(both.ok)
  if (both.ok) assert.deepEqual(both.value.alsoAccountIds, ['22222222-2222-4222-8222-222222222222'])
  assert.equal(parseCreatePost({ ...base, alsoAccountIds: ['nope'] }, prefix).ok, false)
})

test('buildPostInfo: rejects videos longer than the creator max duration', () => {
  const c = { ...creator, max_video_post_duration_sec: 60 }
  assert.throws(() => buildPostInfo({ caption: 'x', options: { privacy_level: 'SELF_ONLY', video_duration_sec: 75 }, creator: c }), /duration_too_long/)
  assert.doesNotThrow(() => buildPostInfo({ caption: 'x', options: { privacy_level: 'SELF_ONLY', video_duration_sec: 60.3 }, creator: c }))
  assert.doesNotThrow(() => buildPostInfo({ caption: 'x', options: { privacy_level: 'SELF_ONLY' }, creator: c }))
})

test('parseTikTokOptions: keeps a positive video_duration_sec', () => {
  const r = parseTikTokOptions({ video_duration_sec: 12.5 })
  assert.equal(r.ok && r.value?.video_duration_sec, 12.5)
})

test('isTransientTikTokError: network, 429 and 5xx are transient; API rejections are not', () => {
  assert.equal(isTransientTikTokError(new TypeError('fetch failed')), true)
  assert.equal(isTransientTikTokError(new TikTokApiError('rate_limit_exceeded', 'slow down', 429)), true)
  assert.equal(isTransientTikTokError(new TikTokApiError('internal_error', 'oops', 503)), true)
  assert.equal(isTransientTikTokError(new TikTokApiError('access_token_invalid', 'bad', 401)), false)
})

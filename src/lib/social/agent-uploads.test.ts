import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopeAllows } from './agent-keys'
import { agentUploadPrefix, checkAgentMediaPath, mediaPathOf, newAgentUploadPath, parseUploadRequest } from './agent-uploads'

const A = '11111111-2222-4333-8444-555555555555'
const B = '99999999-8888-4777-8666-555555555555'
const MB = 1024 * 1024

test('parseUploadRequest accepts JPEG/MP4/MOV within limits', () => {
  const r = parseUploadRequest({ account: 'cadenza.ops', filename: 'reel.mp4', content_type: 'video/mp4', size_bytes: 16 * MB })
  assert.ok(r.ok)
  assert.equal(r.ok && r.value.ext, 'mp4')
  assert.ok(parseUploadRequest({ account: 'x', filename: 'a.mov', content_type: 'video/quicktime', size_bytes: 300 * MB }).ok)
  assert.ok(parseUploadRequest({ account: 'x', filename: 'a.jpg', content_type: 'IMAGE/JPEG', size_bytes: 1000 }).ok)
})

test('parseUploadRequest rejects bad types, sizes and missing fields', () => {
  const bad = [
    null,
    { filename: 'a.mp4', content_type: 'video/mp4', size_bytes: 1 },
    { account: 'x', content_type: 'video/mp4', size_bytes: 1 },
    { account: 'x', filename: 'a.png', content_type: 'image/png', size_bytes: 1 },
    { account: 'x', filename: 'a.webm', content_type: 'video/webm', size_bytes: 1 },
    { account: 'x', filename: 'a.mp4', content_type: 'video/mp4', size_bytes: 300 * MB + 1 },
    { account: 'x', filename: 'a.jpg', content_type: 'image/jpeg', size_bytes: 25 * MB + 1 },
    { account: 'x', filename: 'a.mp4', content_type: 'video/mp4', size_bytes: 0 },
    { account: 'x', filename: 'a.mp4', content_type: 'video/mp4', size_bytes: 1.5 },
  ]
  for (const body of bad) assert.equal(parseUploadRequest(body).ok, false, JSON.stringify(body))
})

test('upload paths are server-chosen under agent/<account_id>/', () => {
  const p = newAgentUploadPath(A, 'mp4')
  assert.ok(p.startsWith(agentUploadPrefix(A)))
  assert.match(p, /^agent\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp4$/)
  assert.notEqual(newAgentUploadPath(A, 'mp4'), p)
  assert.throws(() => newAgentUploadPath('../etc', 'mp4'))
})

test('checkAgentMediaPath accepts own-account paths of the right kind', () => {
  const v = checkAgentMediaPath(newAgentUploadPath(A, 'mov'), A, 'video')
  assert.ok(v.ok && v.contentType === 'video/quicktime')
  const i = checkAgentMediaPath(newAgentUploadPath(A, 'jpg'), A.toUpperCase(), 'image')
  assert.ok(i.ok && i.contentType === 'image/jpeg')
})

test("checkAgentMediaPath rejects another account's uploads with 403", () => {
  const r = checkAgentMediaPath(newAgentUploadPath(B, 'mp4'), A, 'video')
  assert.deepEqual(r.ok ? null : r.status, 403)
})

test('checkAgentMediaPath rejects malformed, traversal and foreign-prefix paths with 422', () => {
  const own = newAgentUploadPath(A, 'mp4')
  for (const p of [
    '',
    42,
    `/${own}`,
    `${own}/x`,
    own.replace('.mp4', '.webm'),
    `agent/${A}/../${B}/${own.split('/')[2]}`,
    `reels/2026/11/${own.split('/')[2]}`,
    `posts/2026/11/${own.split('/')[2].replace('.mp4', '.jpg')}`,
    `agent/${A}/not-a-uuid.mp4`,
    `agent/${A}/sub/${own.split('/')[2]}`,
  ]) {
    const r = checkAgentMediaPath(p, A, 'video')
    assert.equal(r.ok ? 0 : r.status, 422, String(p))
  }
  // Wrong kind: an image path used as the reel video, a video used as an image.
  assert.equal(checkAgentMediaPath(newAgentUploadPath(A, 'jpg'), A, 'video').ok, false)
  assert.equal(checkAgentMediaPath(own, A, 'image').ok, false)
})

test('scope + prefix: a scoped key only reaches its own accounts', () => {
  const scoped = { keyId: 'k', accountIds: [A] }
  const legacy = { keyId: null, accountIds: null }
  assert.ok(scopeAllows(scoped, A))
  assert.ok(!scopeAllows(scoped, B))
  assert.ok(!scopeAllows({ keyId: 'k', accountIds: [] }, A))
  assert.ok(scopeAllows(legacy, B))
  // Even an all-accounts key can't attach account B's upload to a post for account A.
  const r = checkAgentMediaPath(newAgentUploadPath(B, 'mp4'), A, 'video')
  assert.equal(r.ok ? 0 : r.status, 403)
})

test('mediaPathOf reads media_path / mediaPath objects only', () => {
  assert.equal(mediaPathOf({ media_path: 'x' }), 'x')
  assert.equal(mediaPathOf({ mediaPath: 'y' }), 'y')
  assert.equal(mediaPathOf('https://example.com/a.jpg'), undefined)
  assert.equal(mediaPathOf({ url: 'https://example.com/a.jpg' }), undefined)
})

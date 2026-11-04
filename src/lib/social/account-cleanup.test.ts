import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deletableAccountAgentPaths } from './account-cleanup-paths'

const A = '11111111-2222-4333-8444-555555555555'
const B = '99999999-8888-4777-8666-555555555555'
const SB = 'https://abc.supabase.co'
const pub = (p: string) => `${SB}/storage/v1/object/public/gaveho-social/${p}`

test('keeps agent/<A>/ files still referenced by another account post (also_accounts)', () => {
  const files = [`agent/${A}/x.mp4`, `agent/${A}/y.jpg`]
  // Post owned by B that also publishes to A's media: media_urls still point at agent/<A>/x.mp4.
  const refs = [pub(`agent/${A}/x.mp4`)]
  assert.deepEqual(deletableAccountAgentPaths(A, files, refs), [`agent/${A}/y.jpg`])
})

test('keeps files referenced as cover_url or relative path', () => {
  const files = [`agent/${A}/c.jpg`, `agent/${A}/v.mp4`]
  assert.deepEqual(deletableAccountAgentPaths(A, files, [`agent/${A}/c.jpg`, pub(`agent/${A}/v.mp4`)]), [])
})

test('only touches the account prefix and normalizes the id case', () => {
  const files = [`agent/${A}/a.mp4`, `agent/${B}/b.mp4`, `posts/2026/11/z.jpg`, `agent/${A}/`]
  assert.deepEqual(deletableAccountAgentPaths(A.toUpperCase(), files, []), [`agent/${A}/a.mp4`])
})

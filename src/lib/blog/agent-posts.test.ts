import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOwnedByAgent, type BlogAgentPostRow } from './agent-posts'

const base = {
  id: '11111111-2222-4333-8444-555555555555',
  slug: 'x',
  title: 'T',
  excerpt: '',
  content: '',
  tags: [] as string[],
  language: 'es' as const,
  published: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

test('isOwnedByAgent requires matching non-null agent_key_id', () => {
  const owned: BlogAgentPostRow = { ...base, agent_key_id: 'key-a' }
  const human: BlogAgentPostRow = { ...base, agent_key_id: null }
  const missing: BlogAgentPostRow = { ...base }
  assert.equal(isOwnedByAgent(owned, 'key-a'), true)
  assert.equal(isOwnedByAgent(owned, 'key-b'), false)
  assert.equal(isOwnedByAgent(owned, null), false)
  assert.equal(isOwnedByAgent(human, 'key-a'), false)
  assert.equal(isOwnedByAgent(missing, 'key-a'), false)
})

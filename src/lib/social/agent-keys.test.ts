import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { agentKeyDisplayPrefix, bearerToken, generateAgentKey, hashAgentKey, looksLikeAgentKey, scopeAllows } from './agent-keys'

test('generates gsk_ keys with 32 random bytes, a display prefix and a SHA-256 hash', () => {
  const { key, prefix, hash } = generateAgentKey()
  assert.match(key, /^gsk_[A-Za-z0-9_-]{43}$/)
  assert.ok(looksLikeAgentKey(key))
  assert.equal(prefix, key.slice(0, 12))
  assert.equal(hash, createHash('sha256').update(key).digest('hex'))
  assert.ok(!hash.includes(key.slice(4)))
  assert.notEqual(generateAgentKey().key, key)
})

test('hash is deterministic and prefix is short', () => {
  assert.equal(hashAgentKey('gsk_x'), hashAgentKey('gsk_x'))
  assert.notEqual(hashAgentKey('gsk_x'), hashAgentKey('gsk_y'))
  assert.equal(agentKeyDisplayPrefix('gsk_abcdefghijklmnop'), 'gsk_abcdefgh')
})

test('rejects malformed keys', () => {
  assert.ok(!looksLikeAgentKey('gsk_short'))
  assert.ok(!looksLikeAgentKey('legacy-secret'))
  assert.ok(!looksLikeAgentKey(''))
})

test('scope checks', () => {
  assert.ok(scopeAllows({ keyId: null, accountIds: null }, 'any'))
  assert.ok(scopeAllows({ keyId: 'k', accountIds: ['a', 'b'] }, 'a'))
  assert.ok(!scopeAllows({ keyId: 'k', accountIds: ['a'] }, 'b'))
  assert.ok(!scopeAllows({ keyId: 'k', accountIds: [] }, 'a'))
})

test('parses bearer header', () => {
  assert.equal(bearerToken('Bearer abc'), 'abc')
  assert.equal(bearerToken('Basic abc'), '')
  assert.equal(bearerToken(null), '')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { decryptToken, encryptToken } from './crypto'

const key = randomBytes(32).toString('base64')

test('round-trips a token', () => {
  const enc = encryptToken('IGAAtoken123', key)
  assert.notEqual(enc, 'IGAAtoken123')
  assert.ok(!enc.includes('IGAAtoken123'))
  assert.equal(decryptToken(enc, key), 'IGAAtoken123')
})

test('uses a fresh IV each time', () => {
  assert.notEqual(encryptToken('same', key), encryptToken('same', key))
})

test('rejects tampering and wrong keys', () => {
  const enc = encryptToken('secret', key)
  const parts = enc.split('.')
  const ct = Buffer.from(parts[3], 'base64url')
  ct[0] ^= 1
  parts[3] = ct.toString('base64url')
  assert.throws(() => decryptToken(parts.join('.'), key))
  assert.throws(() => decryptToken(enc, randomBytes(32).toString('base64')))
})

test('rejects bad keys', () => {
  assert.throws(() => encryptToken('x', Buffer.from('short').toString('base64')))
  assert.throws(() => encryptToken('x', ''))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isUndefinedColumnError } from './supabase-errors'

test('isUndefinedColumnError detects Postgres 42703 and PostgREST PGRST204', () => {
  assert.equal(isUndefinedColumnError({ code: '42703', message: 'column "scopes" does not exist' }), true)
  assert.equal(isUndefinedColumnError({ code: 'PGRST204', message: "Could not find the 'scopes' column of 'gaveho_social_agent_keys' in the schema cache" }), true)
  assert.equal(isUndefinedColumnError({ code: '23505', message: 'duplicate' }), false)
  assert.equal(isUndefinedColumnError(null), false)
  assert.equal(isUndefinedColumnError({ message: 'column scopes does not exist' }), true)
})

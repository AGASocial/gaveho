import { createHash, randomBytes } from 'node:crypto'

/** Per-account agent API keys: `gsk_<43 chars base64url>` (32 random bytes). Only the SHA-256 hash is stored. */
export const AGENT_KEY_PREFIX = 'gsk_'
const KEY_RE = /^gsk_[A-Za-z0-9_-]{43}$/

/** Account scope of a request: `null` means every account (legacy env key). */
export type AgentScope = { keyId: string | null; accountIds: string[] | null }

export function generateAgentKey() {
  const key = AGENT_KEY_PREFIX + randomBytes(32).toString('base64url')
  return { key, prefix: agentKeyDisplayPrefix(key), hash: hashAgentKey(key) }
}

export const hashAgentKey = (key: string) => createHash('sha256').update(key).digest('hex')

/** First 8 chars after `gsk_`, for display (e.g. `gsk_AbCdEfGh`). */
export const agentKeyDisplayPrefix = (key: string) => key.slice(0, AGENT_KEY_PREFIX.length + 8)

export const looksLikeAgentKey = (value: string) => KEY_RE.test(value)

export const scopeAllows = (scope: AgentScope, accountId: string) => scope.accountIds === null || scope.accountIds.includes(accountId)

/** Parses `Authorization: Bearer <token>`; returns '' when absent. */
export function bearerToken(header: string | null) {
  const value = header ?? ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

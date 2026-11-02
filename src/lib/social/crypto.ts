import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM encryption at rest for social access tokens.
// SOCIAL_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded
// (generate with: openssl rand -base64 32). Format: v1.<iv>.<tag>.<ciphertext> (base64url).

const VERSION = 'v1'

function loadKey(raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.')
  return key
}

export function encryptToken(plain: string, rawKey?: string): string {
  const key = loadKey(rawKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.')
}

export function decryptToken(payload: string, rawKey?: string): string {
  const [version, iv, tag, ct] = payload.split('.')
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('Unsupported encrypted token format.')
  const decipher = createDecipheriv('aes-256-gcm', loadKey(rawKey), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
}

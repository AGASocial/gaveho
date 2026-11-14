import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fingerprintsMatch,
  makeSlug,
  MAX_CONTENT,
  parseCreateBlogPost,
  parsePatchBlogPost,
} from './validation'

test('makeSlug slugifies title and honors explicit slug', () => {
  assert.equal(makeSlug('Hola Mundo!'), 'hola-mundo')
  assert.equal(makeSlug('Ignored', 'Custom Slug'), 'custom-slug')
})

test('parseCreateBlogPost validates required fields and defaults', () => {
  const ok = parseCreateBlogPost({
    title: 'Mi post',
    content: 'Hola **mundo**',
  })
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  assert.equal(ok.value.slug, 'mi-post')
  assert.equal(ok.value.language, 'es')
  assert.equal(ok.value.mode, 'draft')
  assert.equal(ok.value.excerpt, '')
  assert.deepEqual(ok.value.tags, [])
})

test('parseCreateBlogPost rejects bad input and oversized content', () => {
  assert.equal(parseCreateBlogPost({}).ok, false)
  assert.equal(parseCreateBlogPost({ title: 'x' }).ok, false)
  assert.equal(parseCreateBlogPost({ title: 'x', content: 'y', mode: 'schedule' }).ok, false)
  assert.equal(parseCreateBlogPost({ title: 'x', content: 'y', language: 'fr' }).ok, false)
  assert.equal(parseCreateBlogPost({ title: 'x', content: 'y', cover_image: 'http://x.com/a.png' }).ok, false)
  assert.equal(parseCreateBlogPost({ title: 'x', content: 'y', cover_image: 'javascript:alert(1)' }).ok, false)
  assert.equal(parseCreateBlogPost({ title: 'x', content: 'y', sources: ['javascript:alert(1)'] }).ok, false)
  assert.equal(parseCreateBlogPost({ title: 'x', content: 'a'.repeat(MAX_CONTENT + 1) }).ok, false)
})

test('parseCreateBlogPost rejects when final content after Fuentes exceeds MAX_CONTENT', () => {
  // Content near the cap; Fuentes section pushes the final sanitized length over MAX_CONTENT.
  const almost = 'a'.repeat(MAX_CONTENT - 10)
  const over = parseCreateBlogPost({
    title: 'Post',
    content: almost,
    sources: ['https://example.com/very/long/path/that/adds/fuentes/overhead'],
  })
  assert.equal(over.ok, false)
  if (over.ok) return
  assert.match(over.error, /content must be ≤/)
})

test('parseCreateBlogPost sanitizes content and appends Fuentes', () => {
  const ok = parseCreateBlogPost({
    title: 'Post',
    content: 'Body <script>x</script>',
    sources: ['https://example.com/src'],
    tags: ['ai', 'ai', 'ops'],
    language: 'en',
    mode: 'publish_now',
    cover_image: 'https://cdn.example.com/cover.jpg',
  })
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  assert.ok(!ok.value.content.includes('<script>'))
  assert.ok(ok.value.content.includes('&lt;script>'))
  assert.match(ok.value.content, /## Fuentes/)
  assert.deepEqual(ok.value.tags, ['ai', 'ops'])
  assert.equal(ok.value.mode, 'publish_now')
  assert.equal(ok.value.language, 'en')
})

test('parseCreateBlogPost blocks adversarial XSS payloads in content/title/excerpt/sources', () => {
  const ok = parseCreateBlogPost({
    title: 'T {alert(1)} <img src=x>',
    excerpt: '<img\nsrc=x\nonerror=alert(1)>',
    content: `Body
<img
src=x
onerror=alert(1)>
{alert(1)}
[x][r]

[r]: javascript:alert(1)
`,
    sources: [{ title: '\n<script>alert(1)</script>', url: 'https://example.com/src' }],
  })
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  assert.ok(!ok.value.content.includes('<img'))
  assert.ok(ok.value.content.includes('&lt;img'))
  assert.ok(ok.value.content.includes('&#123;alert(1)&#125;'))
  assert.ok(!ok.value.content.includes('{alert(1)}'))
  assert.ok(!ok.value.content.includes('javascript:'))
  assert.match(ok.value.content, /\[r\]: #/)
  assert.ok(!ok.value.content.includes('<script>'))
  assert.ok(!ok.value.title.includes('{alert(1)}'))
  assert.ok(ok.value.title.includes('&#123;alert(1)&#125;'))
  assert.ok(!ok.value.excerpt.includes('<img'))
  assert.ok(ok.value.excerpt.includes('&lt;img'))
  assert.match(ok.value.content, /## Fuentes/)
})

test('idempotency fingerprint matches identical stored content', () => {
  const parsed = parseCreateBlogPost({ title: 'T', content: 'C', excerpt: 'E', tags: ['b', 'a'], language: 'es' })
  assert.ok(parsed.ok)
  if (!parsed.ok) return
  assert.ok(
    fingerprintsMatch(
      {
        title: parsed.value.title,
        content: parsed.value.content,
        excerpt: parsed.value.excerpt,
        tags: ['a', 'b'],
        cover_image: null,
        language: 'es',
      },
      parsed.value,
    ),
  )
  assert.ok(
    !fingerprintsMatch(
      {
        title: 'T',
        content: 'different',
        excerpt: 'E',
        tags: ['a', 'b'],
        cover_image: null,
        language: 'es',
      },
      parsed.value,
    ),
  )
})

test('parsePatchBlogPost accepts publish actions and draft updates', () => {
  assert.deepEqual(parsePatchBlogPost({ action: 'publish' }), { ok: true, value: { action: 'publish' } })
  assert.equal(parsePatchBlogPost({ mode: 'publish_now' }).ok, true)
  const upd = parsePatchBlogPost({ title: 'New', content: 'Hi <b>x</b>' })
  assert.equal(upd.ok, true)
  if (!upd.ok) return
  assert.equal(upd.value.action, 'update')
  assert.equal(upd.value.title, 'New')
  assert.ok(upd.value.content && !upd.value.content.includes('<b>'))
  assert.ok(upd.value.content && upd.value.content.includes('&lt;b>'))
  assert.equal(parsePatchBlogPost({}).ok, false)
})

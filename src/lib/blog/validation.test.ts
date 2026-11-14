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
  assert.match(ok.value.content, /## Fuentes/)
  assert.deepEqual(ok.value.tags, ['ai', 'ops'])
  assert.equal(ok.value.mode, 'publish_now')
  assert.equal(ok.value.language, 'en')
})

test('idempotency fingerprint matches identical stored content', () => {
  const parsed = parseCreateBlogPost({ title: 'T', content: 'C', excerpt: 'E', tags: ['b', 'a'], language: 'es' })
  assert.ok(parsed.ok)
  if (!parsed.ok) return
  assert.ok(
    fingerprintsMatch(
      {
        title: 'T',
        content: parsed.value.content,
        excerpt: 'E',
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
  assert.equal(parsePatchBlogPost({}).ok, false)
})

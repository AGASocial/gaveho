import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFuentesSection, isHttpsUrl, isSafeUrl, sanitizeMarkdown } from './sanitize'

test('isHttpsUrl accepts only absolute https without credentials', () => {
  assert.equal(isHttpsUrl('https://example.com/a.png'), true)
  assert.equal(isHttpsUrl('http://example.com/a.png'), false)
  assert.equal(isHttpsUrl('javascript:alert(1)'), false)
  assert.equal(isHttpsUrl('https://user:pass@example.com/x'), false)
  assert.equal(isHttpsUrl('/relative.png'), false)
})

test('isSafeUrl allows http(s), relative, mailto; rejects javascript/data', () => {
  assert.equal(isSafeUrl('https://x.com'), true)
  assert.equal(isSafeUrl('http://x.com'), true)
  assert.equal(isSafeUrl('/blog/x'), true)
  assert.equal(isSafeUrl('#frag'), true)
  assert.equal(isSafeUrl('mailto:hi@example.com'), true)
  assert.equal(isSafeUrl('javascript:alert(1)'), false)
  assert.equal(isSafeUrl('data:text/html,hi'), false)
})

test('sanitizeMarkdown strips HTML/script/JSX and neutralizes javascript: links', () => {
  const input = `# Hello
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<Evil />
{evil()}
[click](javascript:alert(1))
![x](javascript:alert(1))
Safe [link](https://example.com)

\`\`\`js
<script>kept</script>
{alsoKept}
\`\`\`
`
  const out = sanitizeMarkdown(input)
  const outside = out.split(/```[\s\S]*?```/)[0]
  assert.ok(!outside.includes('<script>'))
  assert.ok(!outside.includes('<img'))
  assert.ok(!outside.includes('<Evil'))
  assert.ok(!outside.includes('{evil()}'))
  assert.match(out, /\[click\]\(#\)/)
  assert.match(out, /!\[x\]\(#\)/)
  assert.match(out, /\[link\]\(https:\/\/example\.com\)/)
  assert.ok(out.includes('```js'))
  assert.ok(out.includes('<script>kept</script>'))
  assert.ok(out.includes('{alsoKept}'))
})

test('sanitizeMarkdown neutralizes reference-style link definitions', () => {
  const input = `See [bad][ref] and [ok][safe].

[ref]: javascript:alert(1)
[evil]: data:text/html,hi
[vbs]: vbscript:MsgBox(1)
[safe]: https://example.com/doc
[rel]: /blog/x
[frag]: #section
`
  const out = sanitizeMarkdown(input)
  assert.match(out, /\[ref\]: #/)
  assert.match(out, /\[evil\]: #/)
  assert.match(out, /\[vbs\]: #/)
  assert.match(out, /\[safe\]: https:\/\/example\.com\/doc/)
  assert.match(out, /\[rel\]: \/blog\/x/)
  assert.match(out, /\[frag\]: #section/)
  assert.ok(!out.includes('javascript:'))
  assert.ok(!out.includes('data:text/html'))
  assert.ok(!out.includes('vbscript:'))
})

test('sanitizeMarkdown neutralizes dangerous autolinks and keeps safe ones', () => {
  const input = `Visit <javascript:alert(1)> and <data:text/html,hi> and <vbscript:x> vs <https://example.com> and <mailto:hi@example.com>.`
  const out = sanitizeMarkdown(input)
  assert.ok(!out.includes('javascript:'))
  assert.ok(!out.includes('data:text/html'))
  assert.ok(!out.includes('vbscript:'))
  assert.ok(out.includes('<https://example.com>'))
  assert.ok(out.includes('<mailto:hi@example.com>'))
})

test('appendFuentesSection appends https sources once', () => {
  const withFuentes = appendFuentesSection('Body', [
    'https://a.example/1',
    { title: 'Doc', url: 'https://b.example/2' },
    'javascript:alert(1)',
    { title: 'bad', url: 'http://insecure.example' },
  ])
  assert.match(withFuentes, /## Fuentes/)
  assert.match(withFuentes, /\[https:\/\/a\.example\/1\]\(https:\/\/a\.example\/1\)/)
  assert.match(withFuentes, /\[Doc\]\(https:\/\/b\.example\/2\)/)
  assert.ok(!withFuentes.includes('javascript:'))
  assert.ok(!withFuentes.includes('http://insecure'))

  const again = appendFuentesSection('## Fuentes\n\n- already', [{ title: 'X', url: 'https://x.com' }])
  assert.equal(again, '## Fuentes\n\n- already')
})

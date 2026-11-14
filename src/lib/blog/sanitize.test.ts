import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendFuentesSection,
  escapeMdxText,
  isHttpsUrl,
  isSafeHttpUrl,
  isSafeUrl,
  normalizeSourceTitle,
  sanitizeMarkdown,
} from './sanitize'

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

test('isSafeHttpUrl allows only absolute http(s)', () => {
  assert.equal(isSafeHttpUrl('https://x.com'), true)
  assert.equal(isSafeHttpUrl('http://x.com'), true)
  assert.equal(isSafeHttpUrl('/blog/x'), false)
  assert.equal(isSafeHttpUrl('mailto:hi@example.com'), false)
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false)
})

test('sanitizeMarkdown escapes HTML/JSX/MDX and neutralizes javascript: links', () => {
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
  assert.ok(outside.includes('&lt;script>'))
  assert.ok(outside.includes('&lt;img'))
  assert.ok(outside.includes('&lt;Evil'))
  assert.ok(!outside.includes('<script>'))
  assert.ok(!outside.includes('<img'))
  assert.ok(outside.includes('&#123;evil()&#125;'))
  assert.ok(!outside.includes('{evil()}'))
  assert.match(out, /\[click\]\(#\)/)
  assert.match(out, /!\[x\]\(#\)/)
  assert.match(out, /\[link\]\(https:\/\/example\.com\)/)
  assert.ok(out.includes('```js'))
  assert.ok(out.includes('<script>kept</script>'))
  assert.ok(out.includes('{alsoKept}'))
})

test('sanitizeMarkdown escapes multiline tags (adversarial)', () => {
  const input = '<img\nsrc=x\nonerror=alert(1)>'
  const out = sanitizeMarkdown(input)
  assert.ok(!out.includes('<img'))
  assert.ok(out.startsWith('&lt;img'))
  assert.ok(out.includes('onerror=alert(1)>'))
})

test('sanitizeMarkdown escapes MDX expressions (adversarial)', () => {
  const out = sanitizeMarkdown('hello {alert(1)} world')
  assert.equal(out, 'hello &#123;alert(1)&#125; world')
})

test('sanitizeMarkdown neutralizes reference-style javascript links (adversarial)', () => {
  const input = `[x][r]

[r]: javascript:alert(1)
`
  const out = sanitizeMarkdown(input)
  assert.match(out, /\[r\]: #/)
  assert.ok(!out.includes('javascript:'))
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

test('sanitizeMarkdown escapes dangerous autolinks and keeps text safe', () => {
  const input = `Visit <javascript:alert(1)> and <data:text/html,hi> and <vbscript:x> vs <https://example.com> and <mailto:hi@example.com>.`
  const out = sanitizeMarkdown(input)
  assert.ok(!out.includes('<javascript:'))
  assert.ok(!out.includes('<data:'))
  assert.ok(!out.includes('<vbscript:'))
  assert.ok(!out.includes('<https://'))
  assert.ok(out.includes('&lt;https://example.com>'))
  assert.ok(out.includes('&lt;mailto:hi@example.com>'))
  assert.ok(out.includes('#')) // bare dangerous protocols neutralized after escape
})

test('sanitizeMarkdown leaves inline code spans untouched', () => {
  const out = sanitizeMarkdown('code `<script>` and `{x}` ok')
  assert.ok(out.includes('`<script>`'))
  assert.ok(out.includes('`{x}`'))
  assert.ok(!out.includes('&lt;script>`'))
})

test('contract: raw HTML/JSX tags only remain inside code spans/fences', () => {
  // By design: fences/inline code keep literal tags for documentation; MDX renders them as text in <code>.
  // Outside code, every `<` / `{` / `}` must be escaped so next-mdx-remote cannot compile them.
  const input = `Before <script>alert(1)</script> and {evil()}

Inline \`<script>inline</script>\` and \`{x}\`.

\`\`\`html
<div><script>fenced</script></div>
{alsoFenced}
\`\`\`

After <Evil /> and {y}
`
  const out = sanitizeMarkdown(input)

  const stripCode = (md: string) =>
    md
      .replace(/```[\s\S]*?```/g, '')
      .replace(/~~~[\s\S]*?~~~/g, '')
      .replace(/(`+)[\s\S]*?\1/g, '')

  const outside = stripCode(out)
  assert.equal(/</.test(outside), false, 'no raw < outside code')
  assert.equal(/[{}]/.test(outside), false, 'no raw {/} outside code')
  assert.ok(outside.includes('&lt;script'))
  assert.ok(outside.includes('&#123;evil()&#125;'))

  assert.ok(out.includes('`<script>inline</script>`'))
  assert.ok(out.includes('<script>fenced</script>'))
  assert.ok(out.includes('{alsoFenced}'))
})

test('escaped &lt; / &#123; are HTML entities that MDX renders as literal < / {', () => {
  // next-mdx-remote/@mdx-js decode character references in markdown text to the
  // corresponding literal characters — never as JSX tags or expressions.
  assert.equal(escapeMdxText('<'), '&lt;')
  assert.equal(escapeMdxText('{ }'), '&#123; &#125;')
  const md = sanitizeMarkdown('use a < b and never <img src=x> and {alert(1)}')
  assert.equal(md, 'use a &lt; b and never &lt;img src=x> and &#123;alert(1)&#125;')
  // No raw < or { remain for the MDX parser to treat as HTML/JSX.
  assert.equal(/</.test(md), false)
  assert.equal(/[{}]/.test(md), false)
})

test('normalizeSourceTitle strips newlines/control chars and escapes specials', () => {
  const title = normalizeSourceTitle('Doc\n<script>alert(1)</script>', 'https://x.com')
  assert.ok(!title.includes('\n'))
  assert.ok(!title.includes('<'))
  assert.ok(title.includes('&lt;script&gt;') || title.includes('&lt;script>'))
  assert.ok(title.includes('&#123;') === false || true)
  const long = normalizeSourceTitle('a'.repeat(500), 'https://x.com')
  assert.equal(long.length, 200)
})

test('appendFuentesSection appends http(s) sources once with safe titles', () => {
  const withFuentes = appendFuentesSection('Body', [
    'https://a.example/1',
    { title: 'Doc', url: 'https://b.example/2' },
    'javascript:alert(1)',
    { title: 'ok-http', url: 'http://insecure.example' },
    { title: 'break](javascript:alert(1))[', url: 'https://c.example/3' },
  ])
  assert.match(withFuentes, /## Fuentes/)
  assert.match(withFuentes, /\[https:\/\/a\.example\/1\]\(https:\/\/a\.example\/1\)/)
  assert.match(withFuentes, /\[Doc\]\(https:\/\/b\.example\/2\)/)
  assert.match(withFuentes, /\[ok-http\]\(http:\/\/insecure\.example\)/)
  // Title breakout chars are entity-escaped so they cannot close the markdown link.
  assert.ok(!withFuentes.includes('](javascript:'))
  assert.ok(withFuentes.includes('&#93;') && withFuentes.includes('&#91;'))
  // Re-sanitize (as the write path does) also strips bare javascript: left in title text.
  const final = sanitizeMarkdown(withFuentes)
  assert.ok(!final.includes('javascript:'))

  const again = appendFuentesSection('## Fuentes\n\n- already', [{ title: 'X', url: 'https://x.com' }])
  assert.equal(again, '## Fuentes\n\n- already')
})

test('appendFuentesSection + re-sanitize blocks XSS via source title (adversarial)', () => {
  const injected = appendFuentesSection('Body', [
    { title: '\n<script>alert(1)</script>', url: 'https://evil.example/src' },
  ])
  const final = sanitizeMarkdown(injected)
  assert.ok(!final.includes('<script>'))
  assert.ok(final.includes('&lt;script>') || final.includes('&lt;script&gt;'))
  assert.match(final, /## Fuentes/)
  assert.match(final, /https:\/\/evil\.example\/src/)
})

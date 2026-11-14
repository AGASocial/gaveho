/**
 * Sanitize markdown for safe rendering via next-mdx-remote (agent write path).
 * Outside fenced/inline code: escape `<` / `{` / `}` so raw HTML/JSX/MDX cannot compile.
 * Neutralize javascript:/data: URLs in markdown links and images.
 */

const DANGEROUS_PROTOCOLS = /^(javascript|vbscript|data):/i
const MAX_SOURCE_TITLE = 200
const MAX_SOURCES_APPEND = 20

/** True when a URL is safe for markdown links/images (https, http, relative, mailto, fragment). */
export function isSafeUrl(raw: string): boolean {
  const url = raw.trim()
  if (!url || url.startsWith('#')) return true
  if (url.startsWith('/') && !url.startsWith('//')) return true
  if (url.startsWith('mailto:')) {
    const rest = url.slice('mailto:'.length)
    return rest.length > 0 && !DANGEROUS_PROTOCOLS.test(rest) && !/[\s<>"]/.test(rest)
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/** Absolute http(s) only — for agent sources / Fuentes links. */
export function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim())
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && isSafeUrl(raw)
  } catch {
    return false
  }
}

/** Cover images and similar must be absolute https URLs (no credentials). */
export function isHttpsUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim())
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function neutralizeUrl(url: string): string {
  return isSafeUrl(url) ? url.trim() : '#'
}

/** Split markdown into alternating [outside, codeFence, outside, …] segments. */
function splitFencedCode(md: string): string[] {
  const parts: string[] = []
  const re = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    parts.push(md.slice(last, m.index))
    parts.push(m[0])
    last = m.index + m[0].length
  }
  parts.push(md.slice(last))
  return parts
}

/** Protect inline code spans (`…`, ``…``, …) so escaping does not touch them. */
function mapInlineCode(chunk: string, fn: (outside: string) => string): string {
  const parts: string[] = []
  const re = /(`+)([\s\S]*?)\1/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(chunk))) {
    parts.push(fn(chunk.slice(last, m.index)))
    parts.push(m[0])
    last = m.index + m[0].length
  }
  parts.push(fn(chunk.slice(last)))
  return parts.join('')
}

/** Escape MDX/HTML metacharacters so they render as literal text, never as JSX/HTML. */
export function escapeMdxText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
}

/**
 * Normalize a Fuentes source title: single line, no control chars, ≤200 chars,
 * markdown/HTML specials escaped so they cannot break out of `[title](url)`.
 */
export function normalizeSourceTitle(raw: string, fallbackUrl: string): string {
  let title = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title) title = fallbackUrl
  if (title.length > MAX_SOURCE_TITLE) title = title.slice(0, MAX_SOURCE_TITLE)
  return title
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/\(/g, '&#40;')
    .replace(/\)/g, '&#41;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\|/g, '&#124;')
    .replace(/`/g, '&#96;')
    .replace(/\*/g, '&#42;')
    .replace(/_/g, '&#95;')
    .replace(/!/g, '&#33;')
}

function sanitizeOutsideCode(chunk: string): string {
  return mapInlineCode(chunk, (outside) => {
    let s = outside
    // Reference-style link definitions: [ref]: url "title"
    s = s.replace(
      /(^|\n)([ \t]{0,3})\[([^\]]+)\]:[ \t]+<?([^\s>]+)>?([ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*(?=\n|$)/g,
      (_m, lead: string, indent: string, label: string, url: string, title?: string) =>
        `${lead}${indent}[${label}]: ${neutralizeUrl(url)}${title ?? ''}`,
    )
    // Markdown images ![alt](url "title")
    s = s.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      (_m, alt: string, url: string) => `![${escapeMdxText(alt)}](${neutralizeUrl(url)})`,
    )
    // Markdown links [text](url "title")
    s = s.replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      (_m, text: string, url: string) => `[${escapeMdxText(text)}](${neutralizeUrl(url)})`,
    )
    // Escape every remaining < / { / } (no tag-matching — defeats multiline tags).
    s = escapeMdxText(s)
    // Bare javascript: / data: URLs left in text
    s = s.replace(/\b(?:javascript|vbscript|data):[^\s)]+/gi, '#')
    return s
  })
}

/**
 * Escape executable HTML/JSX/MDX from markdown while preserving fenced + inline code.
 * Returns markdown safe for MDXRemote when no custom components inject HTML.
 */
export function sanitizeMarkdown(markdown: string): string {
  return splitFencedCode(markdown)
    .map((part, i) => (i % 2 === 1 ? part : sanitizeOutsideCode(part)))
    .join('')
}

export type SourceInput = string | { title?: unknown; url?: unknown }

/** Normalize sources and append a Fuentes section when any remain. */
export function appendFuentesSection(content: string, sources: SourceInput[]): string {
  const items: { title: string; url: string }[] = []
  for (const src of sources.slice(0, MAX_SOURCES_APPEND)) {
    if (typeof src === 'string') {
      if (!isSafeHttpUrl(src)) continue
      const url = src.trim()
      items.push({ title: normalizeSourceTitle(url, url), url })
      continue
    }
    if (!src || typeof src !== 'object') continue
    const url = typeof src.url === 'string' ? src.url.trim() : ''
    if (!isSafeHttpUrl(url)) continue
    const rawTitle = typeof src.title === 'string' ? src.title : ''
    items.push({ title: normalizeSourceTitle(rawTitle, url), url })
  }
  if (!items.length) return content
  if (/(^|\n)##\s+Fuentes\s*(\n|$)/i.test(content)) return content
  const lines = items.map((s) => `- [${s.title}](${s.url})`)
  return `${content.trimEnd()}\n\n## Fuentes\n\n${lines.join('\n')}\n`
}

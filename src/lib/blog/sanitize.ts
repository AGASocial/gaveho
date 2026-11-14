/**
 * Sanitize markdown for safe rendering via next-mdx-remote.
 * Strips raw HTML/JSX/MDX expressions outside fenced code blocks and rejects javascript: URLs.
 */

const DANGEROUS_PROTOCOLS = /^(javascript|vbscript|data):/i

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

function sanitizeOutsideCode(chunk: string): string {
  let s = chunk
  // HTML / JSX tags (including script/style and self-closing components).
  s = s.replace(/<\/?[A-Za-z][^>\n]*>/g, '')
  // MDX / JSX expressions `{...}` (not inside inline code handled below naively).
  s = s.replace(/\{[^}\n]*\}/g, '')
  // Markdown images ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, url: string) => `![${alt}](${neutralizeUrl(url)})`)
  // Markdown links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text: string, url: string) => `[${text}](${neutralizeUrl(url)})`)
  // Autolinks <https://…>
  s = s.replace(/<(https?:\/\/[^>\s]+)>/gi, (_m, url: string) => (isSafeUrl(url) ? `<${url}>` : ''))
  // Bare javascript: / data: URLs left in text
  s = s.replace(/\b(?:javascript|vbscript|data):[^\s)]+/gi, '#')
  return s
}

/**
 * Strip executable HTML/JSX/MDX from markdown while preserving fenced code blocks.
 * Does not execute anything; returns plain markdown safe for MDXRemote when no custom components inject HTML.
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
  for (const src of sources) {
    if (typeof src === 'string') {
      if (!isHttpsUrl(src)) continue
      items.push({ title: src, url: src.trim() })
      continue
    }
    if (!src || typeof src !== 'object') continue
    const url = typeof src.url === 'string' ? src.url.trim() : ''
    if (!isHttpsUrl(url)) continue
    const title = typeof src.title === 'string' && src.title.trim() ? src.title.trim() : url
    items.push({ title, url })
  }
  if (!items.length) return content
  if (/(^|\n)##\s+Fuentes\s*(\n|$)/i.test(content)) return content
  const lines = items.map((s) => `- [${s.title.replace(/[\[\]]/g, '')}](${s.url})`)
  return `${content.trimEnd()}\n\n## Fuentes\n\n${lines.join('\n')}\n`
}

import dns from 'node:dns'
import https from 'node:https'
import type { IncomingMessage } from 'node:http'
import net from 'node:net'

// SSRF-safe https download: https only, every resolved IP must be public (checked inside the socket's
// DNS lookup, so there is no resolve-then-connect race), redirects re-validated hop by hop, streaming
// size cap, content-type check and an overall timeout.

export class SafeFetchError extends Error {}

function ipv4Public(ip: string) {
  const [a, b, c] = ip.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127) return false // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
  if (a === 169 && b === 254) return false // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false // IETF protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false // benchmarking
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a >= 224) return false // multicast, reserved, broadcast
  return true
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Public(ip)
  if (!net.isIPv6(ip)) return false
  const h = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(h)
  if (mapped) return ipv4Public(mapped[1])
  if (h.startsWith('::')) return false // unspecified, loopback, hex-form IPv4-mapped/compatible
  if (/^f[cd]/.test(h)) return false // unique local
  if (/^fe[89ab]/.test(h)) return false // link-local
  if (/^fec|^fed|^fee|^fef/.test(h)) return false // site-local (deprecated)
  if (h.startsWith('ff')) return false // multicast
  if (h.startsWith('64:ff9b:')) return false // NAT64 can reach IPv4 private space
  if (h.startsWith('2001:db8:') || h.startsWith('2002:')) return false // documentation, 6to4
  return true
}

function blockedHostname(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  return net.isIP(h) !== 0 && !isPublicAddress(h) // IP literals skip DNS lookup, so check them here
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void

function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCb) {
  dns.lookup(hostname, { all: true, family: options.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err, '', 4)
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new SafeFetchError('URL resolves to a non-public address.'), { code: 'EBLOCKED' }), '', 4)
    }
    if (options.all) return callback(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

function get(url: URL, signal: AbortSignal) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = https.get(url, { lookup: safeLookup as never, signal, headers: { 'user-agent': 'gaveho-social/1.0', accept: '*/*' } }, resolve)
    req.on('error', reject)
  })
}

export type SafeDownloadOptions = {
  maxBytes: number
  timeoutMs: number
  label: string
  /** Called with the lowercased media type (no parameters); return false to reject. */
  acceptContentType: (contentType: string) => boolean
  maxRedirects?: number
}

/** Downloads a public https URL into memory with the guards above. Throws Error with a user-facing message. */
export async function safeDownload(rawUrl: string, opts: SafeDownloadOptions): Promise<{ bytes: Buffer; contentType: string }> {
  const { maxBytes, timeoutMs, label } = opts
  const tooBig = `${label} must be under ${Math.round(maxBytes / 1024 / 1024)} MB.`
  const notPublic = `${label} URLs must be public https URLs.`
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SafeFetchError(`Invalid ${label.toLowerCase()} URL.`)
  }
  const signal = AbortSignal.timeout(timeoutMs)
  for (let hop = 0; ; hop++) {
    if (url.protocol !== 'https:' || url.username || url.password || blockedHostname(url.hostname)) throw new SafeFetchError(notPublic)
    let res: IncomingMessage
    try {
      res = await get(url, signal)
    } catch (e) {
      if ((e as { code?: string }).code === 'EBLOCKED') throw new SafeFetchError(notPublic)
      if (signal.aborted) throw new SafeFetchError(`Timed out downloading the ${label.toLowerCase()}.`)
      throw new SafeFetchError(`Could not download ${label.toLowerCase()} (network error).`)
    }
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume()
      if (hop >= (opts.maxRedirects ?? 3)) throw new SafeFetchError(`Too many redirects for the ${label.toLowerCase()} URL.`)
      url = new URL(res.headers.location, url)
      continue
    }
    if (status < 200 || status >= 300) {
      res.resume()
      throw new SafeFetchError(`Could not download ${label.toLowerCase()} (${status}).`)
    }
    const contentType = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (!opts.acceptContentType(contentType)) {
      res.destroy()
      throw new SafeFetchError(`${label} URL returned an unsupported content type (${contentType || 'none'}).`)
    }
    if (Number(res.headers['content-length'] ?? 0) > maxBytes) {
      res.destroy()
      throw new SafeFetchError(tooBig)
    }
    const chunks: Buffer[] = []
    let size = 0
    try {
      for await (const chunk of res as AsyncIterable<Buffer>) {
        size += chunk.length
        if (size > maxBytes) {
          res.destroy()
          throw new SafeFetchError(tooBig)
        }
        chunks.push(chunk)
      }
    } catch (e) {
      if (e instanceof SafeFetchError) throw e
      throw new SafeFetchError(signal.aborted ? `Timed out downloading the ${label.toLowerCase()}.` : `Could not download ${label.toLowerCase()}.`)
    }
    return { bytes: Buffer.concat(chunks), contentType }
  }
}

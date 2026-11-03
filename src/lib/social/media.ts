import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase'
import { SOCIAL_BUCKET } from './store'
import { bufferReader, inspectVideo, MAX_VIDEO_BYTES, VideoError, type VideoInfo } from './video'

// Server-side storage + normalization for Instagram images (JPEG, ≤ 2160px, < 4 MB).
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const MAX_JPEG_BYTES = 4 * 1024 * 1024

export function isJpeg(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8
}

/** Stores an already-normalized JPEG in the public gaveho-social bucket. */
export async function storeJpeg(bytes: Buffer) {
  const now = new Date()
  const mediaPath = `posts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.jpg`
  const db = supabaseAdmin()
  const { error } = await db.storage.from(SOCIAL_BUCKET).upload(mediaPath, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (error) {
    console.error('[social/media] upload failed:', error.message)
    throw new Error('Upload failed.')
  }
  return { mediaPath, mediaUrl: db.storage.from(SOCIAL_BUCKET).getPublicUrl(mediaPath).data.publicUrl }
}

/** Same normalization as the admin browser upload: EXIF-rotated JPEG, max 2160px, under 4 MB. */
export async function normalizeToJpeg(input: Buffer) {
  if (input.length > MAX_SOURCE_BYTES) throw new Error('Image must be under 25 MB.')
  for (const [maxDim, quality] of [[2160, 90], [1800, 82], [1440, 76]] as const) {
    let out: Buffer
    try {
      out = await sharp(input, { limitInputPixels: 100_000_000 })
        .rotate()
        .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
    } catch {
      throw new Error('Could not read the image.')
    }
    if (out.length < MAX_JPEG_BYTES) return out
  }
  throw new Error('Image is still too large after optimizing.')
}

function isBlockedHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local') || isIP(h) !== 0
}

/** Downloads a public https image (no IP literals / local hosts), max 25 MB. */
export function downloadImage(rawUrl: string) {
  return downloadPublic(rawUrl, MAX_SOURCE_BYTES, 'Image', 15_000)
}

async function downloadPublic(rawUrl: string, maxBytes: number, label: string, timeoutMs: number) {
  const tooBig = `${label} must be under ${Math.round(maxBytes / 1024 / 1024)} MB.`
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid ${label.toLowerCase()} URL.`)
  }
  const notPublic = `${label} URLs must be public https URLs.`
  if (url.protocol !== 'https:' || isBlockedHost(url.hostname)) throw new Error(notPublic)
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' }).catch(() => null)
  if (!res?.ok || !res.body) throw new Error(`Could not download ${label.toLowerCase()} (${res?.status ?? 'network error'}).`)
  if (res.url && isBlockedHost(new URL(res.url).hostname)) throw new Error(notPublic)
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new Error(tooBig)
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error(tooBig)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export type ImageInput = string | { url?: unknown; data?: unknown; contentType?: unknown }

/** Accepts a public https URL or base64 ({data, contentType}); returns a stored, normalized JPEG. */
export async function ingestImage(image: ImageInput) {
  let source: Buffer
  if (typeof image === 'string') source = await downloadImage(image)
  else if (image && typeof image === 'object' && typeof image.url === 'string') source = await downloadImage(image.url)
  else if (image && typeof image === 'object' && typeof image.data === 'string') {
    if (typeof image.contentType === 'string' && !image.contentType.startsWith('image/')) throw new Error('contentType must be an image/* type.')
    const b64 = image.data.replace(/^data:[^;]+;base64,/, '')
    if (b64.length > Math.ceil((MAX_SOURCE_BYTES * 4) / 3)) throw new Error('Image must be under 25 MB.')
    source = Buffer.from(b64, 'base64')
    if (!source.length) throw new Error('Empty image data.')
  } else throw new Error('Each image must be an https URL or {data, contentType}.')
  return storeJpeg(await normalizeToJpeg(source))
}

export type VideoInput = string | { url?: unknown; data?: unknown; contentType?: unknown }

function datedPath(folder: string, ext: string) {
  const now = new Date()
  return `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`
}

/** New storage path for a reel video (admin direct upload). */
export const newVideoPath = (container: 'mp4' | 'mov') => datedPath('reels', container)
export const videoPathRe = /^reels\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(mp4|mov)$/

/** Accepts a public https URL or base64 ({data, contentType}); validates (no transcoding) and stores the video as-is. */
export async function ingestVideo(video: VideoInput): Promise<{ mediaUrl: string; mediaPath: string; info: VideoInfo }> {
  let source: Buffer
  if (typeof video === 'string') source = await downloadPublic(video, MAX_VIDEO_BYTES, 'Video', 120_000)
  else if (video && typeof video === 'object' && typeof video.url === 'string') source = await downloadPublic(video.url, MAX_VIDEO_BYTES, 'Video', 120_000)
  else if (video && typeof video === 'object' && typeof video.data === 'string') {
    if (typeof video.contentType === 'string' && !['video/mp4', 'video/quicktime'].includes(video.contentType)) {
      throw new Error('contentType must be video/mp4 or video/quicktime.')
    }
    source = Buffer.from(video.data.replace(/^data:[^;]+;base64,/, ''), 'base64')
    if (!source.length) throw new Error('Empty video data.')
  } else throw new Error('video must be an https URL or {data, contentType}.')
  let info: VideoInfo
  try {
    info = await inspectVideo(bufferReader(source))
  } catch (e) {
    throw new Error(e instanceof VideoError ? e.message : 'Could not read the video.')
  }
  const mediaPath = newVideoPath(info.container)
  const db = supabaseAdmin()
  const { error } = await db.storage.from(SOCIAL_BUCKET).upload(mediaPath, source, { contentType: info.contentType, cacheControl: '31536000', upsert: false })
  if (error) {
    console.error('[social/media] video upload failed:', error.message)
    throw new Error('Video upload failed.')
  }
  return { mediaPath, mediaUrl: db.storage.from(SOCIAL_BUCKET).getPublicUrl(mediaPath).data.publicUrl, info }
}

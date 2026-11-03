import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase'
import { uploadTooOld } from './agent-uploads'
import { safeDownload } from './safe-fetch'
import { SOCIAL_BUCKET } from './store'
import { bufferReader, httpReader, inspectVideo, MAX_VIDEO_BYTES, VideoError, type VideoInfo } from './video'

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

const imageTypeOk = (t: string) => t.startsWith('image/') || t === 'application/octet-stream'
const videoTypeOk = (t: string) => t === 'video/mp4' || t === 'video/quicktime' || t === 'application/octet-stream'

/** Downloads a public https image (SSRF-guarded, see safe-fetch.ts), max 25 MB. */
export async function downloadImage(rawUrl: string) {
  return (await safeDownload(rawUrl, { maxBytes: MAX_SOURCE_BYTES, timeoutMs: 15_000, label: 'Image', acceptContentType: imageTypeOk })).bytes
}

async function downloadVideo(rawUrl: string) {
  return (await safeDownload(rawUrl, { maxBytes: MAX_VIDEO_BYTES, timeoutMs: 120_000, label: 'Video', acceptContentType: videoTypeOk })).bytes
}

/** HEADs a stored object in the public bucket: size and content type, or null when missing. */
async function storedObject(path: string) {
  const url = supabaseAdmin().storage.from(SOCIAL_BUCKET).getPublicUrl(path).data.publicUrl
  const res = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null)
  if (!res?.ok) return null
  return {
    url,
    size: Number(res.headers.get('content-length') ?? 0),
    contentType: (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(),
    lastModified: res.headers.get('last-modified'),
  }
}

const notUploaded = 'media_path not found: PUT the file to the upload_url first.'
const tooOld = 'media_path is older than 20 hours and may be cleaned up; upload the file again.'

/**
 * Agent upload (checked with checkAgentMediaPath) → normalized JPEG stored under posts/.
 * The original under agent/ is NOT deleted here (retries, partial carousel failures and a path used
 * twice need it): call removeAgentOriginals() after the post is created.
 */
export async function ingestUploadedImage(check: { path: string; contentType: string }) {
  const obj = await storedObject(check.path)
  if (!obj) throw new Error(notUploaded)
  if (uploadTooOld(obj.lastModified)) throw new Error(tooOld)
  if (!obj.size) throw new Error('Uploaded image is empty.')
  if (obj.size > MAX_SOURCE_BYTES) throw new Error('Image must be under 25 MB.')
  if (obj.contentType !== check.contentType) throw new Error(`Uploaded image has content type ${obj.contentType || 'none'}; expected ${check.contentType}.`)
  const { data, error } = await supabaseAdmin().storage.from(SOCIAL_BUCKET).download(check.path)
  if (error || !data) throw new Error(notUploaded)
  return { ...(await storeJpeg(await normalizeToJpeg(Buffer.from(await data.arrayBuffer())))), sourcePath: check.path }
}

/** Best-effort delete of re-encoded agent/ originals once the post exists; the cleanup cron is the backstop. */
export async function removeAgentOriginals(paths: string[]) {
  const unique = [...new Set(paths.filter((p) => p.startsWith('agent/')))]
  if (!unique.length) return
  try {
    const { error } = await supabaseAdmin().storage.from(SOCIAL_BUCKET).remove(unique)
    if (error) console.error('[agent-uploads] could not delete original uploads:', error.message)
  } catch (e) {
    console.error('[agent-uploads] could not delete original uploads:', e instanceof Error ? e.message : e)
  }
}

/** Agent upload (checked with checkAgentMediaPath) → validated in place (Range reads), no copy. */
export async function ingestUploadedVideo(check: { path: string; contentType: string }): Promise<{ mediaUrl: string; mediaPath: string; info: VideoInfo }> {
  const obj = await storedObject(check.path)
  if (!obj) throw new Error(notUploaded)
  if (uploadTooOld(obj.lastModified)) throw new Error(tooOld)
  if (obj.size > MAX_VIDEO_BYTES) throw new Error('Video must be 300 MB or smaller.')
  if (obj.contentType !== check.contentType) throw new Error(`Uploaded video has content type ${obj.contentType || 'none'}; expected ${check.contentType}.`)
  let info: VideoInfo
  try {
    info = await inspectVideo(await httpReader(obj.url))
  } catch (e) {
    throw new Error(e instanceof VideoError ? e.message : 'Could not read the uploaded video.')
  }
  return { mediaPath: check.path, mediaUrl: obj.url, info }
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
  } else throw new Error('Each image must be an https URL, {data, contentType} or {media_path}.')
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
  if (typeof video === 'string') source = await downloadVideo(video)
  else if (video && typeof video === 'object' && typeof video.url === 'string') source = await downloadVideo(video.url)
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

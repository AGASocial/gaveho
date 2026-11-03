// Reel video validation without transcoding: reads the MP4/MOV box structure (ftyp, moov/mvhd,
// trak/tkhd/hdlr) to get container, duration and dimensions. Meta Reels specs: MP4/MOV,
// 3 s – 15 min, ≤ 300 MB, 9:16 recommended.

export const MAX_VIDEO_BYTES = 300 * 1024 * 1024
export const MIN_VIDEO_SECONDS = 3
export const MAX_VIDEO_SECONDS = 15 * 60
export const VIDEO_CONTENT_TYPES = { mp4: 'video/mp4', mov: 'video/quicktime' } as const
const MAX_MOOV_BYTES = 64 * 1024 * 1024

export class VideoError extends Error {}

export type VideoInfo = {
  container: 'mp4' | 'mov'
  contentType: (typeof VIDEO_CONTENT_TYPES)[keyof typeof VIDEO_CONTENT_TYPES]
  durationSeconds: number
  width: number | null
  height: number | null
  sizeBytes: number
  warnings: string[]
}

/** Random-access reader: a Buffer in memory or HTTP range requests. */
export type ByteReader = { size: number; read(offset: number, length: number): Promise<Uint8Array> }

export function bufferReader(buf: Uint8Array): ByteReader {
  return { size: buf.length, read: async (o, l) => buf.subarray(o, Math.min(buf.length, o + l)) }
}

/** Reads a public URL with Range requests (Supabase Storage supports them). */
export async function httpReader(url: string): Promise<ByteReader> {
  const head = await fetch(url, { method: 'HEAD', cache: 'no-store' })
  const size = Number(head.headers.get('content-length'))
  if (!head.ok || !size) throw new VideoError('Could not read the uploaded video.')
  return {
    size,
    async read(offset, length) {
      const end = Math.min(size, offset + length) - 1
      const res = await fetch(url, { headers: { range: `bytes=${offset}-${end}` }, cache: 'no-store' })
      if (!res.ok) throw new VideoError('Could not read the uploaded video.')
      const bytes = new Uint8Array(await res.arrayBuffer())
      // Server ignored the range: slice locally.
      return res.status === 206 ? bytes : bytes.subarray(offset, end + 1)
    },
  }
}

const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o)
const i32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getInt32(o)
const u64 = (b: Uint8Array, o: number) => Number(new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(o))
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])

type Box = { type: string; start: number; headerSize: number; size: number }

/** Iterates boxes in buf[from, to). */
function* boxes(buf: Uint8Array, from = 0, to = buf.length): Generator<Box> {
  let o = from
  while (o + 8 <= to) {
    let size = u32(buf, o)
    const type = fourcc(buf, o + 4)
    let headerSize = 8
    if (size === 1) {
      if (o + 16 > to) return
      size = u64(buf, o + 8)
      headerSize = 16
    } else if (size === 0) size = to - o
    if (size < headerSize || o + size > to) return
    yield { type, start: o, headerSize, size }
    o += size
  }
}

const child = (buf: Uint8Array, parent: Box, type: string) =>
  [...boxes(buf, parent.start + parent.headerSize, parent.start + parent.size)].find((b) => b.type === type)

function parseMoov(moov: Uint8Array) {
  const root: Box = { type: 'moov', start: 0, headerSize: 8, size: moov.length }
  const mvhd = child(moov, root, 'mvhd')
  if (!mvhd) throw new VideoError('Could not read the video duration (no mvhd).')
  const c = mvhd.start + mvhd.headerSize
  const v1 = moov[c] === 1
  const timescale = u32(moov, c + (v1 ? 20 : 12))
  const duration = v1 ? u64(moov, c + 24) : u32(moov, c + 16)
  if (!timescale) throw new VideoError('Could not read the video duration.')

  let width: number | null = null
  let height: number | null = null
  let hasVideo = false
  for (const trak of boxes(moov, root.headerSize, moov.length)) {
    if (trak.type !== 'trak') continue
    const mdia = child(moov, trak, 'mdia')
    const hdlr = mdia && child(moov, mdia, 'hdlr')
    if (!hdlr || fourcc(moov, hdlr.start + hdlr.headerSize + 8) !== 'vide') continue
    hasVideo = true
    const tkhd = child(moov, trak, 'tkhd')
    if (tkhd) {
      const t = tkhd.start + tkhd.headerSize
      const tv1 = moov[t] === 1
      const matrix = t + (tv1 ? 52 : 40)
      const w = u32(moov, t + (tv1 ? 88 : 76)) / 65536
      const h = u32(moov, t + (tv1 ? 92 : 80)) / 65536
      const rotated = i32(moov, matrix + 4) !== 0 // b != 0 → 90/270° rotation
      width = Math.round(rotated ? h : w)
      height = Math.round(rotated ? w : h)
    }
    break
  }
  if (!hasVideo) throw new VideoError('The file has no video track.')
  return { durationSeconds: duration / timescale, width, height }
}

/** Validates an MP4/MOV against Meta's Reels limits. Throws VideoError with a user-facing message. */
export async function inspectVideo(reader: ByteReader): Promise<VideoInfo> {
  if (reader.size > MAX_VIDEO_BYTES) throw new VideoError('Video must be 300 MB or smaller.')
  if (reader.size < 16) throw new VideoError('Video must be an MP4 or MOV file.')
  let container: 'mp4' | 'mov' | null = null
  let moov: Uint8Array | null = null
  let offset = 0
  for (let i = 0; i < 64 && offset + 8 <= reader.size; i++) {
    const head = await reader.read(offset, 16)
    let size = u32(head, 0)
    const type = fourcc(head, 4)
    if (!/^[\x20-\x7e]{4}$/.test(type)) break
    if (size === 1) size = u64(head, 8)
    else if (size === 0) size = reader.size - offset
    if (size < 8) break
    if (i === 0 && type === 'ftyp') {
      const ftyp = await reader.read(offset, Math.min(size, 256))
      const brands = [fourcc(ftyp, 8), ...Array.from({ length: Math.max(0, (ftyp.length - 16) / 4) }, (_, k) => fourcc(ftyp, 16 + k * 4))]
      container = brands[0] === 'qt  ' ? 'mov' : 'mp4'
      if (!brands.some((b) => /^(isom|iso\d|mp4\d|mp41|mp42|avc1|qt  |M4V |M4VP|MSNV|dash|3gp\d)$/.test(b))) {
        throw new VideoError('Video must be an MP4 or MOV file.')
      }
    } else if (i === 0 && ['moov', 'mdat', 'wide', 'free', 'skip'].includes(type)) {
      container = 'mov' // legacy QuickTime without ftyp
    } else if (i === 0) {
      throw new VideoError('Video must be an MP4 or MOV file (other formats are not transcoded).')
    }
    if (type === 'moov') {
      if (size > MAX_MOOV_BYTES) throw new VideoError('Video metadata is too large to read.')
      moov = await reader.read(offset, size)
      break
    }
    offset += size
  }
  if (!container) throw new VideoError('Video must be an MP4 or MOV file.')
  if (!moov) throw new VideoError('Could not read the video metadata (moov box missing or file truncated).')
  const { durationSeconds, width, height } = parseMoov(moov)
  if (durationSeconds < MIN_VIDEO_SECONDS) throw new VideoError(`Reels must be at least ${MIN_VIDEO_SECONDS} seconds (got ${durationSeconds.toFixed(1)} s).`)
  if (durationSeconds > MAX_VIDEO_SECONDS) throw new VideoError(`Reels must be 15 minutes or shorter (got ${Math.round(durationSeconds)} s).`)
  const warnings: string[] = []
  if (width && height && Math.abs(width / height - 9 / 16) > 0.02) {
    warnings.push(`Aspect ratio is ${width}x${height}; 9:16 (e.g. 1080x1920) is recommended for Reels.`)
  }
  return { container, contentType: VIDEO_CONTENT_TYPES[container], durationSeconds, width, height, sizeBytes: reader.size, warnings }
}

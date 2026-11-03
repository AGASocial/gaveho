import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bufferReader, inspectVideo } from './video'

function box(type: string, ...payload: Uint8Array[]) {
  const body = Buffer.concat(payload)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length + 8)
  head.write(type, 4, 'latin1')
  return Buffer.concat([head, body])
}
function mvhd(seconds: number, timescale = 1000) {
  const b = Buffer.alloc(100)
  b.writeUInt32BE(timescale, 12)
  b.writeUInt32BE(Math.round(seconds * timescale), 16)
  return box('mvhd', b)
}
function trak(width: number, height: number, handler = 'vide') {
  const tkhd = Buffer.alloc(84)
  tkhd.writeUInt32BE(width * 65536, 76)
  tkhd.writeUInt32BE(height * 65536, 80)
  const hdlr = Buffer.alloc(24)
  hdlr.write(handler, 8, 'latin1')
  return box('trak', box('tkhd', tkhd), box('mdia', box('hdlr', hdlr)))
}
const ftyp = (brand = 'isom') => box('ftyp', Buffer.from(`${brand}\0\0\0\0isommp41`, 'latin1'))
const video = (seconds: number, w = 1080, h = 1920, brand = 'isom', moovFirst = true) => {
  const moov = box('moov', mvhd(seconds), trak(w, h))
  const mdat = box('mdat', Buffer.alloc(32))
  return moovFirst ? Buffer.concat([ftyp(brand), moov, mdat]) : Buffer.concat([ftyp(brand), mdat, moov])
}

test('accepts a 9:16 mp4 and reads duration/dimensions', async () => {
  const info = await inspectVideo(bufferReader(video(12.5)))
  assert.equal(info.container, 'mp4')
  assert.equal(info.contentType, 'video/mp4')
  assert.equal(info.durationSeconds, 12.5)
  assert.deepEqual([info.width, info.height], [1080, 1920])
  assert.deepEqual(info.warnings, [])
})

test('detects mov and moov at the end; warns on non 9:16', async () => {
  const info = await inspectVideo(bufferReader(video(30, 1920, 1080, 'qt  ', false)))
  assert.equal(info.container, 'mov')
  assert.equal(info.warnings.length, 1)
})

test('rejects too short, too long and non-video files', async () => {
  await assert.rejects(inspectVideo(bufferReader(video(2))), /at least 3 seconds/)
  await assert.rejects(inspectVideo(bufferReader(video(16 * 60))), /15 minutes/)
  await assert.rejects(inspectVideo(bufferReader(Buffer.from('GIF89a................'))), /MP4 or MOV/)
  const audioOnly = Buffer.concat([ftyp(), box('moov', mvhd(10), trak(0, 0, 'soun'))])
  await assert.rejects(inspectVideo(bufferReader(audioOnly)), /no video track/)
})

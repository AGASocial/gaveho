import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPublicAddress, safeDownload } from './safe-fetch'

test('isPublicAddress blocks private, loopback, link-local and reserved ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a00:1', 'not-an-ip']) {
    assert.equal(isPublicAddress(ip), false, ip)
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPublicAddress(ip), true, ip)
})

const opts = { maxBytes: 1024, timeoutMs: 2000, label: 'Video', acceptContentType: () => true }

test('safeDownload rejects non-https and private targets before any request', async () => {
  for (const url of ['http://example.com/a.mp4', 'https://127.0.0.1/a.mp4', 'https://[::1]/a.mp4', 'https://169.254.169.254/latest', 'https://localhost/a.mp4', 'https://user:pw@example.com/a.mp4', 'file:///etc/passwd', 'nope']) {
    await assert.rejects(safeDownload(url, opts), /public https|Invalid/, url)
  }
})

test('safeDownload rejects hostnames that resolve to loopback (checked after DNS)', async () => {
  // "localhost." (trailing dot) passes the hostname check but resolves to 127.0.0.1 via the hosts file,
  // so it is blocked by the post-DNS address check.
  await assert.rejects(safeDownload('https://localhost./a.mp4', opts), /public https/)
})

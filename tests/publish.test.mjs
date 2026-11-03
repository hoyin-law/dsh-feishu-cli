import test from 'node:test'
import assert from 'node:assert/strict'

import { postGuard } from '../lib/api.js'
import {
  CLI_VERSION,
  assetForPlatform,
  cachedCliPath,
  downloadUrls,
  getInstallStatus,
  installRoot,
} from '../lib/install.js'
import { stripUndefined } from '../index.js'

test('package manifest declares a DSH bundle and a client half', async () => {
  const fs = await import('node:fs/promises')
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.private, false)
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.exports['./client'])
  assert.ok(pkg.exports['./icon'])
  assert.ok(pkg.files.includes('lib/install.js'))
  assert.ok(pkg.engines.dsh)
})

test('postGuard accepts JSON without Origin (Electron) and rejects cross-site', () => {
  const base = { 'content-type': 'application/json', host: '127.0.0.1:58942' }
  assert.equal(postGuard({ headers: base }), null)
  assert.equal(postGuard({ headers: { ...base, origin: 'null' } }), null)
  assert.equal(postGuard({ headers: { ...base, origin: 'http://127.0.0.1:58942' } }), null)
  assert.equal(postGuard({ headers: { ...base, origin: 'http://localhost:58942' } }), null)
  assert.match(postGuard({ headers: { ...base, origin: 'https://evil.example' } }) ?? '', /跨站/)
  assert.match(postGuard({ headers: { ...base, 'content-type': 'text/plain' } }) ?? '', /application\/json/)
})

test('installer knows every supported platform asset', () => {
  for (const [platform, arch] of [
    ['win32', 'x64'],
    ['win32', 'arm64'],
    ['darwin', 'x64'],
    ['darwin', 'arm64'],
    ['linux', 'x64'],
    ['linux', 'arm64'],
    ['linux', 'riscv64'],
  ]) {
    const asset = assetForPlatform(platform, arch)
    assert.ok(asset, `${platform}/${arch}`)
    assert.equal(asset.file.includes(CLI_VERSION), true)
    assert.match(asset.sha256, /^[a-f0-9]{64}$/)
  }
  assert.equal(assetForPlatform('aix', 'ppc64'), null)
})

test('downloadUrls uses mirror first and GitHub as fallback', () => {
  const asset = assetForPlatform('win32', 'x64')
  const urls = downloadUrls(asset)
  assert.equal(urls.length, 2)
  assert.match(urls[0], /registry\.npmmirror\.com/)
  assert.match(urls[1], /github\.com\/larksuite\/cli\/releases/)
})

test('install paths are derived from DSH_HOME', async () => {
  const { join } = await import('node:path')
  const previous = process.env.DSH_HOME
  const fakeHome = join('tmp', 'dsh-home')
  process.env.DSH_HOME = fakeHome
  try {
    assert.equal(installRoot(), join(fakeHome, 'feishu-cli'))
    assert.equal(
      cachedCliPath(),
      join(fakeHome, 'feishu-cli', 'bin', process.platform === 'win32' ? 'lark-cli.exe' : 'lark-cli'),
    )
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

test('getInstallStatus never leaks internal mutable state', () => {
  const first = getInstallStatus()
  first.state = 'mutated'
  assert.notEqual(getInstallStatus().state, 'mutated')
})

test('stripUndefined removes undefined recursively but keeps other falsy values', () => {
  const input = {
    a: undefined,
    b: null,
    c: 0,
    d: '',
    e: [1, undefined, { f: undefined, g: 2 }],
  }
  assert.deepEqual(stripUndefined(input), {
    b: null,
    c: 0,
    d: '',
    e: [1, { g: 2 }],
  })
})

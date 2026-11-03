/**
 * dsh-feishu-cli — 飞书官方 CLI 的按平台下载与安装。
 *
 * 插件不再随包分发 50MB 二进制，而是在首次需要时从镜像下载当前平台的
 * `lark-cli` 发布包，校验 SHA-256 后解压安装到：
 *
 *   $DSH_HOME/feishu-cli/bin/lark-cli(.exe)
 *
 * 默认 $DSH_HOME = ~/.dsh。可通过 FEISHU_CLI_HOME 覆盖安装根目录。
 * 下载地址按顺序尝试：npmmirror 二进制镜像 → GitHub Releases。
 *
 * 只使用 node: 内置模块；不依赖任何第三方包。
 *
 * @module dsh-feishu-cli/install
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

/** 固定使用的 lark-cli 版本（与内置/文档一致）。 */
export const CLI_VERSION = '1.0.98'

/** 各平台发布包与 SHA-256（来自 @larksuite/cli 1.0.98 的 checksums.txt）。 */
const ASSETS = {
  'win32-x64': {
    file: `lark-cli-${CLI_VERSION}-windows-amd64.zip`,
    sha256: 'b13a5d710f9afe327b34bfe68c4a736a574d4d97274f6da862e912dfada1ccdc',
  },
  'win32-arm64': {
    file: `lark-cli-${CLI_VERSION}-windows-arm64.zip`,
    sha256: '6a111ccfed1f89eca95fbf7a9ef0ae941b9017409a864bf6cd93becc430dc810',
  },
  'darwin-x64': {
    file: `lark-cli-${CLI_VERSION}-darwin-amd64.tar.gz`,
    sha256: '44a4ff98e969385fc4bb4d701735ba319307e50560fa6c4c956178d70ccc3525',
  },
  'darwin-arm64': {
    file: `lark-cli-${CLI_VERSION}-darwin-arm64.tar.gz`,
    sha256: 'ee4a3209bbf8b74ea5c00a07d0da89b79f5e7f6abfd518a8b2d78a7a4f7e3f40',
  },
  'linux-x64': {
    file: `lark-cli-${CLI_VERSION}-linux-amd64.tar.gz`,
    sha256: '4a12dcb7a0aab25986d8bcd046cb45b08278531a9aac3a12b53cf3d94738fe80',
  },
  'linux-arm64': {
    file: `lark-cli-${CLI_VERSION}-linux-arm64.tar.gz`,
    sha256: 'f798b26ce4b369d70411945e7f66bbe4382c411bc47d81950a662de7b69b41ed',
  },
  'linux-riscv64': {
    file: `lark-cli-${CLI_VERSION}-linux-riscv64.tar.gz`,
    sha256: '068d5618ba8d42c129bd382a7374e5502263f358066391155d1af4508c238579',
  },
}

const isWindows = process.platform === 'win32'
const EXE_NAME = isWindows ? 'lark-cli.exe' : 'lark-cli'
const MIRROR_BASE = 'https://registry.npmmirror.com/-/binary/lark-cli'
const GITHUB_BASE = 'https://github.com/larksuite/cli/releases/download'

/** 安装根目录（可用 FEISHU_CLI_HOME 覆盖，便于测试/企业部署）。 */
export function installRoot() {
  const override = String(process.env.FEISHU_CLI_HOME ?? '').trim()
  if (override) return override
  const dshHome = String(process.env.DSH_HOME ?? '').trim() || join(homedir(), '.dsh')
  return join(dshHome, 'feishu-cli')
}

/** 安装后的可执行文件绝对路径（不保证存在）。 */
export function cachedCliPath() {
  return join(installRoot(), 'bin', EXE_NAME)
}

/** 当前平台对应的发布包信息；不支持的平台返回 null。 */
export function assetForPlatform(platform = process.platform, arch = process.arch) {
  return ASSETS[`${platform}-${arch}`] ?? null
}

/** 下载候选 URL（镜像优先，GitHub 兜底）。 */
export function downloadUrls(asset, version = CLI_VERSION) {
  const mirror = `${MIRROR_BASE}/v${version}/${asset.file}`
  const github = `${GITHUB_BASE}/v${version}/${asset.file}`
  const overrides = String(process.env.FEISHU_CLI_DOWNLOAD_BASE ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((base) => `${base.replace(/\/+$/, '')}/${asset.file}`)
  return [...overrides, mirror, github]
}

/** 安装状态单例。 */
const status = {
  state: 'idle', // idle | installing | done | error
  phase: 'idle', // idle | download | verify | extract | install | done | error
  receivedBytes: 0,
  totalBytes: 0,
  percent: 0,
  error: null,
  path: null,
}

let inflight = null

/** 当前安装状态快照（只读副本）。 */
export function getInstallStatus() {
  return {
    state: status.state,
    phase: status.phase,
    receivedBytes: status.receivedBytes,
    totalBytes: status.totalBytes,
    percent: status.percent,
    error: status.error,
    path: status.path,
  }
}

export function isCliCached() {
  try {
    return existsSync(cachedCliPath()) && statSync(cachedCliPath()).isFile()
  } catch {
    return false
  }
}

function setPhase(phase, patch = {}) {
  status.phase = phase
  status.state = phase === 'done' ? 'done' : phase === 'error' ? 'error' : 'installing'
  Object.assign(status, patch)
}

function computePercent(received, total) {
  if (!total || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((received / total) * 100)))
}

/** 极简 `tar -xf`，成功返回 null，失败返回错误文本。 */
function extractWithTar(archive, destination) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('tar', ['-xf', archive, '-C', destination], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    } catch (error) {
      resolve(String(error?.message ?? error))
      return
    }
    let stderr = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => resolve(String(error?.message ?? error)))
    child.on('close', (code) => resolve(code === 0 ? null : (stderr.trim() || `tar exited ${code}`)))
  })
}

/** Windows 上用 PowerShell 解压 zip（tar 不可用时的兜底）。 */
function extractWithPowerShell(archive, destination) {
  return new Promise((resolve) => {
    const script = [
      "$ErrorActionPreference='Stop'",
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      '[System.IO.Compression.ZipFile]::ExtractToDirectory($env:FCLI_ARCHIVE,$env:FCLI_DEST)',
    ].join('; ')
    let child
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, FCLI_ARCHIVE: archive, FCLI_DEST: destination },
      })
    } catch (error) {
      resolve(String(error?.message ?? error))
      return
    }
    let stderr = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => resolve(String(error?.message ?? error)))
    child.on('close', (code) => resolve(code === 0 ? null : (stderr.trim() || `powershell exited ${code}`)))
  })
}

async function extractArchive(archive, destination) {
  const tarError = await extractWithTar(archive, destination)
  if (!tarError) return
  if (isWindows) {
    const psError = await extractWithPowerShell(archive, destination)
    if (!psError) return
    throw new Error(`解压失败：${tarError}；PowerShell 兜底也失败：${psError}`)
  }
  throw new Error(`解压失败：${tarError}`)
}

/** 递归查找解压出的 lark-cli 可执行文件。 */
function findBinary(root) {
  const wanted = new Set([EXE_NAME, 'lark-cli', 'lark-cli.exe'])
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (wanted.has(entry.name)) {
        return full
      }
    }
  }
  return null
}

async function sha256File(path) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const input = createReadStream(path)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('end', resolve)
    input.on('error', reject)
  })
  return hash.digest('hex')
}

async function downloadToFile(url, destination) {
  if (typeof fetch !== 'function') {
    throw new Error('当前 Node 运行时不支持 fetch，无法下载 lark-cli')
  }
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`)
  }
  const total = Number(response.headers.get('content-length') ?? 0) || 0
  status.totalBytes = total
  status.receivedBytes = 0
  status.percent = 0
  setPhase('download')
  const out = createWriteStream(destination)
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        status.receivedBytes += value.byteLength
        status.percent = computePercent(status.receivedBytes, status.totalBytes)
        await new Promise((resolve, reject) => {
          out.write(Buffer.from(value), (error) => (error ? reject(error) : resolve()))
        })
      }
    }
  } finally {
    await new Promise((resolve) => out.end(resolve))
  }
}

/**
 * 安装 lark-cli。并发调用共享同一个 Promise；已安装时直接返回 done。
 * @param {{force?:boolean}} [options]
 * @returns {Promise<ReturnType<typeof getInstallStatus>>}
 */
export function installCli(options = {}) {
  if (inflight) return inflight
  const force = options.force === true
  if (!force && isCliCached()) {
    status.state = 'done'
    status.phase = 'done'
    status.percent = 100
    status.path = cachedCliPath()
    status.error = null
    return Promise.resolve(getInstallStatus())
  }

  inflight = (async () => {
    const asset = assetForPlatform()
    if (!asset) {
      setPhase('error', {
        error: `暂不支持当前平台 ${process.platform}/${process.arch}；请安装 lark-cli 后通过 LARK_CLI_BIN 指定`,
        percent: 0,
        path: null,
      })
      return getInstallStatus()
    }

    const workDir = mkdtempSync(join(tmpdir(), 'dsh-feishu-cli-'))
    const archive = join(workDir, asset.file)
    const extractDir = join(workDir, 'extract')
    try {
      mkdirSync(extractDir, { recursive: true })
      status.state = 'installing'
      status.error = null
      status.percent = 0
      status.receivedBytes = 0
      status.totalBytes = 0
      status.path = null
      setPhase('download')

      let downloaded = null
      let lastError = null
      for (const url of downloadUrls(asset)) {
        try {
          await downloadToFile(url, archive)
          downloaded = url
          break
        } catch (error) {
          lastError = error
          try { rmSync(archive, { force: true }) } catch { /* ignore */ }
        }
      }
      if (!downloaded) {
        throw new Error(`下载失败：${String(lastError?.message ?? lastError ?? '所有下载源均不可用')}`)
      }

      setPhase('verify', { percent: 100 })
      const actual = await sha256File(archive)
      if (actual !== asset.sha256) {
        throw new Error(`SHA-256 校验失败（期望 ${asset.sha256}，实际 ${actual}）`)
      }

      setPhase('extract')
      await extractArchive(archive, extractDir)
      const binary = findBinary(extractDir)
      if (!binary) throw new Error('压缩包中未找到 lark-cli 可执行文件')

      setPhase('install')
      const target = cachedCliPath()
      mkdirSync(dirname(target), { recursive: true })
      const tempTarget = `${target}.tmp-${process.pid}`
      copyFileSync(binary, tempTarget)
      if (!isWindows) chmodSync(tempTarget, 0o755)
      try { rmSync(target, { force: true }) } catch { /* ignore */ }
      // rename 覆盖在 Windows 上偶发占用，退化为复制。
      try {
        renameSync(tempTarget, target)
      } catch {
        copyFileSync(tempTarget, target)
        try { rmSync(tempTarget, { force: true }) } catch { /* ignore */ }
      }

      setPhase('done', { percent: 100, path: target })
      return getInstallStatus()
    } catch (error) {
      setPhase('error', {
        error: String(error?.message ?? error),
        path: null,
      })
      return getInstallStatus()
    } finally {
      try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
      inflight = null
    }
  })()

  return inflight
}

/** 如果尚未安装则安装；已安装/已缓存时立即返回 done。 */
export function ensureCli() {
  if (isCliCached()) {
    status.state = 'done'
    status.phase = 'done'
    status.percent = 100
    status.path = cachedCliPath()
    status.error = null
    return Promise.resolve(getInstallStatus())
  }
  return installCli()
}

/** 供测试重置状态。 */
export function resetInstallStatusForTests() {
  status.state = 'idle'
  status.phase = 'idle'
  status.receivedBytes = 0
  status.totalBytes = 0
  status.percent = 0
  status.error = null
  status.path = null
  inflight = null
}

/** 便于诊断：当前安装目录与平台资产。 */
export function installDiagnostics() {
  const asset = assetForPlatform()
  return {
    root: installRoot(),
    binary: cachedCliPath(),
    cached: isCliCached(),
    platform: process.platform,
    arch: process.arch,
    asset: asset ? asset.file : null,
    version: CLI_VERSION,
  }
}

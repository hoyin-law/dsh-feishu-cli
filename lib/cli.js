/**
 * dsh-feishu-cli — Host 侧 lark-cli 封装。
 *
 * 负责：
 *  - 定位可执行文件（config.cliPath → vendor/ → LARK_CLI_BIN → PATH）；
 *  - shell 风格 argv 拆分（不做 shell 解释，直接 spawn）；
 *  - 捕获 stdout/stderr、超时与取消；
 *  - getState()：config show（默认即 JSON）+ auth status --json + auth list --json；
 *  - LoginManager：config init --new（应用初始化）/ auth login --no-wait +
 *    --device-code（账号登录）两阶段流程，URL 实时提取 + 二维码 PNG data URL；
 *  - logout。
 *
 * 仅使用 node: 内置模块。
 *
 * 已实测（lark-cli 1.0.98，Windows x64）：
 *  - `config show` 不接受 --json，但 stdout 本来就会打印 JSON 对象
 *    （appId/brand/profile/users/...），"Config file path" 走 stderr；
 *  - `config init --new --force-init --lang zh` 的二维码（ASCII）与
 *    verification URL 打印在 **stderr**，stdout 为空；完成后 stdout 输出
 *    {"appId":...,"appSecret":"****","brand":...}；
 *  - `auth login --no-wait --json` 直接输出裸 JSON（无 ok 信封）；
 *  - `auth qrcode <url> --output qr.png` 的 cwd 必须是输出文件所在目录。
 *
 * @module dsh-feishu-cli/cli
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import {
  cachedCliPath,
  getInstallStatus,
  installCli,
} from './install.js'

/** 插件根目录（本文件位于 <root>/lib/cli.js）。 */
export const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/** 单次进程输出捕获上限（防止异常输出撑爆内存）。 */
const MAX_CAPTURE = 4 * 1024 * 1024
/** 登录会话保留的输出尾部大小。 */
const SESSION_OUTPUT_TAIL = 8 * 1024
/** 已完成登录会话在 state 中保留的时长。 */
const SESSION_KEEP_MS = 5 * 60 * 1000
/** 解析 JSON 时最多尝试的行数（从尾部倒序）。 */
const MAX_JSON_SCAN_LINES = 400

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000

/* ------------------------------------------------------------------ */
/* 运行时配置                                                          */
/* ------------------------------------------------------------------ */

let runtime = { cliPath: undefined, defaultTimeoutMs: DEFAULT_TIMEOUT_MS }

/** 由插件 apply() 注入 cordis config；只覆盖传入的键。 */
export function configure(options = {}) {
  const next = { ...runtime }
  if (Object.prototype.hasOwnProperty.call(options, 'cliPath')) {
    next.cliPath = typeof options.cliPath === 'string' && options.cliPath.trim() !== ''
      ? options.cliPath.trim()
      : undefined
  }
  if (Object.prototype.hasOwnProperty.call(options, 'defaultTimeoutMs')) {
    next.defaultTimeoutMs = normalizeTimeoutMs(options.defaultTimeoutMs, DEFAULT_TIMEOUT_MS)
  }
  runtime = next
}

/** 当前运行时配置的只读快照。 */
export function getRuntime() {
  return { ...runtime }
}

function normalizeTimeoutMs(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(MAX_TIMEOUT_MS, Math.max(1000, Math.trunc(value)))
}

/* ------------------------------------------------------------------ */
/* 可执行文件定位                                                       */
/* ------------------------------------------------------------------ */

const isWindows = process.platform === 'win32'

function executableName() {
  return isWindows ? 'lark-cli.exe' : 'lark-cli'
}

/** 在 PATH 中查找可执行文件（仅 Windows 上补 .exe）。 */
function findOnPath(name) {
  const dirs = String(process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const names = isWindows && !/\.exe$/i.test(name) ? [name, `${name}.exe`] : [name]
  for (const dir of dirs) {
    for (const candidateName of names) {
      const candidate = join(dir, candidateName)
      try {
        if (existsSync(candidate)) return candidate
      } catch { /* ignore */ }
    }
  }
  return null
}

/**
 * 解析 lark-cli 可执行文件。
 * 顺序：显式 cliPath → LARK_CLI_BIN / LARK_CLI_PATH → 插件 vendor/ → PATH。
 * @param {string} [explicitPath]
 * @returns {{available:boolean,path:string|null,bundled:boolean,searched:string[]}}
 */
export function resolveCli(explicitPath) {
  const bundledPath = join(PLUGIN_ROOT, 'vendor', executableName())
  const cachedPath = cachedCliPath()
  const candidates = []
  const push = (path, bundled, source) => {
    if (typeof path !== 'string' || path.trim() === '') return
    candidates.push({ path: path.trim(), bundled, source })
  }
  push(explicitPath, false, 'config.cliPath')
  push(process.env.LARK_CLI_BIN, false, 'LARK_CLI_BIN')
  push(process.env.LARK_CLI_PATH, false, 'LARK_CLI_PATH')
  push(cachedPath, false, 'cache')
  push(bundledPath, true, 'vendor')

  const searched = []
  for (const candidate of candidates) {
    const raw = candidate.path
    const looksLikePath = isAbsolute(raw) || raw.includes('/') || raw.includes('\\')
    const absolute = looksLikePath ? resolve(raw) : findOnPath(raw)
    if (!absolute) {
      searched.push(raw)
      continue
    }
    try {
      if (existsSync(absolute)) {
        return {
          available: true,
          path: absolute,
          bundled: candidate.bundled || resolve(absolute) === resolve(bundledPath),
          source: candidate.source,
          searched,
        }
      }
    } catch { /* ignore */ }
    searched.push(absolute)
  }

  // 最后兜底：PATH 中的裸名字。
  const fromPath = findOnPath('lark-cli')
  if (fromPath) return { available: true, path: fromPath, bundled: false, source: 'PATH', searched }
  searched.push('lark-cli (PATH)')
  return { available: false, path: null, bundled: false, source: null, searched }
}

let versionCache = null

/** 读取 CLI 版本号（结果缓存）；不可用时返回 null。 */
export async function getCliVersion() {
  const resolved = resolveCli(runtime.cliPath)
  if (!resolved.available) return null
  if (versionCache && versionCache.path === resolved.path) return versionCache.version
  const result = await runCli(['--version'], { timeoutMs: 15_000 })
  const text = `${result.stdout}\n${result.stderr}`
  const match = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(text)
  const version = match ? match[1] : null
  if (version) versionCache = { path: resolved.path, version }
  return version
}

/* ------------------------------------------------------------------ */
/* 文本工具                                                            */
/* ------------------------------------------------------------------ */

/** 去掉 ANSI / OSC 转义序列。 */
export function stripAnsi(input) {
  return String(input ?? '')
    // CSI: ESC [ ... final byte
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    // OSC: ESC ] ... BEL / ST
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    // 其余单字节 ESC 序列
    .replace(/\u001b[@-Z\\-_]/g, '')
}

function trimUrlPunctuation(url) {
  return String(url).replace(/[),.;:'"`\]}>]+$/, '')
}

/**
 * 从 CLI 输出中提取 verification URL（优先 user_code 链接）。
 * @returns {string|null}
 */
export function extractVerificationUrl(text) {
  const clean = stripAnsi(text)
  const matches = clean.match(/https?:\/\/[^\s"'<>`]+/g) ?? []
  const urls = matches.map(trimUrlPunctuation).filter(Boolean)
  const preferred = urls.filter((url) => /user_code=/.test(url) || /\/page\/cli/.test(url))
  if (preferred.length > 0) return preferred[preferred.length - 1]
  return urls.length > 0 ? urls[urls.length - 1] : null
}

/** 解析 JSON 对象（兼容纯 JSON、最后一行 JSON、子串 JSON）。 */
export function parseJsonObject(text) {
  const value = parseJsonValue(text)
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return null
}

/** 解析 JSON 值（对象或数组）。 */
export function parseJsonValue(text) {
  const raw = stripAnsi(text).trim()
  if (raw === '') return null

  const attempt = (candidate) => {
    const trimmed = candidate.trim()
    if (trimmed === '') return undefined
    if (!/^[[{]/.test(trimmed)) return undefined
    try {
      return JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }

  const whole = attempt(raw)
  if (whole !== undefined) return whole

  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '')
  const limit = Math.min(lines.length, MAX_JSON_SCAN_LINES)
  for (let i = lines.length - 1; i >= lines.length - limit; i--) {
    const value = attempt(lines[i])
    if (value !== undefined) return value
  }

  // 多行缩进 JSON：尝试首个 { / [ 到末个 } / ] 的子串。
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = raw.indexOf(open)
    const end = raw.lastIndexOf(close)
    if (start >= 0 && end > start) {
      const value = attempt(raw.slice(start, end + 1))
      if (value !== undefined) return value
    }
  }
  return null
}

/** 从 CLI 的 ok:false 信封或 stderr 文本中提取人类可读错误。 */
export function extractErrorMessage(stderr, stdout) {
  for (const text of [stderr, stdout]) {
    const parsed = parseJsonObject(text)
    const error = parsed?.error
    if (error && typeof error === 'object') {
      const parts = []
      const type = typeof error.type === 'string' ? error.type : ''
      const subtype = typeof error.subtype === 'string' ? error.subtype : ''
      const label = [type, subtype].filter(Boolean).join('/')
      if (label) parts.push(`[${label}]`)
      if (typeof error.message === 'string' && error.message !== '') parts.push(error.message)
      if (typeof error.hint === 'string' && error.hint !== '') parts.push(error.hint)
      if (parts.length > 0) return parts.join('：')
    }
  }
  const text = stripAnsi(stderr).trim()
  if (text === '') return ''
  return tailText(text, 1200)
}

/** 取文本尾部（超长时加省略号）。 */
export function tailText(text, maxLength) {
  const value = String(text ?? '')
  if (value.length <= maxLength) return value
  return `…${value.slice(value.length - maxLength)}`
}

/** 判断 CLI 输出中的错误是否为「尚未配置」。 */
export function isNotConfiguredError(stderr, stdout) {
  const combined = `${stderr ?? ''}\n${stdout ?? ''}`
  return /"not_configured"/.test(combined)
}

/**
 * 遮蔽可能出现在 CLI 输出中的 appSecret（纵深防御，正常输出本就是 ****）。
 * @param {string} text
 */
export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/("app_?secret"\s*:\s*")[^"]*(")/gi, '$1****$2')
    .replace(/(app_?secret\s*[=:]\s*)([^\s"',}]+)/gi, '$1****')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1****')
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '$1****')
    .replace(
      /("?(?:access_?token|refresh_?token|tenant_?access_?token|authorization|token)"?\s*[:=]\s*"?)([^\s"',}]+)/gi,
      '$1****',
    )
}

/* ------------------------------------------------------------------ */
/* argv 拆分                                                           */
/* ------------------------------------------------------------------ */

/**
 * shell 风格 argv 拆分（不经过 shell）。
 *
 * 支持单/双引号与空白分隔；反斜杠只在引号内或转义引号/空格时才作为转义，
 * 以保留 Windows 路径（C:\Users\...）中的反斜杠。
 *
 * @param {string} input
 * @returns {string[]}
 */
export function splitArgs(input) {
  const text = String(input ?? '')
  const args = []
  let current = ''
  let started = false
  let quote = null

  const push = () => {
    if (started) {
      args.push(current)
      current = ''
      started = false
    }
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quote === "'") {
      if (char === "'") quote = null
      else { current += char; started = true }
      continue
    }

    if (quote === '"') {
      if (char === '"') { quote = null; continue }
      if (char === '\\' && (text[i + 1] === '"' || text[i + 1] === '\\')) {
        current += text[i + 1]
        started = true
        i++
        continue
      }
      current += char
      started = true
      continue
    }

    if (char === '\\') {
      const next = text[i + 1]
      if (next === '"' || next === "'" || next === ' ' || next === '\\') {
        current += next
        started = true
        i++
        continue
      }
      current += char
      started = true
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }

    if (/\s/.test(char)) {
      push()
      continue
    }

    current += char
    started = true
  }
  push()
  return args
}

/* ------------------------------------------------------------------ */
/* 进程执行                                                            */
/* ------------------------------------------------------------------ */

/**
 * 启动一个 lark-cli 子进程并收集输出。
 *
 * @param {string[]} args
 * @param {{cwd?:string, timeoutMs?:number, stdin?:string, cliPath?:string, signal?:AbortSignal,
 *          env?:Record<string,string>, onChunk?:(chunk:string,stream:'stdout'|'stderr')=>void,
 *          onSpawn?:(child:import('node:child_process').ChildProcess)=>void}} [options]
 * @returns {{available:boolean,path:string|null,child:import('node:child_process').ChildProcess|null,
 *           done:Promise<{exitCode:number|null,signal:string|null,timedOut:boolean,aborted:boolean,
 *                         spawnError:string|null,stdoutTruncated:boolean,stderrTruncated:boolean}>,
 *           stdout:()=>string, stderr:()=>string, kill:()=>void}}
 */
export function startProcess(args, options = {}) {
  const resolved = resolveCli(options.cliPath ?? runtime.cliPath)
  const state = {
    stdout: '',
    stderr: '',
    outTruncated: false,
    errTruncated: false,
    timedOut: false,
    aborted: false,
    spawnError: null,
  }
  let child = null
  let settled = false
  let timer = null
  let resolveDone = () => {}
  const done = new Promise((resolvePromise) => { resolveDone = resolvePromise })

  const finish = (exitCode, signal) => {
    if (settled) return
    settled = true
    if (timer) { clearTimeout(timer); timer = null }
    resolveDone({
      exitCode: exitCode ?? null,
      signal: signal ?? null,
      timedOut: state.timedOut,
      aborted: state.aborted,
      spawnError: state.spawnError,
      stdoutTruncated: state.outTruncated,
      stderrTruncated: state.errTruncated,
    })
  }

  const handle = {
    available: resolved.available,
    path: resolved.path,
    child: null,
    done,
    stdout: () => state.stdout,
    stderr: () => state.stderr,
    kill: () => {
      if (!child || child.exitCode !== null) return
      try { child.kill() } catch { /* already gone */ }
      if (isWindows && child.pid) {
        const pid = child.pid
        const fallback = setTimeout(() => {
          try {
            const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
            killer.on('error', () => {})
          } catch { /* ignore */ }
        }, 1200)
        if (typeof fallback.unref === 'function') fallback.unref()
      }
    },
  }

  if (!resolved.available) {
    state.spawnError = `未找到 lark-cli 可执行文件（已尝试：${resolved.searched.join(', ') || 'vendor/、PATH'}）`
    finish(null, null)
    return handle
  }

  const append = (stream, chunk) => {
    const key = stream === 'stdout' ? 'stdout' : 'stderr'
    const truncatedKey = stream === 'stdout' ? 'outTruncated' : 'errTruncated'
    if (state[truncatedKey]) return
    const remaining = MAX_CAPTURE - state[key].length
    if (remaining <= 0) { state[truncatedKey] = true; return }
    const text = typeof chunk === 'string' ? chunk : String(chunk)
    if (text.length > remaining) {
      state[key] += text.slice(0, remaining)
      state[truncatedKey] = true
      return
    }
    state[key] += text
  }

  try {
    child = spawn(resolved.path, args.map((arg) => String(arg)), {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env ? { ...process.env, ...options.env } : process.env,
    })
  } catch (error) {
    state.spawnError = String(error?.message ?? error)
    finish(null, null)
    return handle
  }

  handle.child = child
  if (typeof options.onSpawn === 'function') {
    try { options.onSpawn(child) } catch { /* ignore */ }
  }

  if (options.signal) {
    const onAbort = () => {
      state.aborted = true
      handle.kill()
    }
    if (options.signal.aborted) {
      onAbort()
    } else {
      try {
        options.signal.addEventListener('abort', onAbort, { once: true })
      } catch { /* ignore */ }
      const cleanup = () => {
        try { options.signal.removeEventListener('abort', onAbort) } catch { /* ignore */ }
      }
      child.once('close', cleanup)
    }
  }

  if (child.stdout) {
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      append('stdout', chunk)
      if (typeof options.onChunk === 'function') {
        try { options.onChunk(String(chunk), 'stdout') } catch { /* ignore */ }
      }
    })
  }
  if (child.stderr) {
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      append('stderr', chunk)
      if (typeof options.onChunk === 'function') {
        try { options.onChunk(String(chunk), 'stderr') } catch { /* ignore */ }
      }
    })
  }

  child.on('error', (error) => {
    state.spawnError = String(error?.message ?? error)
    if (!settled) finish(null, null)
  })
  child.on('close', (code, signal) => finish(code, signal))

  // stdin：默认立即关闭（lark-cli 非交互模式不读 stdin）。
  if (child.stdin) {
    child.stdin.on('error', () => { /* EPIPE when process exits early */ })
    try {
      if (typeof options.stdin === 'string' && options.stdin !== '') child.stdin.write(options.stdin)
      child.stdin.end()
    } catch { /* ignore */ }
  }

  const timeoutMs = options.timeoutMs === undefined ? runtime.defaultTimeoutMs : options.timeoutMs
  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    timer = setTimeout(() => {
      state.timedOut = true
      handle.kill()
      // 兜底：如果 close 事件迟迟不来，也结束等待。
      const guard = setTimeout(() => { if (!settled) finish(null, null) }, 3000)
      if (typeof guard.unref === 'function') guard.unref()
    }, timeoutMs)
  }

  return handle
}

/**
 * 运行一条 lark-cli 命令并等待结束（永不 reject）。
 * @param {string[]} args
 * @param {object} [options]
 */
export async function runCli(args, options = {}) {
  const proc = startProcess(args, options)
  const result = await proc.done
  return {
    exitCode: result.exitCode,
    signal: result.signal,
    stdout: proc.stdout(),
    stderr: proc.stderr(),
    timedOut: result.timedOut,
    aborted: result.aborted === true,
    spawnError: !proc.available || result.spawnError !== null,
    errorMessage: result.spawnError,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated,
  }
}

/**
 * 用一条命令行字符串运行 lark-cli（argv 拆分，不经过 shell）。
 * @param {string} command 例如 `calendar +agenda --dry-run`
 * @param {object} [options]
 */
export async function runCliLine(command, options = {}) {
  const args = splitArgs(command)
  if (args.length === 0) {
    return {
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '命令为空',
      timedOut: false,
      aborted: false,
      spawnError: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    }
  }
  return runCli(args, options)
}

/* ------------------------------------------------------------------ */
/* 状态聚合                                                            */
/* ------------------------------------------------------------------ */

function normalizeUsers(value) {
  const rawList = Array.isArray(value)
    ? value
    : (value && Array.isArray(value.users) ? value.users : [])
  return rawList
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      userName: typeof item.userName === 'string' ? item.userName : '',
      userOpenId: typeof item.userOpenId === 'string' ? item.userOpenId : '',
      tokenStatus: typeof item.tokenStatus === 'string' ? item.tokenStatus : '',
    }))
}

function scopeCountOf(scope) {
  if (typeof scope === 'string') return scope.split(/[\s,]+/).filter(Boolean).length
  if (Array.isArray(scope)) return scope.length
  return undefined
}

function configFromProbe(result) {
  if (!result) return { configured: false, error: 'lark-cli 不可用' }
  if (result.exitCode === 0) {
    const parsed = parseJsonObject(result.stdout)
    if (!parsed || typeof parsed !== 'object') {
      return { configured: true }
    }
    const config = { configured: true }
    if (typeof parsed.appId === 'string') config.appId = parsed.appId
    if (typeof parsed.brand === 'string') config.brand = parsed.brand
    if (typeof parsed.profile === 'string') config.profile = parsed.profile
    if (typeof parsed.users === 'string') config.users = parsed.users
    if (typeof parsed.lang === 'string') config.lang = parsed.lang
    return config
  }
  const error = isNotConfiguredError(result.stderr, result.stdout)
    ? '尚未配置飞书应用，请先完成应用初始化'
    : (extractErrorMessage(result.stderr, result.stdout) || `config show 失败（退出码 ${result.exitCode ?? '?'}）`)
  return { configured: false, error }
}

function pickString(object, keys) {
  if (!object || typeof object !== 'object') return undefined
  for (const key of keys) {
    const value = object[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

function authFromProbe(statusResult, listResult) {
  const auth = {
    identity: 'none',
    loggedIn: false,
    users: normalizeUsers(listResult && listResult.exitCode === 0 ? parseJsonValue(listResult.stdout) : null),
  }
  if (!statusResult) {
    auth.error = 'lark-cli 不可用'
    return auth
  }
  if (statusResult.exitCode !== 0) {
    auth.error = isNotConfiguredError(statusResult.stderr, statusResult.stdout)
      ? '尚未配置飞书应用，请先完成应用初始化'
      : (extractErrorMessage(statusResult.stderr, statusResult.stdout) || `auth status 失败（退出码 ${statusResult.exitCode ?? '?'}）`)
    return auth
  }
  const parsed = parseJsonObject(statusResult.stdout)
  const identities = parsed && typeof parsed.identities === 'object' && parsed.identities !== null
    ? parsed.identities
    : {}
  const user = identities.user && typeof identities.user === 'object' ? identities.user : {}
  const bot = identities.bot && typeof identities.bot === 'object' ? identities.bot : {}
  const identity = parsed && ['user', 'bot', 'none'].includes(parsed.identity) ? parsed.identity : 'none'
  auth.identity = identity
  auth.loggedIn = user.available === true
  const userName = pickString(user, ['userName', 'user_name', 'name'])
  if (userName) auth.userName = userName
  const openId = pickString(user, ['openId', 'open_id', 'userOpenId', 'user_open_id'])
  if (openId) auth.openId = openId
  const appName = pickString(bot, ['appName', 'app_name', 'name'])
  if (appName) auth.appName = appName
  const count = scopeCountOf(user.scope)
  if (count !== undefined) auth.scopeCount = count
  const expiresAt = pickString(user, ['expiresAt', 'expires_at'])
  if (expiresAt) auth.expiresAt = expiresAt
  if (typeof parsed.note === 'string' && parsed.note !== '' && auth.loggedIn === false) auth.note = parsed.note
  return auth
}

/**
 * 聚合 Web UI / Agent 需要的完整状态。
 * 永不 reject；CLI 不可用或探测失败时用 false/error 字段表达。
 */
export async function getState() {
  const resolved = resolveCli(runtime.cliPath)
  const version = resolved.available ? await getCliVersion() : null
  const install = getInstallStatus()
  const cli = {
    available: resolved.available,
    path: resolved.path,
    version,
    bundled: resolved.bundled,
    source: resolved.source ?? null,
    installing: install.state === 'installing',
    installPhase: install.phase,
    installProgress: {
      receivedBytes: install.receivedBytes,
      totalBytes: install.totalBytes,
      percent: install.percent,
    },
    installError: install.error,
  }

  let config = { configured: false, error: 'lark-cli 不可用' }
  let auth = { identity: 'none', loggedIn: false, users: [], error: 'lark-cli 不可用' }

  if (resolved.available) {
    const [configResult, statusResult, listResult] = await Promise.all([
      runCli(['config', 'show'], { timeoutMs: 20_000 }),
      runCli(['auth', 'status', '--json'], { timeoutMs: 20_000 }),
      runCli(['auth', 'list', '--json'], { timeoutMs: 20_000 }),
    ])
    config = configFromProbe(configResult)
    auth = authFromProbe(statusResult, listResult)
  }

  return {
    ok: true,
    cli,
    config,
    auth,
    login: getLoginManager().recentForState(),
  }
}

/**
 * 退出登录。
 * @returns {Promise<{ok:boolean,message?:string,error?:string,exitCode:number|null}>}
 */
export async function logout(options = {}) {
  const result = await runCli(['auth', 'logout', '--json'], { timeoutMs: 30_000, ...options })
  if (result.exitCode === 0) {
    const parsed = parseJsonObject(result.stdout)
    let message = '已退出登录'
    if (parsed) {
      if (typeof parsed.message === 'string' && parsed.message !== '') {
        message = parsed.message
      } else if (parsed.loggedOut === false) {
        message = parsed.reason === 'not_configured'
          ? '尚未配置飞书应用，无需退出登录'
          : '当前没有登录的账号'
      }
    }
    return { ok: true, message, exitCode: 0 }
  }
  const error = isNotConfiguredError(result.stderr, result.stdout)
    ? '尚未配置飞书应用'
    : (extractErrorMessage(result.stderr, result.stdout) || `退出登录失败（退出码 ${result.exitCode ?? '?'}）`)
  return { ok: false, error, exitCode: result.exitCode }
}

/* ------------------------------------------------------------------ */
/* 二维码                                                              */
/* ------------------------------------------------------------------ */

/**
 * 用 `lark-cli auth qrcode` 生成 PNG 并转 data URL。
 * cwd 必须是输出目录（CLI 只接受 cwd 下的相对路径）。
 *
 * @param {string} url verification URL
 * @param {{cliPath?:string, timeoutMs?:number, size?:number, onSpawn?:(child)=>void}} [options]
 * @returns {Promise<string>} `data:image/png;base64,...`
 */
export async function generateQrDataUrl(url, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-feishu-qr-'))
  try {
    const size = Number.isInteger(options.size) && options.size > 0 ? options.size : 240
    const proc = startProcess(
      ['auth', 'qrcode', String(url), '--output', 'qr.png', '--size', String(size)],
      {
        cwd: dir,
        timeoutMs: options.timeoutMs ?? 20_000,
        cliPath: options.cliPath,
        onSpawn: options.onSpawn,
      },
    )
    const result = await proc.done
    if (result.exitCode !== 0) {
      throw new Error(extractErrorMessage(proc.stderr(), proc.stdout()) || `二维码生成失败（退出码 ${result.exitCode ?? '?'}）`)
    }
    const parsed = parseJsonObject(proc.stdout())
    const filePath = parsed && typeof parsed.file_path === 'string' && parsed.file_path !== ''
      ? parsed.file_path
      : join(dir, 'qr.png')
    const data = readFileSync(filePath)
    return `data:image/png;base64,${data.toString('base64')}`
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/* 登录会话管理                                                        */
/* ------------------------------------------------------------------ */

function delay(ms) {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
}

/**
 * 单例登录管理器：同一时刻只保留一个 pending 会话。
 *
 * 会话内部字段：{ id, mode, status, url, qrDataUrl, message, startedAt,
 * finishedAt, userName, deviceCode, stdout, stderr, procs:Set, qrPromise }
 */
export class LoginManager {
  constructor(getOptions = () => ({})) {
    this.getOptions = typeof getOptions === 'function' ? getOptions : () => (getOptions ?? {})
    /** @type {Map<string, object>} */
    this.sessions = new Map()
    this.activeId = null
  }

  _options() {
    const options = this.getOptions() ?? {}
    return {
      cliPath: options.cliPath ?? runtime.cliPath,
      defaultTimeoutMs: options.defaultTimeoutMs ?? runtime.defaultTimeoutMs,
    }
  }

  _newSession(mode, options = {}) {
    const session = {
      id: randomUUID(),
      mode,
      status: 'pending',
      url: undefined,
      qrDataUrl: undefined,
      message: undefined,
      startedAt: Date.now(),
      finishedAt: undefined,
      userName: undefined,
      deviceCode: undefined,
      domains: Array.isArray(options.domains) ? options.domains : [],
      recommend: options.recommend !== false,
      stdout: '',
      stderr: '',
      procs: new Set(),
      qrPromise: null,
      waiters: new Set(),
    }
    this.sessions.set(session.id, session)
    this.activeId = session.id
    return session
  }

  /**
   * 启动登录/初始化流程，返回当前会话快照（已尽力等到 URL/二维码就绪）。
   * 已有 pending 会话时直接返回该会话。
   *
   * @param {'init'|'login'} mode
   * @param {{domains?:string[], recommend?:boolean}} [options]
   */
  async start(mode, options = {}) {
    if (mode !== 'init' && mode !== 'login') {
      throw new Error('mode 必须是 init 或 login')
    }
    this._prune()
    const active = this.activeId ? this.sessions.get(this.activeId) : null
    if (active && active.status === 'pending') return this.snapshot(active)

    const session = this._newSession(mode, options)
    const task = mode === 'init' ? this._runInit(session) : this._runLogin(session, options)
    task.catch((error) => this._fail(session, `登录流程异常：${String(error?.message ?? error)}`))

    const waitMs = mode === 'init' ? 12_000 : 20_000
    await this._waitFor(session, (item) => Boolean(item.url) || item.status !== 'pending', waitMs)
    if (session.qrPromise && session.status === 'pending') {
      await Promise.race([session.qrPromise, delay(8000)])
    }
    return this.snapshot(session)
  }

  /** 按 id 取会话内部对象。 */
  get(id) {
    return this.sessions.get(id) ?? null
  }

  /** 按 id 取公开快照。 */
  getSnapshot(id) {
    const session = this.sessions.get(id)
    return session ? this.snapshot(session) : null
  }

  /** 最近一个待展示的会话（pending，或 5 分钟内结束的会话）。 */
  recentForState() {
    this._prune()
    const now = Date.now()
    const candidates = []
    for (const session of this.sessions.values()) {
      if (session.status === 'pending') {
        candidates.push(session)
      } else if (typeof session.finishedAt === 'number' && now - session.finishedAt <= SESSION_KEEP_MS) {
        candidates.push(session)
      }
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))
    return this.snapshot(candidates[0])
  }

  /** 等同 recentForState（语义别名）。 */
  getActive() {
    return this.recentForState()
  }

  /**
   * 取消登录：kill 子进程，状态置 cancelled。
   * 会话已结束时原样返回。
   */
  cancel(id) {
    const session = (id ? this.sessions.get(id) : null)
      ?? (this.activeId ? this.sessions.get(this.activeId) : null)
    if (!session) return null
    if (session.status === 'pending') {
      this._finalize(session, 'cancelled', { message: '已取消' })
      for (const proc of session.procs) {
        try { proc.kill() } catch { /* ignore */ }
      }
      session.procs.clear()
    }
    return this.snapshot(session)
  }

  /** 等待会话结束（或超时），返回快照。 */
  waitFor(id, timeoutMs = 600_000) {
    const session = this.sessions.get(id)
    if (!session) return Promise.resolve(null)
    if (session.status !== 'pending') return Promise.resolve(this.snapshot(session))
    return new Promise((resolvePromise) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        session.waiters.delete(wake)
        resolvePromise(value)
      }
      const wake = () => finish(this.snapshot(session))
      const timer = setTimeout(() => finish(this.snapshot(session)), Math.max(1000, timeoutMs))
      if (typeof timer.unref === 'function') timer.unref()
      session.waiters.add(wake)
    })
  }

  /** kill 所有 pending 会话（插件卸载时调用）。 */
  dispose() {
    for (const session of this.sessions.values()) {
      if (session.status === 'pending') this.cancel(session.id)
    }
    this.sessions.clear()
    this.activeId = null
  }

  /* ---------------- 内部实现 ---------------- */

  snapshot(session) {
    const snapshot = {
      id: session.id,
      mode: session.mode,
      status: session.status,
      startedAt: session.startedAt,
    }
    if (session.url !== undefined) snapshot.url = session.url
    if (session.qrDataUrl !== undefined) snapshot.qrDataUrl = session.qrDataUrl
    if (session.message !== undefined) snapshot.message = session.message
    if (session.finishedAt !== undefined) snapshot.finishedAt = session.finishedAt
    if (session.userName !== undefined) snapshot.userName = session.userName
    return snapshot
  }

  _finalize(session, status, patch = {}) {
    if (session.status !== 'pending' && status !== 'cancelled') {
      // 已结束的会话不再改写状态（竞态保护），但仍唤醒等待者。
      this._notify(session)
      return
    }
    session.status = status
    session.finishedAt = Date.now()
    Object.assign(session, patch)
    if (this.activeId === session.id) this.activeId = null
    this._notify(session)
    this._prune()
  }

  _fail(session, message) {
    if (session.status === 'cancelled') return
    this._finalize(session, 'failed', { message: tailText(message || '登录失败', 2000) })
  }

  _notify(session) {
    for (const wake of session.waiters) {
      try { wake() } catch { /* ignore */ }
    }
    session.waiters.clear()
  }

  _prune() {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (session.status !== 'pending' && typeof session.finishedAt === 'number' && now - session.finishedAt > SESSION_KEEP_MS) {
        this.sessions.delete(id)
      }
    }
    // 兜底上限，避免长期运行无限增长。
    if (this.sessions.size > 40) {
      const finished = [...this.sessions.values()]
        .filter((session) => session.status !== 'pending')
        .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
      for (const session of finished.slice(0, this.sessions.size - 40)) {
        this.sessions.delete(session.id)
      }
    }
  }

  async _waitFor(session, predicate, timeoutMs) {
    const deadline = Date.now() + Math.max(0, timeoutMs)
    while (Date.now() < deadline) {
      if (predicate(session)) return
      await delay(50)
    }
  }

  _spawnTracked(session, args, options = {}) {
    const proc = startProcess(args, {
      ...options,
      cliPath: options.cliPath ?? this._options().cliPath,
    })
    session.procs.add(proc)
    proc.done.finally(() => session.procs.delete(proc)).catch(() => {})
    return proc
  }

  _setUrl(session, url) {
    if (!url || session.url === url) return
    session.url = url
    if (!session.message) session.message = '等待用户在浏览器中完成授权…'
    if (!session.qrPromise) {
      session.qrPromise = this._attachQr(session, url)
    }
  }

  async _attachQr(session, url) {
    try {
      const dataUrl = await generateQrDataUrl(url, {
        cliPath: this._options().cliPath,
        onSpawn: (child) => {
          // 让 cancel 能一并杀掉二维码子进程。
          session.procs.add({ kill: () => { try { child.kill() } catch { /* ignore */ } } })
        },
      })
      if (session.status !== 'cancelled') session.qrDataUrl = dataUrl
    } catch {
      // 二维码只是便利，失败不影响流程；UI 会回退显示链接。
    }
  }

  async _runInit(session) {
    let proc = null
    proc = this._spawnTracked(session, ['config', 'init', '--new', '--force-init', '--lang', 'zh'], {
      timeoutMs: 0,
      cwd: PLUGIN_ROOT,
      onChunk: () => {
        const url = extractVerificationUrl(`${proc.stdout()}\n${proc.stderr()}`)
        if (url) this._setUrl(session, url)
      },
    })
    if (!proc.available) {
      this._fail(session, '未找到 lark-cli 可执行文件，无法启动应用初始化')
      return
    }
    const result = await proc.done
    if (session.status === 'cancelled') return
    const out = proc.stdout()
    const err = proc.stderr()
    session.stdout = tailText(out, SESSION_OUTPUT_TAIL)
    session.stderr = tailText(err, SESSION_OUTPUT_TAIL)

    if (result.spawnError) {
      this._fail(session, err || result.spawnError)
      return
    }
    if (result.timedOut) {
      this._fail(session, '应用初始化超时')
      return
    }
    if (result.exitCode === 0) {
      const parsed = parseJsonObject(out)
      const appId = parsed && typeof parsed.appId === 'string' ? parsed.appId : null
      this._finalize(session, 'completed', {
        message: appId ? `应用配置成功（App ID: ${appId}）` : '应用配置成功',
      })
      return
    }
    const error = isNotConfiguredError(err, out)
      ? '应用初始化失败：尚未完成配置'
      : (extractErrorMessage(err, out) || `应用初始化失败（退出码 ${result.exitCode ?? '?'}）`)
    this._fail(session, error)
  }

  _loginScopeArgs(session) {
    const domains = session.domains.filter((domain) => typeof domain === 'string' && domain.trim() !== '')
    if (domains.length > 0) return ['--domain', domains.map((domain) => domain.trim()).join(',')]
    if (session.recommend === false) return []
    return ['--recommend']
  }

  async _runLogin(session, options = {}) {
    // 第一步：no-wait 拿 verification_url + device_code。
    const startArgs = ['auth', 'login', ...this._loginScopeArgs(session), '--no-wait', '--json']
    let noWait = null
    noWait = this._spawnTracked(session, startArgs, {
      timeoutMs: 60_000,
      cwd: PLUGIN_ROOT,
      onChunk: () => {
        const url = extractVerificationUrl(`${noWait.stdout()}\n${noWait.stderr()}`)
        if (url) this._setUrl(session, url)
      },
    })
    if (!noWait.available) {
      this._fail(session, '未找到 lark-cli 可执行文件，无法启动登录')
      return
    }
    const first = await noWait.done
    if (session.status === 'cancelled') return
    const out1 = noWait.stdout()
    const err1 = noWait.stderr()
    session.stdout = tailText(out1, SESSION_OUTPUT_TAIL)
    session.stderr = tailText(err1, SESSION_OUTPUT_TAIL)

    if (first.spawnError) {
      this._fail(session, err1 || first.spawnError)
      return
    }
    if (first.timedOut) {
      this._fail(session, '获取登录链接超时')
      return
    }
    if (first.exitCode !== 0) {
      const error = isNotConfiguredError(err1, out1)
        ? '尚未配置飞书应用，请先完成应用初始化'
        : (extractErrorMessage(err1, out1) || `获取登录链接失败（退出码 ${first.exitCode ?? '?'}）`)
      this._fail(session, error)
      return
    }

    const info = parseJsonObject(out1)
    const url = info && typeof info.verification_url === 'string' ? info.verification_url : null
    const deviceCode = info && typeof info.device_code === 'string' ? info.device_code : null
    if (!url || !deviceCode) {
      this._fail(session, '未能从 lark-cli 输出中解析登录链接或 device code')
      return
    }
    session.deviceCode = deviceCode
    this._setUrl(session, url)
    if (info && typeof info.hint === 'string' && info.hint !== '') {
      session.message = `请在浏览器中打开链接完成登录（${Math.round(Number(info.expires_in) || 600)} 秒内有效）`
    }

    // 第二步：带上 device code 轮询（阻塞，最长约 10 分钟）。
    const poll = this._spawnTracked(session, ['auth', 'login', '--device-code', deviceCode, '--json'], {
      timeoutMs: 660_000,
      cwd: PLUGIN_ROOT,
    })
    if (!poll.available) {
      this._fail(session, '未找到 lark-cli 可执行文件')
      return
    }
    const second = await poll.done
    if (session.status === 'cancelled') return
    const out2 = poll.stdout()
    const err2 = poll.stderr()
    session.stdout = tailText(out2, SESSION_OUTPUT_TAIL)
    session.stderr = tailText(err2, SESSION_OUTPUT_TAIL)

    const payload = parseJsonObject(out2)
    if (payload && payload.event === 'authorization_complete') {
      const userName = typeof payload.user_name === 'string' && payload.user_name !== '' ? payload.user_name : null
      let message = userName ? `登录成功：${userName}` : '登录成功'
      if (payload.warning && typeof payload.warning === 'object' && typeof payload.warning.hint === 'string') {
        message += `（注意：${payload.warning.hint}）`
      }
      this._finalize(session, 'completed', {
        message,
        userName: userName ?? undefined,
      })
      return
    }
    if (second.timedOut) {
      this._fail(session, '登录等待超时，请重新发起登录')
      return
    }
    if (second.exitCode === 0) {
      this._finalize(session, 'completed', { message: '登录成功' })
      return
    }
    const error = isNotConfiguredError(err2, out2)
      ? '尚未配置飞书应用'
      : (extractErrorMessage(err2, out2) || `登录失败（退出码 ${second.exitCode ?? '?'}）`)
    this._fail(session, error)
  }
}

/* ------------------------------------------------------------------ */
/* 模块级单例                                                          */
/* ------------------------------------------------------------------ */

let loginManager = null

/** 取模块级单例 LoginManager。 */
export function getLoginManager() {
  if (!loginManager) loginManager = new LoginManager(() => runtime)
  return loginManager
}

/** 启动登录/初始化（模块级单例）。 */
export function startLogin(mode, options = {}) {
  return getLoginManager().start(mode, options)
}

/** 按 id 取会话快照（模块级单例）。 */
export function getLoginSession(id) {
  return getLoginManager().getSnapshot(id)
}

/** 取消登录（模块级单例）。 */
export function cancelLogin(id) {
  return getLoginManager().cancel(id)
}

/** 等待登录结束（模块级单例）。 */
export function waitLogin(id, timeoutMs = 600_000) {
  return getLoginManager().waitFor(id, timeoutMs)
}

/** 当前应展示的登录会话（模块级单例）。 */
export function recentLogin() {
  return getLoginManager().recentForState()
}

/**
 * 把完整输出写入临时文件（供工具 render 在截断时给出全文路径）。
 * @param {string} text
 * @param {string} [prefix]
 * @returns {string|null}
 */
export function saveTempOutput(text, prefix = 'dsh-feishu-cli') {
  try {
    const dir = tmpdir()
    const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`
    const filePath = join(dir, name)
    writeFileSync(filePath, String(text ?? ''), 'utf8')
    return filePath
  } catch {
    return null
  }
}

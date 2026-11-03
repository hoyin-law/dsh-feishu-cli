/**
 * dsh-feishu-cli — Web GUI API（Host 侧）。
 *
 * 通过 `ctx.inject(['webServer'], ...)` 条件注册，前缀 `/feishu-cli`。
 *
 * 路由：
 *   GET  /feishu-cli/api/state                    完整状态（CLI/配置/登录/当前会话）
 *   POST /feishu-cli/api/login/start              { mode:'init'|'login', domains?, recommend? }
 *   GET  /feishu-cli/api/login/<id>               轮询登录会话
 *   POST /feishu-cli/api/login/<id>/cancel        取消登录（kill 子进程）
 *   POST /feishu-cli/api/logout                   退出登录
 *   POST /feishu-cli/api/run                      { command, timeoutMs? } 执行任意 lark-cli 命令
 *
 * 所有 POST 要求 Content-Type: application/json（允许 ;charset 等参数）且做
 * 同源校验（Origin 的 host 必须等于 Host 头，缺失 Origin 直接拒绝——同源
 * fetch 必然携带 Origin）。
 *
 * 响应中不回显 appSecret。
 *
 * @module dsh-feishu-cli/api
 */

import { URL } from 'node:url'
import {
  PLUGIN_ROOT,
  getLoginManager,
  getRuntime,
  getState,
  logout,
  parseJsonValue,
  redactSecrets,
  runCliLine,
} from './cli.js'
import { installCli } from './install.js'

export const API_BASE = '/feishu-cli'

const MAX_BODY_BYTES = 64 * 1024
const MAX_TIMEOUT_MS = 600_000
const MIN_TIMEOUT_MS = 1000

/** 发送 JSON 响应。 */
function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

/** 读取 JSON 请求体（空体视为 {}）。 */
async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('请求体必须是 JSON 对象')
  }
  return parsed
}

/**
 * POST 守卫：Content-Type 必须为 application/json；跨站 Origin 拒绝。
 *
 * 说明：DSH Desktop 的页面可能运行在 Electron 自定义协议/非标准 Origin 下，
 * 同源 POST 不保证携带 Origin（也可能为 "null"）。由于请求体必须是
 * application/json，跨站表单无法伪造，跨站脚本也会被 CORS 预检拦截，
 * 因此对缺失/为 null 的 Origin 放行；Origin 存在时只拒绝明确跨站的请求。
 *
 * @returns {string|null} 错误文案，或 null 表示通过
 */
export function postGuard(req) {
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') return '请求必须为 application/json'

  const host = String(req.headers.host ?? '')
  const origin = String(req.headers.origin ?? '')
  if (origin === '' || origin === 'null') return null

  let originUrl
  try {
    originUrl = new URL(origin)
  } catch {
    return '跨站请求已拒绝'
  }
  if (host === '' || originUrl.host === host) return null

  // 容忍 127.0.0.1 / localhost / [::1] 之间的同端口别名（Electron 包装层）。
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return '跨站请求已拒绝'
  }
  if (
    loopback.has(originUrl.hostname)
    && loopback.has(hostUrl.hostname)
    && originUrl.port === hostUrl.port
  ) {
    return null
  }
  return '跨站请求已拒绝'
}

function validateDomains(value) {
  if (value === undefined || value === null) return { ok: true, domains: [] }
  if (!Array.isArray(value)) return { ok: false, error: 'domains 必须是字符串数组' }
  const domains = []
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      return { ok: false, error: 'domains 每项必须是非空字符串' }
    }
    domains.push(item.trim())
  }
  return { ok: true, domains: domains.slice(0, 64) }
}

/**
 * 创建 webServer 前缀 handler。
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createApiHandler() {
  return async function handler(req, res) {
    const method = String(req.method ?? 'GET').toUpperCase()
    let url
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      sendJson(res, 400, { ok: false, error: '非法请求 URL' })
      return
    }

    const pathname = url.pathname
    if (!pathname.startsWith(API_BASE)) {
      sendJson(res, 404, { ok: false, error: 'not found' })
      return
    }
    const segments = pathname.slice(API_BASE.length).split('/').filter(Boolean)

    try {
      // GET /api/state
      if (method === 'GET' && segments.length === 2 && segments[0] === 'api' && segments[1] === 'state') {
        const state = await getState()
        sendJson(res, 200, state)
        return
      }

      if (method === 'POST') {
        const guardError = postGuard(req)
        if (guardError) {
          sendJson(res, 400, { ok: false, error: guardError })
          return
        }

        // POST /api/login/start
        if (segments.length === 3 && segments[0] === 'api' && segments[1] === 'login' && segments[2] === 'start') {
          const body = await readBody(req)
          const mode = body.mode
          if (mode !== 'init' && mode !== 'login') {
            sendJson(res, 400, { ok: false, error: "mode 必须是 'init' 或 'login'" })
            return
          }
          const domainsCheck = validateDomains(body.domains)
          if (!domainsCheck.ok) {
            sendJson(res, 400, { ok: false, error: domainsCheck.error })
            return
          }
          if (body.recommend !== undefined && typeof body.recommend !== 'boolean') {
            sendJson(res, 400, { ok: false, error: 'recommend 必须是布尔值' })
            return
          }
          const login = await getLoginManager().start(mode, {
            domains: domainsCheck.domains,
            recommend: body.recommend,
          })
          sendJson(res, 200, { ok: true, login })
          return
        }

        // POST /api/login/<id>/cancel
        if (segments.length === 4 && segments[0] === 'api' && segments[1] === 'login' && segments[3] === 'cancel') {
          const id = decodeURIComponent(segments[2])
          const login = getLoginManager().cancel(id)
          if (!login) {
            sendJson(res, 404, { ok: false, error: '登录会话不存在' })
            return
          }
          sendJson(res, 200, { ok: true, login })
          return
        }

        // POST /api/logout
        if (segments.length === 2 && segments[0] === 'api' && segments[1] === 'logout') {
          await readBody(req)
          const result = await logout()
          if (!result.ok) {
            sendJson(res, 500, { ok: false, error: result.error ?? '退出登录失败' })
            return
          }
          sendJson(res, 200, { ok: true, message: result.message })
          return
        }

        // POST /api/cli/install
        if (segments.length === 3 && segments[0] === 'api' && segments[1] === 'cli' && segments[2] === 'install') {
          await readBody(req)
          // 后台下载；立即返回，UI 通过 /api/state 轮询进度。
          void installCli()
          sendJson(res, 200, { ok: true, started: true })
          return
        }

        // POST /api/run
        if (segments.length === 2 && segments[0] === 'api' && segments[1] === 'run') {
          const body = await readBody(req)
          const command = typeof body.command === 'string' ? body.command.trim() : ''
          if (command === '') {
            sendJson(res, 400, { ok: false, error: 'command 不能为空' })
            return
          }
          let timeoutMs = getRuntime().defaultTimeoutMs
          if (body.timeoutMs !== undefined && body.timeoutMs !== null) {
            if (typeof body.timeoutMs !== 'number' || !Number.isFinite(body.timeoutMs)) {
              sendJson(res, 400, { ok: false, error: 'timeoutMs 必须是数字' })
              return
            }
            timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(body.timeoutMs)))
          }
          const result = await runCliLine(command, { cwd: PLUGIN_ROOT, timeoutMs })
          const parsed = parseJsonValue(result.stdout)
          const okEnvelope = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            && (typeof parsed.ok === 'boolean' || typeof parsed.event === 'string')
            ? parsed
            : null
          sendJson(res, 200, {
            ok: true,
            exitCode: result.exitCode,
            stdout: redactSecrets(result.stdout),
            stderr: redactSecrets(result.stderr),
            okEnvelope,
          })
          return
        }
      }

      // GET /api/login/<id>
      if (method === 'GET' && segments.length === 3 && segments[0] === 'api' && segments[1] === 'login') {
        const id = decodeURIComponent(segments[2])
        const login = getLoginManager().getSnapshot(id)
        if (!login) {
          sendJson(res, 404, { ok: false, error: '登录会话不存在' })
          return
        }
        sendJson(res, 200, { ok: true, login })
        return
      }

      sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      const message = String(error?.message ?? error)
      sendJson(res, 500, { ok: false, error: message })
    }
  }
}

/**
 * 在 webServer 上安装 API（调用方负责在 ctx.inject(['webServer']) 内调用）。
 * @param {object} webCtx 具备 webServer 服务的 cordis 上下文
 * @returns {() => void} disposer
 */
export function installApi(webCtx) {
  return webCtx.effect(
    () => webCtx.webServer.register({ kind: 'prefix', path: API_BASE, handler: createApiHandler() }),
    'feishu-cli: web api',
  )
}

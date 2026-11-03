/**
 * dsh-feishu-cli — Host 插件入口。
 *
 * 提供：
 *  - Agent 工具 `feishu_cli`：执行飞书官方 CLI（lark-cli）任意命令；
 *  - Agent 工具 `feishu_auth`：查询登录状态 / 发起登录 / 等待登录 / 退出 / 列出用户；
 *  - Web API `/feishu-cli`：Web UI 面板的状态、登录、登出与命令控制台；
 *  - systemPrompt 片段：告诉模型如何驱动 CLI（含退出码 10 约定）。
 *
 * 只使用 node: 内置模块与本地 lib/ 文件，不 import 任何 @deepseek-ai/* 值包。
 */
import { existsSync, statSync } from 'node:fs'
import {
  PLUGIN_ROOT,
  cancelLogin,
  configure,
  getLoginManager,
  getState,
  logout,
  parseJsonValue,
  redactSecrets,
  runCliLine,
  saveTempOutput,
  startLogin,
  waitLogin,
} from './lib/cli.js'
import { installApi } from './lib/api.js'

export const name = 'feishu-cli'
/** 工具注册是硬依赖；webServer/systemPrompt 用 inject 动态挂载。 */
export const inject = ['tools']

/* 说明：本插件不导出 Schemastery `Config`（profile 未提供该依赖）。
 * 可执行文件路径通过环境变量 LARK_CLI_BIN / LARK_CLI_PATH 覆盖；
 * 默认使用插件内置的 vendor/lark-cli.exe。 */

const MAX_RENDER_CHARS = 12_000
const MAX_TIMEOUT_MS = 600_000
const MIN_TIMEOUT_MS = 1000

const SYSTEM_PROMPT_TEXT = [
  '飞书（Feishu / Lark）已通过 dsh-feishu-cli 插件接入官方 lark-cli（1.0.98）。',
  '可用工具：feishu_cli（执行任意 CLI 命令）与 feishu_auth（登录状态 / 发起登录 / 等待登录 / 退出 / 用户列表）。',
  '首次使用：若 feishu_auth status 显示应用未配置（config.configured=false），让用户在 DSH 的「飞书 CLI」面板点击初始化并扫码；也可以在对话中调用 feishu_auth（action=login_start, mode=init）把返回的授权链接或二维码给用户。',
  '账号登录：feishu_auth（action=login_start, mode=login）返回 verification_url 与 login_id；把链接（或二维码）交给用户，在其确认完成后调用 feishu_auth（action=login_wait, login_id=...）等待结果（最长 600 秒）。',
  '执行命令：feishu_cli 的参数是 lark-cli 之后的 argv 字符串，例如 "im +messages-send --chat-id oc_xxx --text 你好"、"calendar +agenda"、"docs +search --query 周报"、"schema im.messages.create"。先 --help 浏览域命令，或 schema 查参数、权限与示例；高层 +shortcut 优先于原始 API。',
  '结果判断：默认 JSON 输出，成功信封 ok==true；失败写 stderr，退出码非 0。退出码 10 表示高风险写操作（high-risk-write），必须先向用户确认，然后在命令后加 --yes 重试。',
  '路径参数只接受当前会话工作目录下的相对路径；需要别的目录时用 feishu_cli 的 cwd 参数。',
].join('\n')

/* ------------------------------------------------------------------ */
/* 通用小工具                                                          */
/* ------------------------------------------------------------------ */

function normalizeTimeoutMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(value)))
}

/** 超长文本截断并把全文写入临时文件。 */
function truncateBlock(text) {
  const value = String(text ?? '')
  if (value.length <= MAX_RENDER_CHARS) return value
  const fullPath = saveTempOutput(value, 'dsh-feishu-cli-output')
  return `${value.slice(0, MAX_RENDER_CHARS)}\n…（已截断，共 ${value.length} 字符；完整输出：${fullPath ?? '保存临时文件失败'}）`
}

function isJsonValue(value) {
  return value !== null && value !== undefined && typeof value === 'object'
}

/** DSH 工具输出要求 lossless JSON：递归移除 undefined（数组中的也移除）。 */
export function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map(stripUndefined)
  }
  if (value !== null && typeof value === 'object') {
    const output = {}
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) output[key] = stripUndefined(item)
    }
    return output
  }
  return value
}

/** 包装工具 execute：自动剥离 undefined，满足 DSH 的 lossless JSON 约束。 */
function losslessTool(tool) {
  const execute = tool.execute
  return {
    ...tool,
    async execute(args, exec) {
      return stripUndefined(await execute(args, exec))
    },
  }
}

function validateCwd(raw, fallback = PLUGIN_ROOT) {
  if (raw === undefined || raw === null) return { ok: true, cwd: fallback }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'cwd 必须是非空字符串路径' }
  }
  const cwd = raw.trim()
  try {
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      return { ok: false, error: `cwd 不存在或不是目录：${cwd}` }
    }
  } catch {
    return { ok: false, error: `无法访问 cwd：${cwd}` }
  }
  return { ok: true, cwd }
}

/* ------------------------------------------------------------------ */
/* 工具 1：feishu_cli                                                  */
/* ------------------------------------------------------------------ */

const FEISHU_CLI_DESCRIPTION = [
  '执行飞书官方 CLI（lark-cli 1.0.98）的任意命令。覆盖消息 im、云文档 docs、多维表格 base、电子表格 sheets、日历 calendar、邮箱 mail、任务 task、会议 vc、OKR、审批 approval、通讯录 contact、云空间 drive、知识库 wiki、妙搭 apps 等 18 个业务域、200+ 高层命令（+shortcut）以及全量 OpenAPI（lark-cli api GET /open-apis/...）。',
  '',
  '用法要点：',
  '- 先用 `<domain> --help` 浏览命令，或用 `schema <service.resource.method>` 查参数 / 权限 / 示例；优先使用 +shortcut。',
  '- 示例：`im +messages-send --chat-id oc_xxx --text 你好`、`calendar +agenda`、`docs +search --query 周报`、`base +records-list --app-token xxx --table-id tblxxx`、`api GET /open-apis/calendar/v4/calendars`。',
  '- 默认输出 JSON：成功判断 ok==true；错误写 stderr，退出码非 0。',
  '- 退出码 10 = 高风险写操作（high-risk-write）：先向用户确认，再在命令后加 --yes 重试。',
  '- 路径参数只接受当前工作目录下的相对路径（默认当前会话工作目录，可用 cwd 指定其它目录）。',
  '- 未登录时先让用户在 Web UI「飞书 CLI」面板完成登录，或调用 feishu_auth（action=login_start）。',
].join('\n')

function feishuCliTool() {
  return {
    name: 'feishu_cli',
    description: FEISHU_CLI_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'lark-cli 之后的完整 argv 字符串（不含可执行文件名），例如 "im +messages-send --chat-id oc_xxx --text 你好" 或 "calendar +agenda"。支持引号；不经过 shell。',
        },
        cwd: {
          type: 'string',
          description: '可选：命令的工作目录，默认当前会话工作目录。CLI 的路径参数只接受该目录下的相对路径。',
        },
        timeout_ms: {
          type: 'integer',
          description: '可选：超时毫秒，默认 120000，范围 1000–600000。',
        },
        stdin: {
          type: 'string',
          description: '可选：写入子进程 stdin 的内容（如 --app-secret-stdin 场景）。',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', description: '命令是否成功（退出码 0）' },
          command: { type: 'string' },
          timedOut: { type: 'boolean' },
        },
        required: ['ok', 'command'],
      },
      render: renderFeishuCli,
    },
    async execute(args, exec) {
      const command = typeof args?.command === 'string' ? args.command.trim() : ''
      if (command === '') {
        return {
          ok: false,
          command: '',
          exitCode: null,
          stdout: '',
          stderr: '',
          parsed: null,
          timedOut: false,
          inputError: 'command 不能为空字符串',
        }
      }

      const sessionCwd = exec?.agent?.session?.header?.cwd
      const cwdCheck = validateCwd(
        args?.cwd,
        typeof sessionCwd === 'string' && sessionCwd !== '' ? sessionCwd : PLUGIN_ROOT,
      )
      if (!cwdCheck.ok) {
        return {
          ok: false,
          command,
          exitCode: null,
          stdout: '',
          stderr: '',
          parsed: null,
          timedOut: false,
          inputError: cwdCheck.error,
        }
      }

      let timeoutMs
      if (args?.timeout_ms !== undefined && args?.timeout_ms !== null) {
        const normalized = normalizeTimeoutMs(args.timeout_ms)
        if (normalized === null) {
          return {
            ok: false,
            command,
            exitCode: null,
            stdout: '',
            stderr: '',
            parsed: null,
            timedOut: false,
            inputError: 'timeout_ms 必须是数字（1000–600000 毫秒）',
          }
        }
        timeoutMs = normalized
      }

      const stdin = typeof args?.stdin === 'string' ? args.stdin : undefined
      const result = await runCliLine(command, {
        cwd: cwdCheck.cwd,
        timeoutMs,
        stdin,
        signal: exec?.signal,
      })
      const parsedRaw = parseJsonValue(result.stdout)
      const parsed = isJsonValue(parsedRaw) ? parsedRaw : null
      return {
        ok: result.exitCode === 0,
        command,
        exitCode: result.exitCode,
        stdout: redactSecrets(result.stdout),
        stderr: redactSecrets(result.stderr),
        parsed,
        timedOut: result.timedOut === true,
        aborted: result.aborted === true,
        spawnError: result.spawnError === true,
      }
    },
  }
}

function renderFeishuCli(args, value) {
  const lines = []
  lines.push(`命令：lark-cli ${value?.command ?? args?.command ?? ''}`)

  if (value?.inputError) {
    lines.push(`参数错误：${value.inputError}`)
  }

  const exitCode = value?.exitCode
  if (exitCode === null || exitCode === undefined) {
    const reason = value?.timedOut ? '执行超时，已终止' : value?.spawnError ? '无法启动进程' : '未执行'
    lines.push(`退出码：无（${reason}）`)
  } else {
    lines.push(`退出码：${exitCode}${exitCode === 0 ? '（成功）' : ''}`)
  }

  if (value?.timedOut) {
    lines.push('提示：命令在超时前未结束，已终止。需要更长等待时可用 timeout_ms 参数（上限 600000 毫秒）。')
  }
  if (value?.aborted) {
    lines.push('提示：命令已被取消。')
  }
  if (value?.spawnError) {
    lines.push('提示：未能启动 lark-cli，请检查插件 vendor/lark-cli.exe 是否完整，或配置 cliPath。')
  }
  if (exitCode === 10) {
    lines.push('提示：退出码 10 = 高风险写操作（high-risk-write）。已拒绝执行，需先向用户确认，再在原命令后加 --yes 重试。')
  }

  if (value?.parsed !== null && value?.parsed !== undefined) {
    lines.push('', '结构化结果（JSON）：', truncateBlock(JSON.stringify(value.parsed, null, 2)))
  } else if (String(value?.stdout ?? '').trim() !== '') {
    lines.push('', 'stdout：', truncateBlock(value.stdout))
  }

  if (String(value?.stderr ?? '').trim() !== '') {
    lines.push('', 'stderr：', truncateBlock(value.stderr))
  }

  if (exitCode !== 0 && (value?.parsed === null || value?.parsed === undefined) && String(value?.stderr ?? '').trim() === '') {
    lines.push('', '提示：命令未成功且没有输出，请检查参数拼写；可用 `<command> --help` 查看合法参数。')
  }

  return [{ type: 'text', text: lines.join('\n') }]
}

/* ------------------------------------------------------------------ */
/* 工具 2：feishu_auth                                                 */
/* ------------------------------------------------------------------ */

const AUTH_ACTIONS = ['status', 'login_start', 'login_wait', 'login_cancel', 'logout', 'list']

const IDENTITY_ZH = {
  user: '用户身份（user）',
  bot: '应用身份（bot）',
  none: '未登录',
}

function feishuAuthTool() {
  return {
    name: 'feishu_auth',
    description: [
      '管理飞书 CLI 的登录状态。',
      'action：',
      '- status：查看 CLI 是否可用、应用是否已配置、当前登录身份与已登录用户，以及最近的登录会话；',
      '- login_start：发起流程。mode=init 创建/初始化飞书应用（用户扫码或打开链接完成配置）；mode=login 登录飞书账号（默认申请全部业务域，可用 domains 指定，如 ["calendar","task"]）。返回 verification_url、login_id、二维码与 device code 提示；',
      '- login_wait：传 login_id 阻塞等待用户完成授权（最长 600 秒），返回成功/失败；',
      '- login_cancel：取消一个进行中的登录/初始化会话（传 login_id）；',
      '- logout：退出登录；',
      '- list：列出已登录用户。',
      '典型流程：status →（未配置）login_start(mode=init) → 用户扫码 → 再 status →（未登录）login_start(mode=login) → 把链接给用户 → login_wait。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: AUTH_ACTIONS,
          description: 'status=查状态；login_start=发起登录/初始化；login_wait=等待登录完成；logout=退出；list=已登录用户。',
        },
        mode: {
          type: 'string',
          enum: ['init', 'login'],
          description: "login_start 用：init=初始化飞书应用（config init --new）；login=登录账号（device flow）。默认 login。",
        },
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'login_start（mode=login）可选：只申请这些业务域，如 ["calendar","task"]；不传则申请全部域。',
        },
        login_id: {
          type: 'string',
          description: 'login_wait / login_cancel 必填：login_start 返回的 login.id。',
        },
        timeout_ms: {
          type: 'integer',
          description: 'login_wait 可选：等待上限毫秒，默认/最长 600000。',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['ok', 'action'],
      },
      render: renderFeishuAuth,
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action.trim() : ''
      if (!AUTH_ACTIONS.includes(action)) {
        return {
          ok: false,
          action: action || '',
          error: `action 必须是 ${AUTH_ACTIONS.join(' / ')} 之一`,
        }
      }

      try {
        if (action === 'status') {
          const state = await getState()
          return { ok: true, action, state }
        }

        if (action === 'list') {
          const state = await getState()
          return {
            ok: true,
            action,
            users: state.auth.users,
            identities: state.auth,
            error: state.auth.error,
          }
        }

        if (action === 'login_start') {
          const mode = args?.mode === 'init' ? 'init' : args?.mode === 'login' ? 'login' : 'login'
          let domains = []
          if (args?.domains !== undefined && args?.domains !== null) {
            if (!Array.isArray(args.domains) || args.domains.some((item) => typeof item !== 'string' || item.trim() === '')) {
              return { ok: false, action, error: 'domains 必须是字符串数组' }
            }
            domains = args.domains.map((item) => item.trim())
          }
          const login = await startLogin(mode, { domains, recommend: mode === 'login' })
          const internal = getLoginManager().get(login.id)
          return {
            ok: true,
            action,
            login,
            deviceCode: internal?.deviceCode,
          }
        }

        if (action === 'login_wait') {
          const loginId = typeof args?.login_id === 'string' ? args.login_id.trim() : ''
          if (loginId === '') {
            return { ok: false, action, error: 'login_wait 需要 login_id 参数' }
          }
          const timeoutMs = normalizeTimeoutMs(args?.timeout_ms) ?? 600_000
          const login = await waitLogin(loginId, timeoutMs)
          if (!login) {
            return { ok: false, action, error: `登录会话不存在：${loginId}` }
          }
          return {
            ok: login.status === 'completed',
            action,
            login,
            error: login.status === 'failed' ? login.message : undefined,
          }
        }

        if (action === 'login_cancel') {
          const loginId = typeof args?.login_id === 'string' ? args.login_id.trim() : ''
          if (loginId === '') {
            return { ok: false, action, error: 'login_cancel 需要 login_id 参数' }
          }
          const login = cancelLogin(loginId)
          if (!login) {
            return { ok: false, action, error: `登录会话不存在：${loginId}` }
          }
          return { ok: true, action, login }
        }

        // logout
        const result = await logout()
        return {
          ok: result.ok,
          action,
          message: result.ok ? result.message : undefined,
          error: result.ok ? undefined : result.error,
        }
      } catch (error) {
        return { ok: false, action, error: String(error?.message ?? error) }
      }
    },
  }
}

function renderFeishuAuth(args, value) {
  const action = value?.action ?? args?.action ?? ''
  const lines = []

  if (!value?.ok) {
    lines.push(`操作失败（${action}）：${value?.error ?? value?.message ?? '未知错误'}`)
    const login = value?.login
    if (login) {
      if (login.status === 'failed') lines.push(`失败原因：${login.message ?? '未知'}`)
      else if (login.status === 'pending' && login.message) lines.push(`当前状态：${login.message}`)
    }
    if (value?.state) lines.push(...renderStateLines(value.state))
    return [{ type: 'text', text: lines.join('\n') }]
  }

  if (action === 'status') {
    lines.push(...renderStateLines(value.state))
  } else if (action === 'list') {
    const users = Array.isArray(value.users) ? value.users : []
    if (users.length === 0) {
      lines.push('还没有已登录的飞书用户。')
      if (value.error) lines.push(`说明：${value.error}`)
    } else {
      lines.push(`已登录用户（${users.length}）：`)
      for (const user of users) {
        lines.push(`· ${user.userName || '(未命名)'}（${user.userOpenId || '?'}），token 状态：${user.tokenStatus || '未知'}`)
      }
    }
  } else if (action === 'login_start') {
    const login = value.login ?? {}
    lines.push(`已发起${login.mode === 'init' ? '飞书应用初始化' : '飞书账号登录'}（会话 ${login.id ?? '?'}，状态 ${login.status ?? '?'}）。`)
    if (login.url) lines.push(`授权链接：${login.url}`)
    if (login.qrDataUrl) lines.push('二维码：已生成（可直接在 Web UI 的「飞书 CLI」面板扫码；也可把链接发给用户）。')
    if (login.message) lines.push(`说明：${login.message}`)
    if (value.deviceCode) lines.push(`device code：${value.deviceCode}（需要手动完成时可用 auth login --device-code 续传）`)
    lines.push(login.mode === 'init'
      ? '下一步：请用户在浏览器打开链接或扫码完成应用配置；完成后插件会自动保存配置并结束会话。'
      : '下一步：请用户在浏览器打开链接或扫码完成授权，然后调用 feishu_auth（action=login_wait，login_id=' + (login.id ?? '<id>') + '）等待结果。')
  } else if (action === 'login_wait') {
    const login = value.login ?? {}
    if (login.status === 'completed') {
      lines.push(`登录完成${login.userName ? `：${login.userName}` : ''}。`)
      if (login.message) lines.push(login.message)
    } else if (login.status === 'failed') {
      lines.push(`登录失败：${login.message ?? '未知原因'}`)
    } else if (login.status === 'cancelled') {
      lines.push('登录已取消。')
    } else {
      lines.push('仍在等待用户完成授权；可再次调用 login_wait 继续等待。')
      if (login.message) lines.push(login.message)
    }
  } else if (action === 'login_cancel') {
    const login = value.login ?? {}
    lines.push(login.status === 'cancelled' ? '已取消登录流程。' : `登录流程当前状态：${login.status ?? '未知'}。`)
  } else if (action === 'logout') {
    lines.push(value.message ?? '已退出登录。')
  } else {
    lines.push(JSON.stringify(value, null, 2))
  }

  return [{ type: 'text', text: lines.join('\n') }]
}

/** state → 中文摘要行。 */
function renderStateLines(state) {
  const lines = []
  if (!state) return ['（无状态数据）']
  const cli = state.cli ?? {}
  if (cli.available) {
    lines.push(`飞书 CLI：已就绪（${cli.path}${cli.bundled ? '，插件内置' : ''}，版本 ${cli.version ?? '未知'}）`)
  } else {
    lines.push('飞书 CLI：不可用（未找到 lark-cli 可执行文件）')
  }

  const config = state.config ?? {}
  if (config.configured) {
    const bits = []
    if (config.appId) bits.push(`App ID ${config.appId}`)
    if (config.brand) bits.push(`品牌 ${config.brand}`)
    if (config.profile) bits.push(`profile ${config.profile}`)
    if (config.users) bits.push(`已登录用户 ${config.users}`)
    lines.push(`应用配置：已配置${bits.length ? `（${bits.join('，')}）` : ''}`)
  } else {
    lines.push(`应用配置：未配置${config.error ? `（${config.error}）` : ''}`)
  }

  const auth = state.auth ?? {}
  if (auth.loggedIn) {
    const bits = []
    if (auth.userName) bits.push(auth.userName)
    if (auth.openId) bits.push(auth.openId)
    if (typeof auth.scopeCount === 'number') bits.push(`${auth.scopeCount} 个权限域`)
    if (auth.expiresAt) bits.push(`有效期至 ${auth.expiresAt}`)
    lines.push(`登录身份：${IDENTITY_ZH.user}${bits.length ? `（${bits.join('，')}）` : ''}`)
  } else if (auth.identity === 'bot') {
    lines.push(`登录身份：${IDENTITY_ZH.bot}${auth.appName ? `（${auth.appName}）` : ''}；用户身份未登录`)
  } else {
    lines.push('登录身份：未登录（none）')
  }
  if (auth.error) lines.push(`登录状态说明：${auth.error}`)

  const users = Array.isArray(auth.users) ? auth.users : []
  if (users.length > 0) {
    lines.push(`已登录用户（${users.length}）：`)
    for (const user of users) {
      lines.push(`· ${user.userName || '(未命名)'}（${user.userOpenId || '?'}），token 状态：${user.tokenStatus || '未知'}`)
    }
  }

  const login = state.login
  if (login) {
    lines.push(`最近登录会话：${login.mode === 'init' ? '应用初始化' : '账号登录'}，状态 ${login.status}${login.message ? `，${login.message}` : ''}`)
    if (login.url && login.status === 'pending') lines.push(`授权链接：${login.url}`)
  }

  return lines
}

/* ------------------------------------------------------------------ */
/* 插件生命周期                                                        */
/* ------------------------------------------------------------------ */

/**
 * 安装插件。
 * @param {object} ctx cordis 上下文
 * @param {{cliPath?:string, defaultTimeoutMs?:number}} [config]
 */
export function apply(ctx, config = {}) {
  configure({
    cliPath: config?.cliPath,
    defaultTimeoutMs: config?.defaultTimeoutMs,
  })

  const manager = getLoginManager()
  ctx.effect(() => () => {
    try { manager.dispose() } catch { /* ignore */ }
  }, 'feishu-cli: login lifecycle')

  ctx.effect(() => ctx.tools.register(losslessTool(feishuCliTool())), 'feishu-cli: feishu_cli tool')
  ctx.effect(() => ctx.tools.register(losslessTool(feishuAuthTool())), 'feishu-cli: feishu_auth tool')

  ctx.inject(['systemPrompt'], (webCtx) => {
    webCtx.effect(() => webCtx.systemPrompt.section({
      name: 'feishu-cli',
      order: 720,
      interpolate: false,
      text: SYSTEM_PROMPT_TEXT,
    }), 'feishu-cli: system prompt')
  })

  ctx.inject(['webServer'], (webCtx) => {
    installApi(webCtx)
  })
}

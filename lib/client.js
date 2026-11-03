/**
 * dsh-feishu-cli · Web Client half
 *
 * Plain browser JavaScript module for the DeepSeek Harness module loader.
 * No JSX / TypeScript / imports: everything is built with React.createElement.
 * Host contract: lib/api.js exposes /feishu-cli/api/*; this file only talks to
 * that contract through relative fetch() calls.
 *
 * Every user-visible string lives in ZH_DICT / EN_DICT below and is rendered
 * through the Harness locale service, so the panel follows the active
 * language. Both dictionaries must stay in sync: they share exactly the same
 * keys. Product names (Feishu / lark-cli / CLI / App ID / Open ID) are kept
 * untranslated inside the values.
 */
window.__ModuleLoader__.load({
  id: "dsh-feishu-cli",
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    /* ------------------------------------------------------------------ */
    /* Constants                                                          */
    /* ------------------------------------------------------------------ */

    const LOCALE_NS = 'feishu-cli'
    const STATE_URL = '/feishu-cli/api/state'
    const LOGIN_START_URL = '/feishu-cli/api/login/start'
    const LOGOUT_URL = '/feishu-cli/api/logout'
    const RUN_URL = '/feishu-cli/api/run'
    const INSTALL_URL = '/feishu-cli/api/cli/install'
    const STATE_POLL_MS = 15000
    const LOGIN_POLL_MS = 2000
    const INSTALL_POLL_MS = 1500

    const QUICK_COMMAND_KEYS = [
      'chips.calendar',
      'chips.task',
      'chips.chats',
      'chips.docsSearch',
      'chips.authStatus',
      'chips.help',
    ]

    const SCOPE_OPTIONS = [
      { value: 'all', labelKey: 'scope.all', recommend: true },
      { value: 'im', labelKey: 'scope.im', domains: ['im'] },
      { value: 'calendar', labelKey: 'scope.calendar', domains: ['calendar'] },
      { value: 'docs', labelKey: 'scope.docs', domains: ['docs', 'drive', 'markdown'] },
      { value: 'base', labelKey: 'scope.base', domains: ['base'] },
      { value: 'sheets', labelKey: 'scope.sheets', domains: ['sheets'] },
      { value: 'mail', labelKey: 'scope.mail', domains: ['mail'] },
      { value: 'task', labelKey: 'scope.task', domains: ['task'] },
      { value: 'vc', labelKey: 'scope.vc', domains: ['vc', 'minutes', 'note'] },
      { value: 'contact', labelKey: 'scope.contact', domains: ['contact'] },
    ]

    const SUCCESS_STATUSES = ['success', 'succeeded', 'completed', 'complete', 'done', 'ok', 'authorized', 'authorised']

    const INSTALL_PHASES = ['idle', 'download', 'verify', 'extract', 'install', 'done', 'error']

    /* ------------------------------------------------------------------ */
    /* Locale dictionaries                                                */
    /* ------------------------------------------------------------------ */

    const ZH_DICT = {
      'sidebar.label': '飞书',
      'app.title': '飞书 CLI',
      'app.subtitle': '官方 CLI · 18 大业务域 · 2000+ OpenAPI',

      'common.processing': '处理中…',
      'common.refresh': '刷新',
      'common.refreshStatus': '刷新状态',
      'common.reload': '重新加载',
      'common.retry': '重试',
      'common.cancel': '取消',
      'common.dismiss': '关闭提示',
      'common.requestFailed': '请求失败',
      'common.appPrefix': '应用：',

      'status.cliMissing': '未找到 CLI',
      'status.installingCli': '正在安装 CLI',
      'status.notInitialized': '未初始化应用',
      'status.loggedInPrefix': '已登录 · ',
      'status.notLoggedIn': '未登录',
      'status.unknownUser': '未知用户',

      'install.title': 'CLI 未安装',
      'install.desc': '首次使用会自动下载官方 lark-cli（约 50 MB），安装完成后即可登录飞书账号。',
      'install.download': '下载并安装飞书 CLI',
      'install.recheck': '重新检查',
      'install.retry': '重试下载',
      'install.starting': '正在启动…',
      'install.installingTitle': '正在安装飞书 CLI',
      'install.failedTitle': 'CLI 安装失败',
      'install.failedDesc': '下载或安装过程出错，请重试；若多次失败，请检查网络或代理设置。',
      'install.progressLabel': '安装进度',
      'install.phase.idle': '准备中…',
      'install.phase.download': '下载中…',
      'install.phase.verify': '校验中…',
      'install.phase.extract': '解压中…',
      'install.phase.install': '安装中…',
      'install.phase.done': '安装完成',
      'install.phase.error': '安装失败',
      'install.sizeReceived': '已下载 ',
      'install.sizeTotal': ' / 共 ',
      'install.waitHint': '安装过程中请保持此页面打开。',
      'install.configuredPath': '当前配置的路径：',
      'install.pathHint': '请确认该文件存在；也可以重新下载安装，或设置环境变量 LARK_CLI_BIN 指向已有的 lark-cli。',

      'init.title': '第 1 步 · 初始化飞书应用',
      'init.desc': '首次使用需要创建一个飞书应用并授权，点下面按钮后扫码即可，约 1 分钟。',
      'init.button': '初始化飞书应用（约 1 分钟）',

      'login.title': '登录飞书账号',
      'login.desc': '点击后展示二维码，用飞书 App 扫码并在手机上确认授权。',
      'login.button': '点击登录飞书账号',
      'login.inProgress': '已有登录流程进行中，请先完成或取消下方登录。',
      'login.scopeLabel': '权限范围',
      'login.brandPrefix': '品牌：',
      'login.statusQueryFailed': '登录状态查询失败，请重试',
      'login.resultSignedIn': '已登录 ',
      'login.resultSuccess': '登录成功',
      'login.resultFailed': '登录失败，请重试',
      'login.startFailed': '启动登录失败',

      'scope.all': '全部常用权限（默认，--recommend）',
      'scope.im': '消息与群聊(im)',
      'scope.calendar': '日历(calendar)',
      'scope.docs': '云文档(docs,drive,markdown)',
      'scope.base': '多维表格(base)',
      'scope.sheets': '电子表格(sheets)',
      'scope.mail': '邮箱(mail)',
      'scope.task': '任务(task)',
      'scope.vc': '会议(vc,minutes,note)',
      'scope.contact': '通讯录(contact)',

      'account.title': '已登录飞书账号',
      'account.desc': '当前账号已授权，可以直接在下方控制台执行 lark-cli 命令。',
      'account.logout': '退出登录',
      'account.unknownUser': '飞书用户',
      'account.scopeCountPrefix': '已授权 ',
      'account.scopeCountSuffix': ' 项权限',
      'account.scopeUnknown': '权限信息未知',
      'account.expiresPrefix': '过期时间 ',
      'account.appNamePrefix': '应用名：',
      'account.logoutConfirm': '确定退出当前飞书账号？',
      'account.logoutConfirmYes': '确认退出',
      'account.logoutFailed': '退出登录失败',

      'qr.titleInit': '正在创建飞书应用',
      'qr.titleLogin': '扫描二维码登录',
      'qr.waitInit': '等待你在浏览器完成应用创建…',
      'qr.waitLogin': '等待你在浏览器/手机上完成授权…',
      'qr.alt': '飞书登录二维码',
      'qr.preparing': '二维码准备中，也可使用下方链接',
      'qr.scanHint': '用飞书 App 扫码，或打开链接',
      'qr.copyLink': '点击复制链接',
      'qr.noUrl': '暂未获取到登录链接，请稍候…',
      'qr.startedPrefix': '开始于 ',
      'qr.copied': '已复制登录链接',
      'qr.copyFailed': '自动复制失败，请手动选择并复制上方链接',

      'console.title': '命令控制台',
      'console.desc': '等价于终端执行 lark-cli …',
      'console.placeholder': '例如 im +messages-send --chat-id oc_xxx --text 你好',
      'console.inputLabel': 'lark-cli 命令',
      'console.run': '运行',
      'console.runTitle': '运行命令',
      'console.cliMissingTitle': '未找到 lark-cli 可执行文件',
      'console.emptyCommand': '请输入要执行的命令',
      'console.noOutput': '(无输出)',
      'console.notRun': '未执行',
      'console.failed': '命令执行失败',

      'chips.calendar': 'calendar +agenda',
      'chips.task': 'task +list',
      'chips.chats': 'im +chats-list',
      'chips.docsSearch': 'docs +search --query 周报',
      'chips.authStatus': 'auth status --json',
      'chips.help': '--help',

      'footer.prefix': 'Agent 也可以直接调用 ',
      'footer.middle': ' 工具执行任意 lark-cli 命令；详细技能：',

      'skeleton.loading': '正在读取飞书状态…',
      'loadError.title': '无法读取飞书状态',
      'loadError.refreshPrefix': '状态刷新失败：',

      'errors.stateInvalid': '状态接口返回异常',
      'errors.installFailed': '无法开始安装',
    }

    const EN_DICT = {
      'sidebar.label': 'Feishu',
      'app.title': 'Feishu CLI',
      'app.subtitle': 'Official CLI · 18 business domains · 2000+ OpenAPIs',

      'common.processing': 'Working…',
      'common.refresh': 'Refresh',
      'common.refreshStatus': 'Refresh status',
      'common.reload': 'Reload',
      'common.retry': 'Retry',
      'common.cancel': 'Cancel',
      'common.dismiss': 'Dismiss',
      'common.requestFailed': 'Request failed',
      'common.appPrefix': 'App: ',

      'status.cliMissing': 'CLI not found',
      'status.installingCli': 'Installing CLI',
      'status.notInitialized': 'App not initialized',
      'status.loggedInPrefix': 'Signed in · ',
      'status.notLoggedIn': 'Not signed in',
      'status.unknownUser': 'Unknown user',

      'install.title': 'CLI not installed',
      'install.desc': 'The official lark-cli (about 50 MB) is downloaded automatically on first use. Once installed you can sign in to Feishu.',
      'install.download': 'Download and install Feishu CLI',
      'install.recheck': 'Check again',
      'install.retry': 'Retry download',
      'install.starting': 'Starting…',
      'install.installingTitle': 'Installing Feishu CLI',
      'install.failedTitle': 'CLI installation failed',
      'install.failedDesc': 'The download or installation failed. Please retry; if it keeps failing, check your network or proxy settings.',
      'install.progressLabel': 'Installation progress',
      'install.phase.idle': 'Preparing…',
      'install.phase.download': 'Downloading…',
      'install.phase.verify': 'Verifying…',
      'install.phase.extract': 'Extracting…',
      'install.phase.install': 'Installing…',
      'install.phase.done': 'Installation complete',
      'install.phase.error': 'Installation failed',
      'install.sizeReceived': 'Downloaded ',
      'install.sizeTotal': ' of ',
      'install.waitHint': 'Keep this page open while the installation runs.',
      'install.configuredPath': 'Configured path: ',
      'install.pathHint': 'Make sure that file exists; you can also download the CLI again, or set LARK_CLI_BIN to an existing lark-cli binary.',

      'init.title': 'Step 1 · Initialize the Feishu app',
      'init.desc': 'First-time setup creates a Feishu app and authorizes it. Click the button below and scan the QR code; it takes about a minute.',
      'init.button': 'Initialize Feishu app (about 1 minute)',

      'login.title': 'Sign in to Feishu',
      'login.desc': 'A QR code appears after you click; scan it with the Feishu app and confirm on your phone.',
      'login.button': 'Sign in to Feishu',
      'login.inProgress': 'Another sign-in flow is in progress. Finish or cancel it below first.',
      'login.scopeLabel': 'Permission scope',
      'login.brandPrefix': 'Brand: ',
      'login.statusQueryFailed': 'Failed to query sign-in status. Please retry.',
      'login.resultSignedIn': 'Signed in as ',
      'login.resultSuccess': 'Signed in',
      'login.resultFailed': 'Sign-in failed. Please retry.',
      'login.startFailed': 'Failed to start sign-in',

      'scope.all': 'All common scopes (default, --recommend)',
      'scope.im': 'Messages and chats (im)',
      'scope.calendar': 'Calendar (calendar)',
      'scope.docs': 'Docs (docs,drive,markdown)',
      'scope.base': 'Base (base)',
      'scope.sheets': 'Sheets (sheets)',
      'scope.mail': 'Mail (mail)',
      'scope.task': 'Tasks (task)',
      'scope.vc': 'Meetings (vc,minutes,note)',
      'scope.contact': 'Contacts (contact)',

      'account.title': 'Signed in to Feishu',
      'account.desc': 'This account is authorized. You can run lark-cli commands in the console below.',
      'account.logout': 'Sign out',
      'account.unknownUser': 'Feishu user',
      'account.scopeCountPrefix': 'Granted ',
      'account.scopeCountSuffix': ' permissions',
      'account.scopeUnknown': 'Permission details unavailable',
      'account.expiresPrefix': 'Expires ',
      'account.appNamePrefix': 'App name: ',
      'account.logoutConfirm': 'Sign out of the current Feishu account?',
      'account.logoutConfirmYes': 'Sign out',
      'account.logoutFailed': 'Failed to sign out',

      'qr.titleInit': 'Creating Feishu app',
      'qr.titleLogin': 'Scan the QR code to sign in',
      'qr.waitInit': 'Waiting for you to create the app in the browser…',
      'qr.waitLogin': 'Waiting for you to authorize in the browser or on your phone…',
      'qr.alt': 'Feishu sign-in QR code',
      'qr.preparing': 'Preparing the QR code; you can also use the link below',
      'qr.scanHint': 'Scan with the Feishu app, or open the link',
      'qr.copyLink': 'Click to copy the link',
      'qr.noUrl': 'No sign-in link yet. Please wait…',
      'qr.startedPrefix': 'Started at ',
      'qr.copied': 'Sign-in link copied',
      'qr.copyFailed': 'Copy failed. Please select and copy the link above manually.',

      'console.title': 'Command console',
      'console.desc': 'Same as running lark-cli … in a terminal',
      'console.placeholder': 'For example im +messages-send --chat-id oc_xxx --text hello',
      'console.inputLabel': 'lark-cli command',
      'console.run': 'Run',
      'console.runTitle': 'Run command',
      'console.cliMissingTitle': 'lark-cli executable not found',
      'console.emptyCommand': 'Enter a command to run',
      'console.noOutput': '(no output)',
      'console.notRun': 'Not run',
      'console.failed': 'Command failed',

      'chips.calendar': 'calendar +agenda',
      'chips.task': 'task +list',
      'chips.chats': 'im +chats-list',
      'chips.docsSearch': 'docs +search --query report',
      'chips.authStatus': 'auth status --json',
      'chips.help': '--help',

      'footer.prefix': 'The agent can also call the ',
      'footer.middle': ' tool to run any lark-cli command; useful skills: ',

      'skeleton.loading': 'Reading Feishu status…',
      'loadError.title': 'Unable to read Feishu status',
      'loadError.refreshPrefix': 'Status refresh failed: ',

      'errors.stateInvalid': 'Unexpected state response',
      'errors.installFailed': 'Unable to start the installation',
    }

    function defaultTranslate(key) {
      if (typeof key !== 'string') return ''
      return Object.prototype.hasOwnProperty.call(ZH_DICT, key) ? ZH_DICT[key] : key
    }

    /* ------------------------------------------------------------------ */
    /* Styles (theme tokens only; injected as a React <style> child)      */
    /* ------------------------------------------------------------------ */

    const CSS_TEXT = `
.fcli-root {
  width: 100%;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  -webkit-font-smoothing: antialiased;
}
.fcli-root * { box-sizing: border-box; }
.fcli-inner {
  max-width: 880px;
  margin: 0 auto;
  padding: 28px 32px 48px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.fcli-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.fcli-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.fcli-logo {
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, var(--dsw-alias-bg-layer-1));
  border: 1px solid var(--dsw-alias-border-l1);
}
.fcli-title { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: .01em; }
.fcli-sub { margin: 3px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.fcli-statusbar { display: flex; flex-wrap: wrap; gap: 8px; }
.fcli-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  font-size: 12px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.fcli-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
}
.fcli-dot--ok { background: var(--dsw-alias-state-success-primary); }
.fcli-dot--bad { background: var(--dsw-alias-state-error-primary); }
.fcli-dot--warn { background: var(--dsw-alias-state-warn-primary); }
.fcli-dot--brand { background: var(--dsw-alias-brand-primary); }
.fcli-card {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  padding: 20px;
}
.fcli-card--success {
  border-color: var(--dsw-alias-border-l1);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 42%, var(--dsw-alias-border-l1));
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, var(--dsw-alias-bg-layer-1));
}
.fcli-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.fcli-h2 { margin: 0; font-size: 15px; font-weight: 600; }
.fcli-desc {
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--dsw-alias-label-secondary);
}
.fcli-err {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 38%, var(--dsw-alias-border-l1));
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-state-error-primary);
  font-size: 12.5px;
  line-height: 1.55;
  word-break: break-word;
}
.fcli-alert {
  border: 1px solid var(--dsw-alias-border-l1);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 42%, var(--dsw-alias-border-l1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, var(--dsw-alias-bg-layer-1));
  padding: 20px;
}
.fcli-alert-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-state-error-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.fcli-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}
.fcli-btn {
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  padding: 9px 16px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, opacity .15s ease;
}
.fcli-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.fcli-btn:disabled { opacity: .55; cursor: not-allowed; }
.fcli-btn--primary {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
.fcli-btn--primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); filter: brightness(1.06); }
.fcli-btn--link {
  background: transparent;
  border-color: transparent;
  color: var(--dsw-alias-brand-primary);
  padding: 7px 8px;
}
.fcli-btn--danger-text {
  background: transparent;
  border-color: transparent;
  color: var(--dsw-alias-state-error-primary);
  padding: 7px 8px;
}
.fcli-btn--danger {
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-bg-base);
}
.fcli-btn:focus-visible,
.fcli-chipbtn:focus-visible,
.fcli-input:focus-visible,
.fcli-url:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.fcli-field { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; max-width: 420px; }
.fcli-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.fcli-select {
  font: inherit;
  font-size: 13px;
  padding: 9px 10px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  max-width: 100%;
  cursor: pointer;
}
.fcli-select:disabled { opacity: .55; cursor: not-allowed; }
.fcli-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.fcli-mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
.fcli-account { display: flex; align-items: center; gap: 14px; margin-top: 4px; min-width: 0; }
.fcli-avatar {
  width: 46px;
  height: 46px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  font-weight: 600;
  color: var(--dsw-alias-state-success-primary);
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 15%, var(--dsw-alias-bg-layer-2));
}
.fcli-account-name { font-size: 15px; font-weight: 600; line-height: 1.4; }
.fcli-account-id { margin-top: 2px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); word-break: break-all; }
.fcli-login { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 24px; margin-top: 18px; }
.fcli-qrbox {
  width: 220px;
  height: 220px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}
.fcli-qrbox img { display: block; width: 220px; height: 220px; }
.fcli-qr-empty { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.fcli-login-side { flex: 1 1 260px; min-width: 220px; }
.fcli-url {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  padding: 9px 11px;
  max-width: 460px;
  border-radius: 8px;
  border: 1px dashed var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  cursor: pointer;
}
.fcli-url:hover { border-color: var(--dsw-alias-brand-primary); }
.fcli-url-text { font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-primary); word-break: break-all; }
.fcli-url-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.fcli-statusline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
}
.fcli-pulse {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  animation: fcli-pulse 1.4s ease-in-out infinite;
}
@keyframes fcli-pulse {
  0%, 100% { opacity: .25; transform: scale(.8); }
  50% { opacity: 1; transform: scale(1); }
}
.fcli-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  font-size: 13px;
  line-height: 1.5;
}
.fcli-result--success {
  color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-border-l1);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 38%, var(--dsw-alias-border-l1));
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, var(--dsw-alias-bg-layer-1));
}
.fcli-result--error {
  color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-border-l1);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 38%, var(--dsw-alias-border-l1));
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, var(--dsw-alias-bg-layer-1));
}
.fcli-result-text { flex: 1 1 auto; min-width: 0; word-break: break-word; }
.fcli-iconbtn {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  opacity: .7;
}
.fcli-iconbtn:hover { opacity: 1; background: var(--dsw-alias-bg-layer-2); }
.fcli-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  font-size: 12.5px;
  color: var(--dsw-alias-label-primary);
}
.fcli-console-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.fcli-input {
  flex: 1 1 auto;
  min-width: 0;
  font: inherit;
  font-size: 13px;
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fcli-input::placeholder { color: var(--dsw-alias-label-secondary); opacity: .85; }
.fcli-input:focus { border-color: var(--dsw-alias-brand-primary); }
.fcli-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.fcli-chipbtn {
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.fcli-chipbtn:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.fcli-chipbtn:disabled { opacity: .55; cursor: not-allowed; }
.fcli-output { margin-top: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden; }
.fcli-output-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}
.fcli-output-cmd { min-width: 0; word-break: break-all; color: var(--dsw-alias-label-primary); }
.fcli-exit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  white-space: nowrap;
}
.fcli-exit--ok { color: var(--dsw-alias-state-success-primary); }
.fcli-exit--bad { color: var(--dsw-alias-state-error-primary); }
.fcli-output-body {
  margin: 0;
  padding: 12px;
  max-height: 320px;
  overflow: auto;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.fcli-output-empty { color: var(--dsw-alias-label-secondary); }
.fcli-skel {
  height: 13px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  animation: fcli-shimmer 1.4s ease-in-out infinite;
}
.fcli-skel + .fcli-skel { margin-top: 10px; }
@keyframes fcli-shimmer {
  0%, 100% { opacity: .45; }
  50% { opacity: 1; }
}
.fcli-footer {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
}
.fcli-inline-code {
  padding: 1px 5px;
  border-radius: 5px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
}
.fcli-card--install {
  border-color: var(--dsw-alias-border-l1);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, var(--dsw-alias-border-l1));
}
.fcli-progress {
  position: relative;
  height: 8px;
  margin-top: 16px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.fcli-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-brand-primary);
  transition: width .45s ease;
}
.fcli-progress-fill--indeterminate {
  width: 38%;
  animation: fcli-progress-slide 1.2s ease-in-out infinite;
}
@keyframes fcli-progress-slide {
  0% { margin-left: -40%; }
  100% { margin-left: 100%; }
}
@media (max-width: 640px) {
  .fcli-inner { padding: 20px 16px 36px; gap: 14px; }
  .fcli-card { padding: 16px; }
  .fcli-qrbox, .fcli-qrbox img { width: 200px; height: 200px; }
}
`


    /* ------------------------------------------------------------------ */
    /* Small presentational components                                    */
    /* ------------------------------------------------------------------ */

    function FeishuMark(props) {
      const size = props && typeof props.size === 'number' ? props.size : 22
      const active = !!(props && props.active)
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 64 64',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block' },
        },
        h('rect', {
          x: 2,
          y: 2,
          width: 60,
          height: 60,
          rx: 15,
          fill: active ? '#245BDB' : '#3370FF',
        }),
        h('path', {
          d:
            'M15 40c8.5 1.6 15.8-1.7 22.1-9.9 2.5-3.2 5.4-5.6 9.3-7.1-1.7 5.4-4.1 9.9-7.4 13.6-3.7 4.2-8.3 6.9-13.7 8.1 5.6 1.1 11.2.3 16.7-2.5l3.3 4.4c-7.1 4.1-14.4 5.1-21.9 3-3.2-.9-5.9-2.6-8.4-5.1L15 40Z',
          fill: '#FFFFFF',
        }),
        h('path', {
          d: 'M26.2 30.6c3.1-4.3 6.9-7.5 11.4-9.7l2.9 4.7c-3.9 1.6-7.1 4-9.7 7.2l-4.6-2.2Z',
          fill: '#FFFFFF',
          opacity: 0.9,
        }),
        h('circle', { cx: 44.5, cy: 18.5, r: 3, fill: '#FFFFFF' })
      )
    }

    function SidebarIcon(props) {
      const requested = props && typeof props.size === 'number' ? props.size : 20
      const size = Math.max(20, Math.min(22, requested))
      const active = !!(props && props.active)
      return h(FeishuMark, { size: size, active: active })
    }

    function Spinner() {
      return h('span', { className: 'fcli-pulse', 'aria-hidden': 'true' })
    }

    function StatusChip(props) {
      const tone = props && props.tone ? ' fcli-dot--' + props.tone : ''
      return h(
        'span',
        { className: 'fcli-chip', title: props && props.title ? props.title : undefined },
        h('span', { className: 'fcli-dot' + tone, 'aria-hidden': 'true' }),
        h('span', null, props && props.children)
      )
    }

    /* ------------------------------------------------------------------ */
    /* Pure helpers                                                      */
    /* ------------------------------------------------------------------ */

    function describeError(t, err) {
      if (!err) return t('common.requestFailed')
      if (err && err.serverMessage === true && typeof err.message === 'string' && err.message) {
        return err.message
      }
      if (err && typeof err.httpStatus === 'number') {
        return t('common.requestFailed') + ' (HTTP ' + err.httpStatus + ')'
      }
      if (err && typeof err.message === 'string' && err.message) return err.message
      return String(err)
    }

    async function readJsonResponse(t, res) {
      let data = null
      let text = ''
      try {
        text = await res.text()
      } catch (err) {
        text = ''
      }
      if (text) {
        try {
          data = JSON.parse(text)
        } catch (err) {
          data = null
        }
      }
      if (!res.ok) {
        const hasServerMessage = !!(data && typeof data === 'object' && (data.error || data.message))
        const message = hasServerMessage
          ? data.error || data.message
          : t('common.requestFailed') + ' (HTTP ' + res.status + ')'
        const error = new Error(String(message))
        error.httpStatus = res.status
        error.serverMessage = hasServerMessage
        throw error
      }
      return data
    }

    async function getJson(url) {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' })
      return readJsonResponse(defaultTranslate, res)
    }

    async function postJson(t, url, body) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      return readJsonResponse(t, res)
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value)
    }

    function formatDateTime(value) {
      if (value === null || value === undefined || value === '') return ''
      let date
      if (typeof value === 'number') {
        date = new Date(value < 1e12 ? value * 1000 : value)
      } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        const numeric = parseInt(value.trim(), 10)
        date = new Date(numeric < 1e12 ? numeric * 1000 : numeric)
      } else {
        date = new Date(value)
      }
      if (isNaN(date.getTime())) return String(value)
      return (
        date.getFullYear() +
        '-' +
        pad2(date.getMonth() + 1) +
        '-' +
        pad2(date.getDate()) +
        ' ' +
        pad2(date.getHours()) +
        ':' +
        pad2(date.getMinutes())
      )
    }

    function initialOf(name) {
      const text = typeof name === 'string' ? name.trim() : ''
      if (!text) return '?'
      return text.charAt(0).toUpperCase()
    }

    function loginStatusOf(login) {
      if (!login || typeof login.status !== 'string') return ''
      return login.status.toLowerCase()
    }

    function isPendingLogin(login) {
      return loginStatusOf(login) === 'pending'
    }

    function isSuccessStatus(status) {
      return SUCCESS_STATUSES.indexOf(status) !== -1
    }

    function findScope(value) {
      for (let i = 0; i < SCOPE_OPTIONS.length; i += 1) {
        if (SCOPE_OPTIONS[i].value === value) return SCOPE_OPTIONS[i]
      }
      return SCOPE_OPTIONS[0]
    }

    /* ---- install-state helpers ---- */

    function megabytes(bytes) {
      const value = Number(bytes)
      if (!isFinite(value) || value <= 0) return '0'
      return (value / (1024 * 1024)).toFixed(1)
    }

    function installPercent(progress) {
      if (!progress || typeof progress !== 'object') return null
      if (typeof progress.percent === 'number' && isFinite(progress.percent)) {
        return Math.max(0, Math.min(100, progress.percent))
      }
      if (
        typeof progress.receivedBytes === 'number' &&
        typeof progress.totalBytes === 'number' &&
        progress.totalBytes > 0
      ) {
        return Math.max(0, Math.min(100, (progress.receivedBytes / progress.totalBytes) * 100))
      }
      return null
    }

    function installPhaseKey(phase) {
      if (typeof phase !== 'string') return 'install.phase.idle'
      return INSTALL_PHASES.indexOf(phase) === -1 ? 'install.phase.idle' : 'install.phase.' + phase
    }

    /* ------------------------------------------------------------------ */
    /* Main panel                                                        */
    /* ------------------------------------------------------------------ */

    function FeishuPanel(props) {
      const t = props && typeof props.t === 'function' ? props.t : defaultTranslate

      const [state, setState] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [loadError, setLoadError] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [accountError, setAccountError] = React.useState('')
      const [consoleError, setConsoleError] = React.useState('')
      const [scope, setScope] = React.useState('all')
      const [confirmLogout, setConfirmLogout] = React.useState(false)
      const [loginResult, setLoginResult] = React.useState(null)
      const [command, setCommand] = React.useState('')
      const [output, setOutput] = React.useState(null)
      const [copyHint, setCopyHint] = React.useState('')
      const [installBusy, setInstallBusy] = React.useState(false)
      const [installRequestError, setInstallRequestError] = React.useState('')
      const inputRef = React.useRef(null)

      /* ---- derived view state ---- */
      const cli = (state && state.cli) || {}
      const config = (state && state.config) || {}
      const auth = (state && state.auth) || {}
      const login = (state && state.login) || null
      const pending = login && isPendingLogin(login) ? login : null
      const cliAvailable = cli.available === true
      const installing = cli.installing === true
      const installError =
        (typeof cli.installError === 'string' && cli.installError) || installRequestError || ''
      const actionsLocked = busy !== ''
      const loginStatus = login ? loginStatusOf(login) : ''
      const loginId = login && login.id ? String(login.id) : ''
      /* Installing has the highest priority: only one background interval
         runs at a time, so the 15s / 2s timers stay quiet while downloading. */
      const pollMode = !state ? 'none' : installing ? 'install' : pending ? 'login' : 'idle'

      /* ---- initial state load ---- */
      React.useEffect(() => {
        let cancelled = false
        getJson(STATE_URL)
          .then((data) => {
            if (cancelled) return
            if (data && data.ok === false) throw new Error(data.error || t('errors.stateInvalid'))
            setState(data)
            setLoadError('')
          })
          .catch((err) => {
            if (!cancelled) setLoadError(describeError(t, err))
          })
          .then(() => {
            if (!cancelled) setLoading(false)
          })
        return () => {
          cancelled = true
        }
      }, [])

      /* ---- background refresh: 15s only when idle ---- */
      React.useEffect(() => {
        if (pollMode !== 'idle') return undefined
        const timer = setInterval(() => {
          getJson(STATE_URL)
            .then((data) => {
              if (data && data.ok !== false) setState(data)
            })
            .catch(() => {})
        }, STATE_POLL_MS)
        return () => {
          clearInterval(timer)
        }
      }, [pollMode])

      /* ---- pending login polling: 2s, then settle ---- */
      React.useEffect(() => {
        if (pollMode !== 'login' || !loginId) return undefined
        const targetId = loginId
        let disposed = false
        let terminalHandled = false
        const timer = setInterval(async () => {
          if (disposed || terminalHandled) return
          try {
            const data = await getJson('/feishu-cli/api/login/' + encodeURIComponent(targetId))
            if (disposed || terminalHandled) return
            if (data && data.ok === false) {
              terminalHandled = true
              clearInterval(timer)
              try {
                const candidate = await getJson(STATE_URL)
                if (candidate && candidate.ok !== false) setState(candidate)
              } catch (err) {
                /* keep the previous state */
              }
              setLoginResult({ kind: 'error', text: data.error || t('login.statusQueryFailed') })
              return
            }
            const nextLogin = (data && data.login) || null
            if (!nextLogin || typeof nextLogin !== 'object') return
            setState((prev) => (prev ? Object.assign({}, prev, { login: nextLogin }) : prev))
            const status = loginStatusOf(nextLogin)
            if (status === 'pending') return
            terminalHandled = true
            clearInterval(timer)
            let fresh = null
            try {
              const candidate = await getJson(STATE_URL)
              if (candidate && candidate.ok !== false) fresh = candidate
            } catch (err) {
              fresh = null
            }
            if (fresh) {
              setState(fresh)
              setLoadError('')
            }
            if (status === 'cancelled' || status === 'canceled') {
              setLoginResult(null)
              return
            }
            const freshAuth = fresh && fresh.auth ? fresh.auth : null
            const signedIn = !!(freshAuth && freshAuth.loggedIn) || isSuccessStatus(status)
            if (signedIn) {
              const name = (freshAuth && freshAuth.userName) || nextLogin.userName || ''
              setLoginResult({
                kind: 'success',
                text: name ? t('login.resultSignedIn') + name : t('login.resultSuccess'),
              })
            } else {
              setLoginResult({
                kind: 'error',
                text: nextLogin.message || t('login.resultFailed'),
              })
            }
          } catch (err) {
            /* transient poll failure: keep waiting, the next tick retries */
          }
        }, LOGIN_POLL_MS)
        return () => {
          disposed = true
          clearInterval(timer)
        }
      }, [pollMode, loginId, loginStatus])

      /* ---- CLI installation polling: 1.5s while installing ---- */
      React.useEffect(() => {
        if (pollMode !== 'install') return undefined
        let disposed = false
        const timer = setInterval(async () => {
          try {
            const data = await getJson(STATE_URL)
            if (disposed) return
            if (data && data.ok !== false) setState(data)
          } catch (err) {
            /* transient poll failure: the next tick retries */
          }
        }, INSTALL_POLL_MS)
        return () => {
          disposed = true
          clearInterval(timer)
        }
      }, [pollMode])

      /* ---- manual refresh ---- */
      const refresh = React.useCallback(async () => {
        setBusy('refresh')
        try {
          const data = await getJson(STATE_URL)
          if (data && data.ok === false) throw new Error(data.error || t('errors.stateInvalid'))
          setState(data)
          setLoadError('')
          setAccountError('')
        } catch (err) {
          setLoadError(describeError(t, err))
        } finally {
          setBusy('')
        }
      }, [t])

      /* ---- install action ---- */
      const startInstall = async () => {
        if (installBusy) return
        setInstallBusy(true)
        setInstallRequestError('')
        try {
          const data = await postJson(t, INSTALL_URL, {})
          if (data && data.ok === false) throw new Error(data.error || t('errors.installFailed'))
          const fresh = await getJson(STATE_URL)
          if (fresh && fresh.ok !== false) setState(fresh)
        } catch (err) {
          setInstallRequestError(describeError(t, err))
        } finally {
          setInstallBusy(false)
        }
      }

      /* ---- actions ---- */
      const startLogin = async (mode) => {
        setBusy(mode === 'init' ? 'init' : 'login')
        setAccountError('')
        setLoginResult(null)
        setCopyHint('')
        try {
          const body = { mode: mode }
          if (mode === 'login') {
            const option = findScope(scope)
            if (option.recommend) body.recommend = true
            else body.domains = option.domains
          }
          const data = await postJson(t, LOGIN_START_URL, body)
          if (data && data.ok === false) throw new Error(data.error || t('login.startFailed'))
          const nextLogin = (data && data.login) || null
          if (nextLogin) {
            setState((prev) => (prev ? Object.assign({}, prev, { login: nextLogin }) : prev))
          } else {
            await refresh()
          }
        } catch (err) {
          setAccountError(describeError(t, err))
        } finally {
          setBusy('')
        }
      }

      const cancelLogin = async () => {
        const current = state && state.login
        if (!current || !current.id) return
        setBusy('cancel')
        setAccountError('')
        try {
          const data = await postJson(
            t,
            '/feishu-cli/api/login/' + encodeURIComponent(current.id) + '/cancel',
            {}
          )
          const nextLogin = (data && data.login) || Object.assign({}, current, { status: 'cancelled' })
          setState((prev) => (prev ? Object.assign({}, prev, { login: nextLogin }) : prev))
          setLoginResult(null)
        } catch (err) {
          setAccountError(describeError(t, err))
        } finally {
          setBusy('')
        }
      }

      const doLogout = async () => {
        setBusy('logout')
        setAccountError('')
        setConfirmLogout(false)
        try {
          const data = await postJson(t, LOGOUT_URL, {})
          if (data && data.ok === false) throw new Error(data.error || t('account.logoutFailed'))
          setLoginResult(null)
          const fresh = await getJson(STATE_URL)
          if (fresh && fresh.ok !== false) setState(fresh)
        } catch (err) {
          setAccountError(describeError(t, err))
        } finally {
          setBusy('')
        }
      }

      const copyUrl = async (url) => {
        if (!url) return
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            throw new Error('clipboard unavailable')
          }
          await navigator.clipboard.writeText(url)
          setCopyHint(t('qr.copied'))
        } catch (err) {
          setCopyHint(t('qr.copyFailed'))
        }
      }

      const runCommand = async (raw) => {
        const rawValue = raw === undefined ? command : raw
        const cmd = typeof rawValue === 'string' ? rawValue.trim() : ''
        if (!cmd) {
          setConsoleError(t('console.emptyCommand'))
          return
        }
        setBusy('run')
        setConsoleError('')
        setOutput(null)
        try {
          const data = await postJson(t, RUN_URL, { command: cmd })
          const hasExitCode = data && typeof data.exitCode === 'number'
          if (data && data.ok === false && !hasExitCode) {
            throw new Error(data.error || t('console.failed'))
          }
          setOutput({
            command: cmd,
            exitCode: hasExitCode ? data.exitCode : null,
            stdout: (data && typeof data.stdout === 'string' && data.stdout) || '',
            stderr: (data && typeof data.stderr === 'string' && data.stderr) || '',
            error: '',
          })
          if (data && data.ok === false) {
            setConsoleError(data.error || t('console.failed'))
          }
        } catch (err) {
          const message = describeError(t, err)
          setConsoleError(message)
          setOutput({
            command: cmd,
            exitCode: null,
            stdout: '',
            stderr: '',
            error: message,
          })
        } finally {
          setBusy('')
        }
      }

      const pickQuickCommand = (value) => {
        setCommand(value)
        setConsoleError('')
        if (inputRef.current && typeof inputRef.current.focus === 'function') {
          inputRef.current.focus()
        }
      }

      /* ------------------------------------------------------------------ */
      /* Render helpers                                                     */
      /* ------------------------------------------------------------------ */

      const renderErrorText = (text) => {
        if (!text) return null
        return h('div', { className: 'fcli-err' }, h('span', { 'aria-hidden': 'true' }, '!'), h('span', null, text))
      }

      const renderHeader = () => {
        const refreshLabel = busy === 'refresh' ? t('common.processing') : t('common.refresh')
        return h(
          'div',
          { className: 'fcli-header' },
          h(
            'div',
            { className: 'fcli-brand' },
            h('div', { className: 'fcli-logo' }, h(FeishuMark, { size: 26 })),
            h(
              'div',
              { style: { minWidth: 0 } },
              h('h1', { className: 'fcli-title' }, t('app.title')),
              h('p', { className: 'fcli-sub' }, t('app.subtitle'))
            )
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'fcli-btn fcli-btn--link',
              onClick: refresh,
              disabled: actionsLocked || loading,
            },
            refreshLabel
          )
        )
      }

      const renderStatusBar = () => {
        if (!state) return null
        const cliText = cli.version
          ? String(cli.version)
          : installing
            ? t('status.installingCli')
            : t('status.cliMissing')
        const cliTone = cli.available ? (cli.version ? 'ok' : 'warn') : installing ? 'brand' : 'bad'
        const appText = config.appId ? String(config.appId) : t('status.notInitialized')
        const appTone = config.appId ? 'ok' : ''
        const identityText = auth.loggedIn
          ? t('status.loggedInPrefix') + (auth.userName || t('status.unknownUser'))
          : t('status.notLoggedIn')
        const identityTone = auth.loggedIn ? 'ok' : ''
        return h(
          'div',
          { className: 'fcli-statusbar' },
          h(StatusChip, { tone: cliTone, title: cli.path || '' }, cliText),
          h(StatusChip, { tone: appTone }, appText),
          h(StatusChip, { tone: identityTone }, identityText)
        )
      }

      /* -- CLI missing: three exclusive branches -- */

      const renderInstallMissingCard = () =>
        h(
          'div',
          { className: 'fcli-card' },
          h(
            'div',
            { className: 'fcli-card-head' },
            h(
              'div',
              null,
              h('h2', { className: 'fcli-h2' }, t('install.title')),
              h('p', { className: 'fcli-desc' }, t('install.desc'))
            )
          ),
          cli.path
            ? h(
                'div',
                { className: 'fcli-meta' },
                h('span', { className: 'fcli-mono' }, t('install.configuredPath') + String(cli.path))
              )
            : null,
          h('p', { className: 'fcli-desc' }, t('install.pathHint')),
          renderErrorText(installRequestError),
          renderErrorText(accountError),
          h(
            'div',
            { className: 'fcli-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'fcli-btn fcli-btn--primary',
                onClick: startInstall,
                disabled: installBusy || actionsLocked,
              },
              installBusy ? t('install.starting') : t('install.download')
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'fcli-btn',
                onClick: refresh,
                disabled: installBusy || actionsLocked,
              },
              busy === 'refresh' ? t('common.processing') : t('install.recheck')
            )
          )
        )

      const renderInstallProgressCard = () => {
        const progress =
          cli.installProgress && typeof cli.installProgress === 'object' ? cli.installProgress : null
        const percent = installPercent(progress)
        const received =
          progress && typeof progress.receivedBytes === 'number' ? progress.receivedBytes : null
        const total =
          progress && typeof progress.totalBytes === 'number' && progress.totalBytes > 0
            ? progress.totalBytes
            : null
        const sizeText =
          received === null
            ? ''
            : t('install.sizeReceived') +
              megabytes(received) +
              ' MB' +
              (total === null ? '' : t('install.sizeTotal') + megabytes(total) + ' MB')
        const percentText = percent === null ? '' : Math.round(percent) + '%'
        const barProps = {
          className: 'fcli-progress',
          role: 'progressbar',
          'aria-label': t('install.progressLabel'),
          'aria-valuemin': 0,
          'aria-valuemax': 100,
        }
        if (percent !== null) barProps['aria-valuenow'] = Math.round(percent)
        return h(
          'div',
          { className: 'fcli-card fcli-card--install' },
          h(
            'div',
            { className: 'fcli-card-head' },
            h(
              'div',
              null,
              h('h2', { className: 'fcli-h2' }, t('install.installingTitle')),
              h(
                'p',
                { className: 'fcli-statusline' },
                h(Spinner),
                t(installPhaseKey(cli.installPhase))
              )
            )
          ),
          h(
            'div',
            barProps,
            h('div', {
              className:
                'fcli-progress-fill' + (percent === null ? ' fcli-progress-fill--indeterminate' : ''),
              style: percent === null ? undefined : { width: percent + '%' },
            })
          ),
          sizeText || percentText
            ? h(
                'div',
                { className: 'fcli-meta' },
                sizeText ? h('span', null, sizeText) : null,
                percentText ? h('span', null, percentText) : null
              )
            : null,
          h('p', { className: 'fcli-desc' }, t('install.waitHint'))
        )
      }

      const renderInstallFailedCard = () =>
        h(
          'div',
          { className: 'fcli-alert' },
          h(
            'h2',
            { className: 'fcli-alert-title' },
            h('span', { 'aria-hidden': 'true' }, '!'),
            t('install.failedTitle')
          ),
          h('p', { className: 'fcli-desc' }, t('install.failedDesc')),
          renderErrorText(installError),
          cli.path
            ? h(
                'div',
                { className: 'fcli-meta' },
                h('span', { className: 'fcli-mono' }, t('install.configuredPath') + String(cli.path))
              )
            : null,
          renderErrorText(accountError),
          h(
            'div',
            { className: 'fcli-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'fcli-btn fcli-btn--primary',
                onClick: startInstall,
                disabled: installBusy || actionsLocked,
              },
              installBusy ? t('install.starting') : t('install.retry')
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'fcli-btn',
                onClick: refresh,
                disabled: installBusy || actionsLocked,
              },
              busy === 'refresh' ? t('common.processing') : t('install.recheck')
            )
          )
        )

      const renderAccountCard = () => {
        if (!state) return null

        /* -- CLI is not available yet -- */
        if (!cliAvailable) {
          if (installing) return renderInstallProgressCard()
          if (installError) return renderInstallFailedCard()
          return renderInstallMissingCard()
        }

        /* -- app not initialized -- */
        if (!config.configured) {
          return h(
            'div',
            { className: 'fcli-card' },
            h(
              'div',
              { className: 'fcli-card-head' },
              h(
                'div',
                null,
                h('h2', { className: 'fcli-h2' }, t('init.title')),
                h('p', { className: 'fcli-desc' }, t('init.desc'))
              )
            ),
            renderErrorText(config.error),
            renderErrorText(accountError),
            pending && pending.mode !== 'init'
              ? h('p', { className: 'fcli-statusline' }, h(Spinner), t('login.inProgress'))
              : null,
            h(
              'div',
              { className: 'fcli-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'fcli-btn fcli-btn--primary',
                  onClick: () => startLogin('init'),
                  disabled: actionsLocked || !!pending,
                },
                busy === 'init' ? t('common.processing') : t('init.button')
              ),
              h(
                'button',
                { type: 'button', className: 'fcli-btn', onClick: refresh, disabled: actionsLocked },
                busy === 'refresh' ? t('common.processing') : t('common.refreshStatus')
              )
            )
          )
        }

        /* -- configured but logged out -- */
        if (!auth.loggedIn) {
          return h(
            'div',
            { className: 'fcli-card' },
            h(
              'div',
              { className: 'fcli-card-head' },
              h(
                'div',
                null,
                h('h2', { className: 'fcli-h2' }, t('login.title')),
                h('p', { className: 'fcli-desc' }, t('login.desc'))
              )
            ),
            h(
              'div',
              { className: 'fcli-meta' },
              h('span', { className: 'fcli-mono' }, t('common.appPrefix') + String(config.appId)),
              config.brand ? h('span', null, t('login.brandPrefix') + String(config.brand)) : null
            ),
            h(
              'div',
              { className: 'fcli-field' },
              h('label', { className: 'fcli-label', htmlFor: 'fcli-scope-select' }, t('login.scopeLabel')),
              h(
                'select',
                {
                  id: 'fcli-scope-select',
                  className: 'fcli-select',
                  value: scope,
                  onChange: (event) => setScope(event.target.value),
                  disabled: actionsLocked || !!pending,
                },
                SCOPE_OPTIONS.map((option) =>
                  h('option', { key: option.value, value: option.value }, t(option.labelKey))
                )
              )
            ),
            renderErrorText(config.error),
            renderErrorText(auth.error),
            renderErrorText(accountError),
            pending ? h('p', { className: 'fcli-statusline' }, h(Spinner), t('login.inProgress')) : null,
            h(
              'div',
              { className: 'fcli-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'fcli-btn fcli-btn--primary',
                  onClick: () => startLogin('login'),
                  disabled: actionsLocked || !!pending,
                },
                busy === 'login' ? t('common.processing') : t('login.button')
              ),
              h(
                'button',
                { type: 'button', className: 'fcli-btn', onClick: refresh, disabled: actionsLocked },
                busy === 'refresh' ? t('common.processing') : t('common.refreshStatus')
              )
            )
          )
        }

        /* -- logged in -- */
        const scopeText =
          typeof auth.scopeCount === 'number'
            ? t('account.scopeCountPrefix') + auth.scopeCount + t('account.scopeCountSuffix')
            : t('account.scopeUnknown')
        const expiresText = auth.expiresAt
          ? t('account.expiresPrefix') + formatDateTime(auth.expiresAt)
          : ''
        return h(
          'div',
          { className: 'fcli-card fcli-card--success' },
          h(
            'div',
            { className: 'fcli-card-head' },
            h(
              'div',
              null,
              h('h2', { className: 'fcli-h2' }, t('account.title')),
              h('p', { className: 'fcli-desc' }, t('account.desc'))
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'fcli-btn fcli-btn--danger-text',
                onClick: () => setConfirmLogout(true),
                disabled: actionsLocked || confirmLogout,
              },
              t('account.logout')
            )
          ),
          h(
            'div',
            { className: 'fcli-account' },
            h('div', { className: 'fcli-avatar', 'aria-hidden': 'true' }, initialOf(auth.userName)),
            h(
              'div',
              { style: { minWidth: 0 } },
              h('div', { className: 'fcli-account-name' }, auth.userName || t('account.unknownUser')),
              auth.openId ? h('div', { className: 'fcli-account-id fcli-mono' }, auth.openId) : null
            )
          ),
          h(
            'div',
            { className: 'fcli-meta' },
            config.appId
              ? h('span', { className: 'fcli-mono' }, t('common.appPrefix') + String(config.appId))
              : null,
            auth.appName ? h('span', null, t('account.appNamePrefix') + String(auth.appName)) : null,
            h('span', null, scopeText),
            expiresText ? h('span', null, expiresText) : null
          ),
          confirmLogout
            ? h(
                'div',
                { className: 'fcli-confirm' },
                h('span', null, t('account.logoutConfirm')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fcli-btn fcli-btn--danger',
                    onClick: doLogout,
                    disabled: actionsLocked,
                  },
                  busy === 'logout' ? t('common.processing') : t('account.logoutConfirmYes')
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fcli-btn',
                    onClick: () => setConfirmLogout(false),
                    disabled: busy === 'logout',
                  },
                  t('common.cancel')
                )
              )
            : null,
          renderErrorText(auth.error),
          renderErrorText(config.error),
          renderErrorText(accountError)
        )
      }

      const renderLoginCard = () => {
        if (!pending) return null
        const isInit = pending.mode === 'init'
        const statusText = isInit ? t('qr.waitInit') : t('qr.waitLogin')
        const hasQr = typeof pending.qrDataUrl === 'string' && pending.qrDataUrl.length > 0
        const hasUrl = typeof pending.url === 'string' && pending.url.length > 0
        return h(
          'div',
          { className: 'fcli-card' },
          h(
            'div',
            { className: 'fcli-card-head' },
            h(
              'div',
              null,
              h('h2', { className: 'fcli-h2' }, isInit ? t('qr.titleInit') : t('qr.titleLogin')),
              h('p', { className: 'fcli-statusline' }, h(Spinner), statusText)
            )
          ),
          h(
            'div',
            { className: 'fcli-login' },
            h(
              'div',
              { className: 'fcli-qrbox' },
              hasQr
                ? h('img', {
                    src: pending.qrDataUrl,
                    width: 220,
                    height: 220,
                    alt: t('qr.alt'),
                  })
                : h('span', { className: 'fcli-qr-empty' }, t('qr.preparing'))
            ),
            h(
              'div',
              { className: 'fcli-login-side' },
              h('p', { className: 'fcli-desc' }, t('qr.scanHint')),
              hasUrl
                ? h(
                    'div',
                    {
                      className: 'fcli-url',
                      role: 'button',
                      tabIndex: 0,
                      title: t('qr.copyLink'),
                      onClick: () => copyUrl(pending.url),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          copyUrl(pending.url)
                        }
                      },
                    },
                    h('span', { className: 'fcli-url-text fcli-mono' }, pending.url),
                    h('span', { className: 'fcli-url-hint' }, copyHint || t('qr.copyLink'))
                  )
                : h('p', { className: 'fcli-desc' }, t('qr.noUrl')),
              pending.startedAt
                ? h(
                    'p',
                    { className: 'fcli-desc' },
                    t('qr.startedPrefix') + formatDateTime(pending.startedAt)
                  )
                : null,
              h(
                'div',
                { className: 'fcli-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fcli-btn',
                    onClick: cancelLogin,
                    disabled: actionsLocked,
                  },
                  busy === 'cancel' ? t('common.processing') : t('common.cancel')
                )
              )
            )
          ),
          renderErrorText(accountError)
        )
      }

      const renderResultBar = () => {
        if (!loginResult) return null
        const success = loginResult.kind === 'success'
        return h(
          'div',
          { className: 'fcli-result ' + (success ? 'fcli-result--success' : 'fcli-result--error'), role: 'status' },
          h('span', { className: 'fcli-dot ' + (success ? 'fcli-dot--ok' : 'fcli-dot--bad'), 'aria-hidden': 'true' }),
          h('span', { className: 'fcli-result-text' }, loginResult.text),
          h(
            'button',
            {
              type: 'button',
              className: 'fcli-iconbtn',
              onClick: () => setLoginResult(null),
              'aria-label': t('common.dismiss'),
              title: t('common.dismiss'),
            },
            '×'
          )
        )
      }

      const renderOutput = () => {
        if (!output) return null
        let bodyText = output.error || ''
        if (!bodyText) {
          const parts = []
          if (output.stdout) parts.push(output.stdout)
          if (output.stderr) parts.push('[stderr]\n' + output.stderr)
          bodyText = parts.join('\n')
        }
        if (!bodyText) bodyText = t('console.noOutput')
        const empty = !output.error && !output.stdout && !output.stderr
        let exitLabel = t('console.notRun')
        let exitClass = ''
        if (typeof output.exitCode === 'number') {
          exitLabel = 'exit ' + output.exitCode
          exitClass = output.exitCode === 0 ? ' fcli-exit--ok' : ' fcli-exit--bad'
        }
        return h(
          'div',
          { className: 'fcli-output' },
          h(
            'div',
            { className: 'fcli-output-head' },
            h('span', { className: 'fcli-output-cmd fcli-mono' }, '$ ' + output.command),
            h(
              'span',
              { className: 'fcli-exit' + exitClass },
              h('span', { className: 'fcli-dot' + (typeof output.exitCode === 'number' ? (output.exitCode === 0 ? ' fcli-dot--ok' : ' fcli-dot--bad') : ''), 'aria-hidden': 'true' }),
              exitLabel
            )
          ),
          h('pre', { className: 'fcli-output-body' + (empty ? ' fcli-output-empty' : '') }, bodyText)
        )
      }

      const renderConsoleCard = () => {
        const running = busy === 'run'
        return h(
          'div',
          { className: 'fcli-card' },
          h('h2', { className: 'fcli-h2' }, t('console.title')),
          h('p', { className: 'fcli-desc' }, t('console.desc')),
          h(
            'div',
            { className: 'fcli-console-row' },
            h('input', {
              ref: inputRef,
              className: 'fcli-input fcli-mono',
              type: 'text',
              value: command,
              placeholder: t('console.placeholder'),
              spellCheck: false,
              autoComplete: 'off',
              'aria-label': t('console.inputLabel'),
              onChange: (event) => setCommand(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (!running) runCommand()
                }
              },
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'fcli-btn fcli-btn--primary',
                onClick: () => runCommand(),
                disabled: running,
                title: cliAvailable ? t('console.runTitle') : t('console.cliMissingTitle'),
              },
              running ? t('common.processing') : t('console.run')
            )
          ),
          h(
            'div',
            { className: 'fcli-chips' },
            QUICK_COMMAND_KEYS.map((key) =>
              h(
                'button',
                {
                  key: key,
                  type: 'button',
                  className: 'fcli-chipbtn fcli-mono',
                  onClick: () => pickQuickCommand(t(key)),
                  disabled: running,
                },
                t(key)
              )
            )
          ),
          renderErrorText(consoleError),
          renderOutput()
        )
      }

      const renderFooter = () =>
        h(
          'div',
          { className: 'fcli-footer' },
          t('footer.prefix'),
          h('code', { className: 'fcli-inline-code' }, 'feishu_cli'),
          t('footer.middle'),
          h('code', { className: 'fcli-inline-code' }, 'lark-cli skills list'),
          ' / ',
          h('code', { className: 'fcli-inline-code' }, 'skills read lark-shared')
        )

      const renderSkeleton = () =>
        h(
          'div',
          { className: 'fcli-card' },
          h('p', { className: 'fcli-statusline' }, h(Spinner), t('skeleton.loading')),
          h('div', { className: 'fcli-skel', style: { marginTop: 18, width: '58%' } }),
          h('div', { className: 'fcli-skel', style: { width: '42%' } })
        )

      const renderInitialError = () =>
        h(
          'div',
          { className: 'fcli-card' },
          h('h2', { className: 'fcli-h2' }, t('loadError.title')),
          renderErrorText(loadError || t('common.requestFailed')),
          h(
            'div',
            { className: 'fcli-actions' },
            h(
              'button',
              { type: 'button', className: 'fcli-btn fcli-btn--primary', onClick: refresh, disabled: busy === 'refresh' },
              busy === 'refresh' ? t('common.processing') : t('common.reload')
            )
          )
        )

      return h(
        'div',
        { className: 'fcli-root' },
        h('style', null, CSS_TEXT),
        h(
          'div',
          { className: 'fcli-inner' },
          renderHeader(),
          renderStatusBar(),
          loadError && state
            ? h(
                'div',
                { className: 'fcli-err' },
                h('span', null, t('loadError.refreshPrefix') + loadError),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fcli-btn fcli-btn--link',
                    onClick: refresh,
                    disabled: busy === 'refresh',
                    style: { marginLeft: 'auto', padding: '0 4px' },
                  },
                  t('common.retry')
                )
              )
            : null,
          loading && !state ? renderSkeleton() : null,
          !loading && !state ? renderInitialError() : null,
          state ? renderAccountCard() : null,
          renderLoginCard(),
          renderResultBar(),
          renderConsoleCard(),
          renderFooter()
        )
      )
    }

    /* ------------------------------------------------------------------ */
    /* Plugin registration                                                */
    /* ------------------------------------------------------------------ */

    function apply(ctx) {
      const locale = ctx && ctx.locale

      if (locale && typeof locale.register === 'function') {
        ctx.effect(() => {
          const disposers = []
          const disposeZh = locale.register(LOCALE_NS, 'zh', ZH_DICT)
          if (typeof disposeZh === 'function') disposers.push(disposeZh)
          const disposeEn = locale.register(LOCALE_NS, 'en', EN_DICT)
          if (typeof disposeEn === 'function') disposers.push(disposeEn)
          return () => {
            for (let i = 0; i < disposers.length; i += 1) disposers[i]()
          }
        }, 'dsh-feishu-cli: locale')
      }

      let t = null
      if (locale && typeof locale.bind === 'function') {
        try {
          t = locale.bind(LOCALE_NS)
        } catch (err) {
          t = null
        }
      }
      if (typeof t !== 'function') t = defaultTranslate

      ctx.effect(() => {
        const disposeIcon = ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'feishu-cli',
              order: 20,
              label: () => t('sidebar.label'),
            },
            SidebarIcon
          )
        )
        const disposePanel = ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'feishu-cli',
            },
            (slotProps) => h(FeishuPanel, Object.assign({}, slotProps, { t: t }))
          )
        )
        return () => {
          if (typeof disposeIcon === 'function') disposeIcon()
          if (typeof disposePanel === 'function') disposePanel()
        }
      }, 'dsh-feishu-cli: slots')
    }

    return {
      inject: ['slots', 'locale'],
      apply: apply,
    }
  },
})

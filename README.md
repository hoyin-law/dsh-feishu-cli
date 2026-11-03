# 飞书 CLI · DSH 插件（dsh-feishu-cli）

[English](README.en.md) · 简体中文

把[飞书官方 CLI](https://github.com/larksuite/cli)（`lark-cli`）接入 DeepSeek Harness（DSH）Desktop / Web：侧边栏多一个「飞书」面板，用二维码完成账号登录，Agent 也能直接执行任意 `lark-cli` 命令。

> 这是一个社区插件，不是飞书或 DeepSeek 官方发布的产品。插件调用的是飞书官方 CLI，但登录、授权与命令执行都以你自己的飞书账号权限为准。

## 这个插件是什么

- **一个 DSH 插件**：给 DSH 的 Web UI 增加「飞书」侧边栏入口和主面板，同时给 Agent 注册 `feishu_cli`、`feishu_auth` 两个工具。
- **一层官方 CLI 的封装**：真正调用飞书的是官方 `lark-cli`。插件负责找到并运行它、读取它的状态、把登录二维码和命令结果搬进面板与对话。
- **能力边界与 CLI 一致**：CLI 能做的事它都能做，CLI 不能做的事它也不额外承诺。

## 功能

- **应用初始化**：没有飞书应用时，面板提供「初始化飞书应用」，走官方 CLI 的一键建应用流程，扫码或打开链接即可完成。
- **账号登录**：面板提供「点击登录飞书账号」，展示登录二维码和授权链接；登录完成后面板自动刷新为「已登录」。
- **权限范围可选**：登录时可以选择全部常用权限，或只申请需要的业务域（消息、日历、云文档、多维表格、邮箱、任务、会议、通讯录等）。
- **身份状态**：展示当前应用 App ID、登录用户、Open ID、已授权 scope 数量与过期时间，支持退出登录和取消进行中的登录。
- **命令控制台**：在面板里直接执行 `lark-cli` 命令，输出以等宽文本展示；提供常用命令快捷入口。
- **CLI 安装引导**：首次使用时如果本机没有 `lark-cli`，面板会显示「下载并安装飞书 CLI」，并提示下载约 50MB，过程有进度和阶段提示。
- **Agent 工具**：`feishu_cli` 执行任意 `lark-cli` 命令，`feishu_auth` 处理登录状态、发起登录、等待登录、退出和用户列表。
- **中文 / 英文界面**：跟随 DSH 的语言设置。

覆盖面来自官方 CLI：消息 `im`、云文档 `docs`、多维表格 `base`、电子表格 `sheets`、日历 `calendar`、邮箱 `mail`、任务 `task`、会议 `vc`、OKR、审批 `approval`、通讯录 `contact`、云空间 `drive`、知识库 `wiki`、妙搭 `apps` 等 **18 个业务域、200+ 高层命令（`+shortcut`）**，以及通过 `lark-cli api` 调用的**全量 OpenAPI**。

## 环境要求

- DeepSeek Harness Desktop 或 `dsh web`，且能安装 profile bundle。
- Windows（x64 / ARM64）、macOS（Intel / Apple 芯片）、Linux（x64 / ARM64 / RISC-V）。
- 首次使用需要联网下载对应平台的官方 `lark-cli`（约 50MB）。
- 一个飞书 / Lark 账号；在企业租户中，创建自建应用或授予 scope 可能需要管理员审批。

## 安装

推荐从 GitHub 安装（`main` 分支源码包）：

```bash
# Desktop 用户把 web 换成 desktop
dsh plugin --profile web add github:hoyin-law/dsh-feishu-cli
```

```bash
# DSH Desktop
dsh plugin --profile desktop add github:hoyin-law/dsh-feishu-cli
```

如果已经发布到 npm，也可以按包名安装：

```bash
dsh plugin --profile web add dsh-feishu-cli
```

不想从源码安装时，可以下载 [v1.0.0 Release](https://github.com/hoyin-law/dsh-feishu-cli/releases/tag/v1.0.0) 里的 `dsh-feishu-cli.tgz`，然后本地安装：

```bash
dsh plugin --profile web add ./dsh-feishu-cli.tgz
```

安装完成后重启 DSH，侧边栏会出现「飞书」图标。卸载：

```bash
dsh plugin --profile web remove dsh-feishu-cli
```

## 首次使用：两步扫码

1. **初始化应用**（仅第一次）：打开侧边栏「飞书」→ 在「第 1 步 · 初始化飞书应用」卡片点「初始化飞书应用（约 1 分钟）」→ 浏览器打开飞书授权页或扫码 → 按提示创建应用并授权。完成后应用会保存到本机的 `lark-cli` 配置里。
2. **登录账号**：在「登录飞书账号」卡片点「点击登录飞书账号」→ 用飞书 App 扫描面板中的二维码，或打开面板里的链接 → 在手机上确认授权。面板显示「已登录 · 你的名字」即完成。

之后每次使用只需要第 2 步；登录态过期时面板会提示重新登录。

> 两阶段都是官方 CLI 的流程：初始化创建的是**你自己的**飞书自建应用，账号登录授权的是**你自己的**飞书用户身份。

## 使用

### 面板

- **账号卡**：查看应用与登录状态，登录 / 退出 / 取消登录。
- **命令控制台**：输入 `lark-cli` 之后的命令，例如：
  - `calendar +agenda` — 今日议程
  - `task +list` — 我的任务
  - `im +chats-list` — 群列表
  - `docs +search --query 周报` — 搜索云文档
  - `base +records-list --app-token xxx --table-id xxx` — 读取多维表格记录
  - `api GET /open-apis/calendar/v4/calendars` — 直接调用 OpenAPI
- **快捷命令**：把常用命令一键填入输入框。

### Agent 工具

`feishu_cli`：执行任意 `lark-cli` 命令。

```text
feishu_cli command="calendar +agenda"
feishu_cli command="im +messages-send --chat-id oc_xxx --text 你好"
feishu_cli command="docs +search --query 周报"
feishu_cli command="api GET /open-apis/calendar/v4/calendars"
```

参数：`command`（必填，`lark-cli` 之后的完整 argv 字符串，支持引号，不经过 shell）、`cwd`（可选，命令工作目录）、`timeout_ms`（可选，默认 120000，范围 1000–600000）、`stdin`（可选，写入子进程标准输入）。

`feishu_auth`：处理登录与身份。

```text
feishu_auth action="status"                     # 查看 CLI / 应用 / 登录状态
feishu_auth action="login_start" mode="init"    # 发起应用初始化
feishu_auth action="login_start" mode="login"   # 发起账号登录，返回链接、二维码和 login_id
feishu_auth action="login_wait" login_id="..."  # 等待用户在手机上完成授权
feishu_auth action="logout"                     # 退出登录
feishu_auth action="list"                       # 已登录用户列表
feishu_auth action="login_cancel" login_id="..." # 取消进行中的登录
```

约定：

- 默认输出 JSON，成功看 `ok == true`（或退出码 0）。
- 写操作可以先用 `--dry-run` 预览。
- 退出码 `10` 表示 `high-risk-write`：必须由你确认后，在命令末尾加 `--yes` 重试。
- 路径参数只接受命令工作目录下的相对路径；需要别的目录时用 `cwd` 参数。
- 命令不经过 shell，管道、重定向、`&&` 不会生效；请把要做的事交给 CLI 自己的参数完成。

## 飞书 CLI 从哪来

- **推荐方式**：首次使用时由面板下载对应平台的官方 `lark-cli` 1.0.98，解压后保存到 `~/.dsh/feishu-cli/bin`（实际路径为 `$DSH_HOME/feishu-cli/bin`），下载完成后按内置的 SHA-256 校验值验证文件完整性，再以可执行权限运行。
- **下载源**：优先使用 npmmirror 二进制镜像，失败时回退到 GitHub Releases；下载包约 50MB。
- **手动指定已有二进制**：设置环境变量 `LARK_CLI_BIN`（完整路径），或用兼容别名 `LARK_CLI_PATH`。适合离线环境、企业内网，或你已经自己装了 `lark-cli` 的情况。也可以直接把 `lark-cli` 放进 `PATH`。
- **企业 / 离线部署**：用 `FEISHU_CLI_HOME` 改安装根目录；用 `FEISHU_CLI_DOWNLOAD_BASE` 指定一个或多个下载源前缀（英文逗号分隔），插件会依次尝试。

查找顺序：`LARK_CLI_BIN` → `LARK_CLI_PATH` → 下载目录 `~/.dsh/feishu-cli/bin` → 旧版 `vendor/` 目录 → `PATH`。

> 插件当前不提供图形化的 Config 设置页；可执行文件位置通过上述环境变量、下载目录或 `PATH` 控制。

## 安全与权限

- **以你自己的飞书身份操作**：Agent 用你登录时授权的用户身份调用飞书 API，权限范围就是你授予的 scopes。请按需选择最小范围。
- **高风险写操作要确认**：删除文档、撤回消息等命令会以退出码 `10` 拒绝执行，需要你明确确认后加 `--yes` 重试。插件不会自动替你确认。
- **凭据由 `lark-cli` 管理**：应用凭据和登录 token 由官方 CLI 存在 `~/.lark-cli`，token 使用操作系统的凭据存储；插件本身不额外保存 app secret 或 access token，也不会把它们写进日志。
- **本地 Web API 有同源保护**：面板调用的 `/feishu-cli/api/*` 只接受同源、`application/json` 的 POST 请求。
- **安装第三方插件前请审阅源码**：本插件不是官方认证插件，代码以你的用户权限运行。不使用时可以随时卸载。

更多说明见 [SECURITY.md](SECURITY.md) 和 [PRIVACY.md](PRIVACY.md)。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 提示找不到 `lark-cli` | 在面板点「下载并安装飞书 CLI」重试；或设置 `LARK_CLI_BIN` 指向已有二进制；或把 `lark-cli` 放进 `PATH` |
| CLI 下载失败 / 校验失败 | 检查网络或代理后重试；内网环境可用 `FEISHU_CLI_DOWNLOAD_BASE` 指向内部镜像，或手动下载后通过 `LARK_CLI_BIN` 指定 |
| 二维码不显示或扫不出来 | 点「刷新」重试；也可以直接打开面板里的授权链接，在浏览器里完成 |
| 登录后提示权限不足 | 退出登录，重新登录时选择更多业务域；企业租户还需管理员批准相应 scope |
| 企业应用创建失败 | 企业租户可能限制自建应用创建；请联系飞书管理员在开放平台开通权限，或使用有权限的账号 |
| 授权页打不开 | 检查网络 / 代理；用手机飞书扫码通常可以绕开浏览器网络问题 |
| 命令报 `unsafe file path` | 文件参数只接受当前工作目录下的相对路径，先 `cd` 到目标目录或用工具参数 `cwd` |
| 命令退出码 `10` | 高风险写操作，向你确认后加 `--yes` 重试 |
| 侧边栏没有「飞书」 | 确认插件已安装并在 profile 中启用，重启 DSH；检查 DSH 的插件列表 |
| 面板状态一直不刷新 | 退出面板重新打开；确认 DSH 后端仍在运行，查看 DSH 日志 |

## 已知限制

- **Meegle（飞书项目）不在覆盖范围内**：它需要单独的 `meegle-cli`，本插件只封装 `lark-cli`。
- **能力取决于权限**：某些 API 需要特定 scope 或企业管理员审批；插件不会也不能绕过飞书权限模型。
- **命令语法以官方 CLI 为准**：不同 `lark-cli` 版本可能有命令差异，先 `<domain> --help` 或用 `schema <service.resource.method>` 查询。
- **不提供 shell**：`feishu_cli` 直接 `spawn` 子进程，不解释管道、重定向或环境变量展开。
- **无图形化设置页**：当前没有 Config 表单；可执行文件路径用环境变量控制。
- **社区插件**：本项目不声称是飞书或 DeepSeek 官方认证插件，也不提供官方支持。

## 开发与测试

插件没有构建步骤，源码即产物。修改后可以做语法检查和测试：

```bash
node --check index.js
node --check lib/cli.js
node --check lib/install.js
node --check lib/api.js
node --check lib/client.js
node --test tests/*.test.mjs
```

本地开发安装：

```bash
dsh plugin --profile web add /path/to/feishu-cli-plugin
```

## 目录结构

```text
feishu-cli-plugin/
├── index.js              # Host 入口：Agent 工具 / 系统提示 / Web API 挂载
├── lib/
│   ├── cli.js            # lark-cli 定位、执行、状态读取与登录会话
│   ├── install.js        # 运行时下载并校验 lark-cli
│   ├── api.js            # /feishu-cli Web API
│   └── client.js         # 浏览器端：侧边栏图标与主面板
├── locale/               # 插件元数据（zh / en）
├── icon.svg
├── cordis.patch.yml
├── tests/                # node:test 单元测试
├── docs/                 # 截图等发布资料
├── market/               # awesome-dsh-plugin 条目草稿
├── screenshots.json      # 市场截图清单
├── README.md
├── README.en.md
├── SECURITY.md
├── PRIVACY.md
├── CHANGELOG.md
├── PUBLISHING.md
└── LICENSE
```

`lark-cli` 二进制不随仓库提交：仓库和 npm 包都不包含它，首次使用时下载到 `~/.dsh/feishu-cli/bin`。

## 许可证

插件代码以 MIT 许可发布，见 [LICENSE](LICENSE)。

插件使用的 [飞书官方 CLI](https://github.com/larksuite/cli) 同样以 MIT 许可发布，版权归 Lark Technologies Pte. Ltd.。CLI 的下载与校验信息见 `vendor/README.md` 和 `vendor/LICENSE-lark-cli.txt`。

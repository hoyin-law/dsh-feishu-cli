# Changelog

本文件记录 dsh-feishu-cli 的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-11-04

首个公开发布。

### 新增

- 侧边栏「飞书」面板：应用与登录状态、登录二维码、授权链接、退出登录、取消登录。
- 首次使用引导：一键初始化飞书应用（`config init --new`）与账号登录（二维码 / device code）两阶段流程。
- 登录权限范围选择：可使用全部常用权限，或按业务域授权。
- 命令控制台：在面板内执行任意 `lark-cli` 命令，输出等宽展示；提供常用命令快捷入口。
- CLI 安装引导：首次使用时下载约 50MB 的官方 `lark-cli` 到 `~/.dsh/feishu-cli/bin`，带下载进度与阶段提示，下载后按 SHA-256 校验。
- Agent 工具 `feishu_cli`：执行任意 `lark-cli` 命令，支持 `command` / `cwd` / `timeout_ms` / `stdin` 参数。
- Agent 工具 `feishu_auth`：`status` / `login_start` / `login_wait` / `login_cancel` / `logout` / `list`。
- 系统提示片段：向模型说明如何驱动 CLI、如何判断结果，以及退出码 `10`（high-risk-write）需要用户确认。
- 本地 Web API：`/feishu-cli/api/state`、`/login/start`、`/login/<id>`、`/login/<id>/cancel`、`/logout`、`/run`、`/cli/install`；POST 使用 JSON 并做同源校验。
- 中英文界面文案。
- Windows / macOS / Linux 支持；可通过 `LARK_CLI_BIN` / `LARK_CLI_PATH` 指定已有的 `lark-cli`。
- 发布资料：README（中/英）、SECURITY、PRIVACY、PUBLISHING、CHANGELOG、CI 工作流与市场条目草稿。

### 说明

- 插件不额外保存飞书凭据；应用凭据与登录 token 由官方 `lark-cli` 管理（`~/.lark-cli`）。
- Meegle（飞书项目）不在本插件覆盖范围内，需要单独的 `meegle-cli`。

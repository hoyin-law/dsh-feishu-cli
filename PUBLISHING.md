# 发布指南（Publishing）

本文件记录把 dsh-feishu-cli 发布到 GitHub、npm（可选）与 awesome-dsh-plugin 的步骤。命令以仓库根目录为当前目录。

## 0. 发布前检查

```bash
# 语法检查（lib/install.js 存在后也应加入）
for f in index.js lib/cli.js lib/install.js lib/api.js lib/client.js; do
  [ -f "$f" ] && node --check "$f"
done

# 单元测试
node --test tests/*.test.mjs
```

检查 `package.json`（发布人员负责，不在本指南范围内修改）：

- `version` 为 `1.0.0`（当前已是）；
- `private` 为 `false`（当前已是，否则 `npm publish` 会被拒绝）；
- `files` 列出实际要发布的内容：`index.js`、`lib/*.js`（含 `lib/install.js`）、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、发布文档、`screenshots.json`、`docs/*.png`、`vendor/README.md`、`vendor/checksums.txt`、`vendor/LICENSE-lark-cli.txt`、`LICENSE`；
- **不要**把 `vendor/lark-cli.exe` 放进 `files`：CLI 由运行时下载，仓库与 npm 包都不携带二进制；
- `repository`、`homepage`、`bugs`、`engines.dsh` 已配置，无需再改；
- `keywords` 已包含 `dsh-plugin`、`deepseek-harness`、`feishu`、`lark`、`lark-cli`。

同时确认：

- [ ] `screenshots.json` 中的图片已放进 `docs/`（`docs/screenshot-main.png`、`docs/screenshot-login.png`）；
- [ ] `market/hoyin-law__dsh-feishu-cli.yml` 的描述与代码实际能力一致；
- [ ] `README.md` / `README.en.md` 的安装命令、目录结构与当前代码一致；
- [ ] `CHANGELOG.md` 已记录本次版本。

## 1. 创建 GitHub 仓库并推送

仓库地址：<https://github.com/hoyin-law/dsh-feishu-cli>

```bash
git init
git add .
git commit -m "feat: dsh-feishu-cli 1.0.0"
git branch -M main
git remote add origin git@github.com:hoyin-law/dsh-feishu-cli.git
git push -u origin main
```

注意：

- `.gitignore` 已排除 `vendor/lark-cli.exe`、`node_modules/`、`*.log`、`*.tgz`、`.DS_Store`、`coverage/` 等；确认 `git status` 里没有 50MB 的二进制或本地日志。
- 仓库描述建议：`Feishu/Lark CLI for DeepSeek Harness: QR sign-in panel, command console, and agent tools (18 domains, 200+ commands, full OpenAPI).`

## 2. 添加 `dsh-plugin` topic

在 GitHub 仓库页面 **About → Topics** 添加：

```text
dsh-plugin
```

可选补充：`deepseek-harness`、`feishu`、`lark`、`lark-cli`。

## 3. 等待仓库满 1 天

awesome-dsh-plugin 的自动检查要求**仓库创建满 1 天**（不是提交数门槛）。刚创建的仓库立刻提交 PR 会被 CI 拒绝；等满 24 小时后再提。

期间可以：

- 补测试、跑一遍 CI；
- 在真实环境验证两条安装命令；
- 更新 README 截图。

## 4. 验证安装

在干净的 profile 上验证 GitHub 安装：

```bash
dsh plugin --profile web add github:hoyin-law/dsh-feishu-cli
```

DSH Desktop 用 `--profile desktop`。安装后重启 DSH，确认：

- [ ] 侧边栏出现「飞书」；
- [ ] 首次打开面板能下载 / 检测到 `lark-cli`；
- [ ] 应用初始化与账号登录两步都能完成（或能取消）；
- [ ] 命令控制台能执行 `calendar +agenda`；
- [ ] Agent 工具 `feishu_cli`、`feishu_auth` 可用。

## 5. 发布到 npm（可选）

不发 npm 也能通过 GitHub 安装；npm 包的好处是预构建安装，跳过源码构建授权步骤。

```bash
npm login
npm publish --access public
```

验证：

```bash
npm view dsh-feishu-cli version
dsh plugin --profile web add dsh-feishu-cli
```

注意：

- 确认 `package.json` 已移除 `"private": true`，且 `files` 不包含 `vendor/lark-cli.exe`；
- 若使用 2FA，按 npm 提示输入一次性验证码；
- 发布后不能覆盖同名版本，只能升级 `version` 再发；
- 如需在 CI 中发布，使用 npm Trusted Publishing（OIDC）或 `NPM_TOKEN` secret，不要把 token 提交进仓库。

## 6. 提交 awesome-dsh-plugin 条目

上游仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>

规则要点（以该仓库 `contributing.md` 为准）：

- 一个 PR 只新增**一个**文件：`data/plugins/<owner>__<repo>.yml`；
- 本次发布对应文件：`data/plugins/hoyin-law__dsh-feishu-cli.yml`；
- 只允许 `url` / `name` / `category` / `description` 等字段，本项目的条目内容见 `market/hoyin-law__dsh-feishu-cli.yml`；
- `category` 必须使用**分类 id**，不是显示名：本插件使用 `notify`，在站点上显示为 **Notifications & Integrations**（通知与集成）；
- `description.en` 必填，`description.zh` 可选但建议提供；
- 仓库需声明 `dsh.bundle` manifest（本项目已有 `cordis.patch.yml`）；
- 仓库需满 1 天，且已添加 `dsh-plugin` topic；
- 描述必须与代码一致，不写营销词、不写未实现的功能。

操作步骤：

```bash
# 1. Fork 上游仓库并在本地 clone fork
git clone git@github.com:<your-account>/awesome-dsh-plugin.git
cd awesome-dsh-plugin

# 2. 复制条目（文件名必须与仓库对应）
cp /path/to/feishu-cli-plugin/market/hoyin-law__dsh-feishu-cli.yml \
   data/plugins/hoyin-law__dsh-feishu-cli.yml

# 3. 不要手工编辑 README（由脚本生成）
git checkout -b add-dsh-feishu-cli
git add data/plugins/hoyin-law__dsh-feishu-cli.yml
git commit -m "Add hoyin-law/dsh-feishu-cli"
git push origin add-dsh-feishu-cli
```

然后在 GitHub 上向上游开 PR，标题形如 `Add hoyin-law/dsh-feishu-cli`，正文按上游 PR 模板填写。

## 7. 发布后

- 在 GitHub 打 tag 并创建 Release：`v1.0.0`，附 `CHANGELOG.md` 对应段落；
- 如需给市场提供预构建包，可把 `npm pack` 生成的 `.tgz` 附到 Release，并在条目中加 `tarball:`；
- 截图更新只需推送到本仓库；市场下一次构建会自动读取 `screenshots.json`，无需再提 PR；
- 安全或隐私相关变更同步更新 `SECURITY.md` / `PRIVACY.md` / `CHANGELOG.md`。

## 回滚

- npm：`npm unpublish dsh-feishu-cli@1.0.0`（24 小时内可完全删除；之后需联系 npm 支持），或发布新的修复版本；
- GitHub：删除 tag / Release，必要时 revert 提交；
- awesome-dsh-plugin：向该仓库提 PR 修改或删除自己的条目；
- 用户侧：`dsh plugin --profile web remove dsh-feishu-cli`。
